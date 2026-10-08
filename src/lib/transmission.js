import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nodeIdFromPublicKey, sha256, verifySignature } from './identity.js';

const STORE_FILE = 'transmissions.json';
const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_32 = /^[0-9a-f]{32}$/;

// Control characters other than tab and newline
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

/**
 * The exact bytes a transmission's id and signature are computed over.
 */
export const canonicalTransmission = (t) =>
  JSON.stringify([t.author, t.publicKey, t.content, t.timestamp, t.consciousness]);

/**
 * Check a transmission from anywhere (a peer, the disk) before trusting it.
 * Returns { ok: true, transmission } with a clean copy, or { ok: false, reason }.
 */
export function verifyTransmission(candidate, config, now = Date.now()) {
  const fail = (reason) => ({ ok: false, reason });

  if (!candidate || typeof candidate !== 'object') return fail('malformed');

  const { id, author, publicKey, content, timestamp, consciousness, signature } = candidate;

  if (typeof id !== 'string' || !HEX_64.test(id)) return fail('malformed');
  if (typeof author !== 'string' || !HEX_32.test(author)) return fail('malformed');
  if (typeof publicKey !== 'string' || publicKey.length > 128) return fail('malformed');
  if (typeof signature !== 'string' || signature.length > 128) return fail('malformed');
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return fail('malformed');
  if (typeof consciousness !== 'number' || !(consciousness >= 0 && consciousness <= 1)) return fail('malformed');
  if (typeof content !== 'string' || content.length === 0) return fail('malformed');
  if (content.length > config.transmission.maxLength) return fail('too_long');

  if (timestamp > now + config.transmission.maxFutureSkew) return fail('from_the_future');
  if (now - timestamp >= config.transmission.lifetime) return fail('expired');

  const transmission = { id, author, publicKey, content, timestamp, consciousness, signature };
  const canonical = canonicalTransmission(transmission);

  if (nodeIdFromPublicKey(publicKey) !== author) return fail('identity_mismatch');
  if (sha256(canonical) !== id) return fail('id_mismatch');
  if (!verifySignature(canonical, signature, publicKey)) return fail('bad_signature');

  return { ok: true, transmission };
}

/**
 * TransmissionHandler
 * Creates, verifies, holds and forgets the signals passing through this node.
 */
export class TransmissionHandler extends EventEmitter {
  constructor(config, { now = Date.now } = {}) {
    super();

    this.config = config;
    this.now = now;
    this.file = path.join(config.dataDir, STORE_FILE);

    // Transmissions this node is currently holding, by id
    this.transmissions = new Map();

    // Ids that were already handled, so a signal dropped for space is not
    // welcomed back as new
    this.seen = new Set();
    this.maxSeen = Math.max(5000, config.transmission.maxStored * 5);

    this.metrics = {
      created: 0,
      received: 0,
      rejected: 0,
      decayed: 0
    };

    this._saveTimer = null;
    this._saving = Promise.resolve();
  }

  /**
   * Restore whatever survived on disk
   */
  async initialize(identity) {
    this.identity = identity;
    await mkdir(this.config.dataDir, { recursive: true });

    let stored = [];
    try {
      stored = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`⚠ could not read ${this.file}, starting empty: ${error.message}`);
      }
    }

    const now = this.now();
    for (const candidate of Array.isArray(stored) ? stored : []) {
      const result = verifyTransmission(candidate, this.config, now);
      if (result.ok) this._hold(result.transmission);
    }
    this._enforceCapacity();
  }

  /**
   * Sign a new transmission from this node and start holding it
   */
  create(content, consciousness) {
    const text = this.normalizeContent(content);

    const transmission = {
      author: this.identity.id,
      publicKey: this.identity.publicKey,
      content: text,
      timestamp: this.now(),
      consciousness: Math.round(Math.min(1, Math.max(0, consciousness)) * 1000) / 1000
    };

    const canonical = canonicalTransmission(transmission);
    transmission.id = sha256(canonical);
    transmission.signature = this.identity.sign(canonical);

    this._hold(transmission);
    this._enforceCapacity();
    this._scheduleSave();
    this.metrics.created++;

    return transmission;
  }

  /**
   * Take in a transmission that arrived from another node.
   * Returns { status: 'new' | 'duplicate' | 'rejected', reason?, transmission? }.
   */
  accept(candidate) {
    if (candidate && typeof candidate.id === 'string' && this.seen.has(candidate.id)) {
      return { status: 'duplicate' };
    }

    const result = verifyTransmission(candidate, this.config, this.now());
    if (!result.ok) {
      this.metrics.rejected++;
      return { status: 'rejected', reason: result.reason };
    }

    this._hold(result.transmission);
    this._enforceCapacity();
    this._scheduleSave();
    this.metrics.received++;

    return { status: 'new', transmission: result.transmission };
  }

  /**
   * Clean up user input. Throws an Error with a `status` for the HTTP layer.
   */
  normalizeContent(content) {
    const reject = (message) => Object.assign(new Error(message), { status: 400 });

    if (typeof content !== 'string') throw reject('A transmission needs text content');

    const text = content.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim();
    if (!text) throw reject('The void does not accept empty transmissions');
    if (text.length > this.config.transmission.maxLength) {
      throw reject(`Transmission exceeds ${this.config.transmission.maxLength} characters`);
    }
    return text;
  }

  /** How much of a transmission is left: 1 when new, 0 when fully decayed. */
  vitality(transmission, at = this.now()) {
    const age = at - transmission.timestamp;
    return Math.min(1, Math.max(0, 1 - age / this.config.transmission.lifetime));
  }

  /** Held transmissions, newest first. */
  list() {
    return [...this.transmissions.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  has(id) {
    return this.transmissions.has(id);
  }

  get size() {
    return this.transmissions.size;
  }

  /**
   * Let fully decayed transmissions go. Returns the ids that dissolved.
   */
  prune() {
    const now = this.now();
    const dissolved = [];

    for (const [id, transmission] of this.transmissions) {
      if (now - transmission.timestamp >= this.config.transmission.lifetime) {
        this.transmissions.delete(id);
        dissolved.push(id);
      }
    }

    if (dissolved.length > 0) {
      this.metrics.decayed += dissolved.length;
      this._scheduleSave();
      this.emit('transmission:decayed', dissolved);
    }
    return dissolved;
  }

  _hold(transmission) {
    this.transmissions.set(transmission.id, transmission);
    this.seen.add(transmission.id);

    if (this.seen.size > this.maxSeen) {
      for (const id of this.seen) {
        if (this.seen.size <= this.maxSeen) break;
        if (!this.transmissions.has(id)) this.seen.delete(id);
      }
    }
  }

  /** When over capacity the oldest signals are released first. */
  _enforceCapacity() {
    const excess = this.transmissions.size - this.config.transmission.maxStored;
    if (excess <= 0) return;

    const oldest = [...this.transmissions.values()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, excess);

    for (const transmission of oldest) this.transmissions.delete(transmission.id);
    this.emit('transmission:decayed', oldest.map((t) => t.id));
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flush().catch((error) => console.warn(`⚠ could not persist transmissions: ${error.message}`));
    }, 500);
    this._saveTimer.unref?.();
  }

  /**
   * Write held transmissions to disk now (atomic: temp file, then rename)
   */
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }

    this._saving = this._saving.catch(() => {}).then(async () => {
      const temp = `${this.file}.tmp`;
      await mkdir(this.config.dataDir, { recursive: true });
      await writeFile(temp, JSON.stringify(this.list()));
      await rename(temp, this.file);
    });
    return this._saving;
  }
}

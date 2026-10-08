import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { normalizePeerUrl } from '../../config.js';
import { nodeIdFromPublicKey, verifySignature } from './identity.js';
import { QuantumState } from './quantum_state.js';

const HEX_32 = /^[0-9a-f]{32}$/;

// Per-link message budget: a burst allowance that refills over time
const BUCKET_CAPACITY = 400;
const BUCKET_REFILL_PER_SECOND = 100;

// Invalid transmissions tolerated from one peer before the link is cut
const MAX_STRIKES = 5;

const EXCHANGE_INTERVAL = 60000;
const ADDRESS_FILE = 'peers.json';
const MAX_BUFFERED = 4 * 1024 * 1024;

/** What a node signs to prove it holds the key behind its id. */
const proofPayload = (nonce, challengerId, proverId) =>
  `ghost_net:proof:${nonce}:${challengerId}:${proverId}`;

/**
 * PeerNetwork
 * Manages entanglement between ghost_net nodes: dialing, the identity
 * handshake, heartbeats, peer exchange and broadcast.
 */
export class PeerNetwork extends EventEmitter {
  constructor(config, { now = Date.now } = {}) {
    super();

    this.config = config;
    this.now = now;

    // Entangled (verified) peers by node id
    this.peers = new Map();

    // Every open socket, verified or still shaking hands
    this.links = new Set();

    // Addresses this node knows how to dial
    this.addresses = new Map();

    this.metrics = {
      totalEntanglements: 0,
      rejectedHandshakes: 0,
      messagesIn: 0,
      messagesOut: 0
    };

    this.stopped = false;
    this._lastHeartbeat = 0;
    this._lastExchange = 0;

    this.addressFile = path.join(config.dataDir, ADDRESS_FILE);
    this._saving = Promise.resolve();
  }

  /**
   * Begin reaching out to the network.
   * hooks.getConsciousness() -> current local level
   * hooks.getTransmissions() -> transmissions to hand a newly entangled peer
   */
  async initialize(identity, hooks) {
    this.identity = identity;
    this.hooks = hooks;

    for (const url of this.config.peer.bootstrap) {
      this._learnAddress(url, { bootstrap: true });
    }

    // Addresses that answered before, so a restarted node can find its way
    // back without its bootstrap nodes
    if (this.config.peer.exchange) {
      for (const url of await this._loadAddresses()) {
        if (this._learnAddress(url)) this.addresses.get(url).proven = true;
      }
    }

    const interval = Math.min(1000, this.config.peer.heartbeatInterval);
    this._timer = setInterval(() => this._tick(), interval);
    this._timer.unref?.();
    this._tick();

    this.emit('network:initialized', { nodeId: identity.id, timestamp: this.now() });
  }

  // ---------------------------------------------------------------------
  // Dialing
  // ---------------------------------------------------------------------

  _learnAddress(value, { bootstrap = false } = {}) {
    const url = normalizePeerUrl(value);
    if (!url || url === this.config.publicUrl) return false;

    const known = this.addresses.get(url);
    if (known) {
      known.bootstrap ||= bootstrap;
      return false;
    }
    if (!bootstrap && this.addresses.size >= this.config.peer.maxKnownAddresses) return false;

    this.addresses.set(url, {
      bootstrap,
      peerId: null,
      link: null,
      failures: 0,
      nextAttempt: 0,
      self: false,
      proven: false
    });
    return true;
  }

  async _loadAddresses() {
    try {
      const stored = JSON.parse(await readFile(this.addressFile, 'utf8'));
      return Array.isArray(stored) ? stored.slice(0, this.config.peer.maxKnownAddresses) : [];
    } catch {
      return [];
    }
  }

  /** Write the addresses that have worked to disk (atomic). */
  _saveAddresses() {
    const proven = [];
    for (const [url, address] of this.addresses) {
      if (address.proven && !address.self) proven.push(url);
    }

    this._saving = this._saving.catch(() => {}).then(async () => {
      const temp = `${this.addressFile}.tmp`;
      await mkdir(this.config.dataDir, { recursive: true });
      await writeFile(temp, JSON.stringify(proven, null, 2));
      await rename(temp, this.addressFile);
    }).catch((error) => {
      console.warn(`⚠ could not persist peer addresses: ${error.message}`);
    });
    return this._saving;
  }

  _pendingOutbound() {
    let pending = 0;
    for (const link of this.links) {
      if (link.direction === 'out' && !link.verified) pending++;
    }
    return pending;
  }

  _dialDue() {
    const now = this.now();

    for (const [url, address] of this.addresses) {
      if (this.peers.size + this._pendingOutbound() >= this.config.peer.maxPeers) break;
      if (address.self || address.link || address.nextAttempt > now) continue;
      if (address.peerId && this.peers.has(address.peerId)) continue;
      this._dial(url, address);
    }
  }

  _dial(url, address) {
    let ws;
    try {
      ws = new WebSocket(url, {
        maxPayload: this.config.peer.maxPayload,
        handshakeTimeout: this.config.peer.handshakeTimeout
      });
    } catch {
      this.addresses.delete(url);
      return;
    }

    const link = this._createLink(ws, 'out', url);
    address.link = link;
    ws.on('open', () => this._sendHello(link));
  }

  /**
   * Take over a socket that another node opened to us
   */
  handleInbound(ws) {
    if (this.stopped) {
      ws.close(1001, 'shutting down');
      return;
    }
    const link = this._createLink(ws, 'in', null);
    this._sendHello(link);
  }

  // ---------------------------------------------------------------------
  // Links and the entanglement handshake
  // ---------------------------------------------------------------------

  _createLink(ws, direction, url) {
    const now = this.now();
    const link = {
      ws,
      direction,
      url,
      nonce: randomBytes(16).toString('hex'),
      hello: null,
      verified: false,
      benign: false,
      id: null,
      connectedAt: now,
      lastSeen: now,
      latency: null,
      consciousness: null,
      strikes: 0,
      tokens: BUCKET_CAPACITY,
      tokensAt: now
    };

    link.handshakeTimer = setTimeout(() => {
      if (!link.verified) this._close(link, 1008, 'handshake timeout');
    }, this.config.peer.handshakeTimeout);
    link.handshakeTimer.unref?.();

    ws.on('message', (data, isBinary) => this._handleMessage(link, data, isBinary));
    ws.on('close', () => this._handleClose(link));
    ws.on('error', () => { /* a close event always follows */ });

    this.links.add(link);
    return link;
  }

  _sendHello(link) {
    this._send(link, {
      type: 'hello',
      protocol: this.config.protocol,
      id: this.identity.id,
      publicKey: this.identity.publicKey,
      nonce: link.nonce,
      url: this.config.publicUrl
    });
  }

  _handleHello(link, message) {
    if (link.hello) return;

    if (message.protocol !== this.config.protocol) {
      return this._reject(link, 1002, 'protocol mismatch');
    }

    const { id, publicKey, nonce } = message;
    const wellFormed =
      typeof id === 'string' && HEX_32.test(id) &&
      typeof nonce === 'string' && HEX_32.test(nonce) &&
      typeof publicKey === 'string' && publicKey.length <= 128;

    if (!wellFormed || nodeIdFromPublicKey(publicKey) !== id) {
      return this._reject(link, 1008, 'invalid identity');
    }

    const address = link.url ? this.addresses.get(link.url) : null;

    if (id === this.identity.id) {
      // We dialed our own address
      if (address) address.self = true;
      link.benign = true;
      return this._close(link, 1000, 'self');
    }

    if (address) address.peerId = id;

    link.hello = { id, publicKey, nonce, url: normalizePeerUrl(message.url) };

    this._send(link, {
      type: 'proof',
      signature: this.identity.sign(proofPayload(nonce, id, this.identity.id))
    });
  }

  _handleProof(link, message) {
    if (!link.hello || link.verified) return;

    const expected = proofPayload(link.nonce, this.identity.id, link.hello.id);
    if (!verifySignature(expected, message.signature, link.hello.publicKey)) {
      return this._reject(link, 1008, 'invalid proof');
    }

    this._entangle(link);
  }

  /** The node that opened the connection a link runs over. */
  _initiator(link) {
    return link.direction === 'out' ? this.identity.id : link.hello.id;
  }

  _entangle(link) {
    const id = link.hello.id;
    const existing = this.peers.get(id);

    if (existing) {
      // Two sockets to the same node. Both ends keep the one opened by the
      // node with the lower id, so they agree without talking about it.
      const keepNew =
        this._initiator(link) !== this._initiator(existing) &&
        this._initiator(link) < this._initiator(existing);

      if (!keepNew) {
        link.benign = true;
        return this._close(link, 1000, 'duplicate');
      }
    } else if (this.peers.size >= this.config.peer.maxPeers) {
      // No room: point the caller at other nodes before letting go
      this._sendPeerList(link);
      link.benign = true;
      return this._close(link, 1013, 'full');
    }

    clearTimeout(link.handshakeTimer);
    link.verified = true;
    link.id = id;
    link.lastSeen = this.now();
    this.peers.set(id, link);

    const address = link.url ? this.addresses.get(link.url) : null;
    if (address) {
      address.failures = 0;
      if (!address.proven) {
        address.proven = true;
        this._saveAddresses();
      }
    }
    if (link.hello.url && this.config.peer.exchange) this._learnAddress(link.hello.url);

    if (existing) {
      existing.benign = true;
      this._close(existing, 1000, 'duplicate');
    } else {
      this.metrics.totalEntanglements++;
      this.emit('peer:connected', this._describe(link));
    }

    // Hand over what this node is holding, then start the heartbeat
    const transmissions = this.hooks.getTransmissions();
    for (let i = 0; i < transmissions.length; i += this.config.peer.syncBatch) {
      this._send(link, {
        type: 'sync',
        transmissions: transmissions.slice(i, i + this.config.peer.syncBatch)
      });
    }
    this._sendPeerList(link);
    this._sendPulse(link);
  }

  // ---------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------

  _spendToken(link) {
    const now = this.now();
    const refill = ((now - link.tokensAt) / 1000) * BUCKET_REFILL_PER_SECOND;
    link.tokens = Math.min(BUCKET_CAPACITY, link.tokens + Math.max(0, refill)) - 1;
    link.tokensAt = now;
    return link.tokens >= 0;
  }

  _handleMessage(link, data, isBinary) {
    if (isBinary) return this._reject(link, 1003, 'binary not supported');
    if (!this._spendToken(link)) return this._reject(link, 1008, 'flooding');

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return this._reject(link, 1007, 'malformed message');
    }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return this._reject(link, 1007, 'malformed message');
    }

    this.metrics.messagesIn++;
    link.lastSeen = this.now();

    if (message.type === 'hello') return this._handleHello(link, message);
    if (message.type === 'proof') return this._handleProof(link, message);

    // Nothing else is heard until the peer has proven its identity
    if (!link.verified) return this._reject(link, 1008, 'not entangled');

    switch (message.type) {
      case 'pulse':
        if (typeof message.consciousness === 'number' &&
            message.consciousness >= 0 && message.consciousness <= 1) {
          link.consciousness = message.consciousness;
        }
        this._send(link, { type: 'echo', t: message.t });
        break;

      case 'echo':
        this._handleEcho(link, message);
        break;

      case 'transmission': {
        const hops = message.hops;
        if (!Number.isInteger(hops) || hops < 0 || hops > this.config.peer.maxHops) break;
        this.emit('transmission', message.transmission, hops, link.id);
        break;
      }

      case 'sync':
        if (!Array.isArray(message.transmissions)) break;
        for (const transmission of message.transmissions.slice(0, this.config.peer.syncBatch)) {
          this.emit('transmission', transmission, 0, link.id);
        }
        break;

      case 'peers':
        if (!this.config.peer.exchange || !Array.isArray(message.urls)) break;
        for (const url of message.urls.slice(0, 50)) this._learnAddress(url);
        break;

      default:
        // Unknown message types are ignored so newer nodes can say more
        break;
    }
  }

  _handleEcho(link, message) {
    const now = this.now();
    if (typeof message.t !== 'number' || message.t > now) return;

    const sample = now - message.t;
    if (sample > this.config.peer.timeout) return;

    link.latency = link.latency === null ? sample : link.latency * 0.7 + sample * 0.3;
  }

  _sendPulse(link) {
    this._send(link, {
      type: 'pulse',
      t: this.now(),
      consciousness: this.hooks.getConsciousness()
    });
  }

  _sendPeerList(link) {
    if (!this.config.peer.exchange) return;

    const urls = [];
    for (const peer of this.peers.values()) {
      if (peer !== link && peer.hello.url) urls.push(peer.hello.url);
    }
    if (urls.length > 0) this._send(link, { type: 'peers', urls: urls.slice(0, 50) });
  }

  _send(link, message) {
    if (link.ws.readyState !== WebSocket.OPEN) return false;
    if (link.ws.bufferedAmount > MAX_BUFFERED) return false;

    link.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    this.metrics.messagesOut++;
    return true;
  }

  /**
   * Send a message to every entangled peer, optionally skipping one
   */
  broadcast(message, exceptId = null) {
    const payload = JSON.stringify(message);
    let sent = 0;

    for (const [id, link] of this.peers) {
      if (id !== exceptId && this._send(link, payload)) sent++;
    }
    return sent;
  }

  /**
   * Count an invalid transmission against a peer
   */
  penalize(peerId) {
    const link = this.peers.get(peerId);
    if (!link) return;
    if (++link.strikes >= MAX_STRIKES) this._reject(link, 1008, 'too many invalid transmissions');
  }

  // ---------------------------------------------------------------------
  // Maintenance
  // ---------------------------------------------------------------------

  _tick() {
    if (this.stopped) return;
    const now = this.now();

    this._dialDue();

    if (now - this._lastHeartbeat >= this.config.peer.heartbeatInterval) {
      this._lastHeartbeat = now;
      for (const link of this.peers.values()) {
        if (now - link.lastSeen > this.config.peer.timeout) {
          this._close(link, 1001, 'entanglement collapsed', true);
        } else {
          this._sendPulse(link);
        }
      }
    }

    if (now - this._lastExchange >= EXCHANGE_INTERVAL) {
      this._lastExchange = now;
      for (const link of this.peers.values()) this._sendPeerList(link);
    }
  }

  _reject(link, code, reason) {
    this.metrics.rejectedHandshakes += link.verified ? 0 : 1;
    this._close(link, code, reason);
  }

  _close(link, code, reason, force = false) {
    clearTimeout(link.handshakeTimer);
    try {
      if (force) link.ws.terminate();
      else link.ws.close(code, reason);
    } catch {
      link.ws.terminate();
    }
  }

  _handleClose(link) {
    clearTimeout(link.handshakeTimer);
    this.links.delete(link);

    const address = link.url ? this.addresses.get(link.url) : null;
    if (address && address.link === link) {
      address.link = null;

      if (!link.verified && !link.benign) address.failures++;

      if (!address.bootstrap && address.failures > 5) {
        // A learned address that never answers is forgotten
        this.addresses.delete(link.url);
        if (address.proven) this._saveAddresses();
      } else {
        const { reconnectMin, reconnectMax } = this.config.peer;
        const backoff = Math.min(reconnectMax, reconnectMin * 2 ** Math.min(address.failures, 16));
        address.nextAttempt = this.now() + backoff * (0.75 + Math.random() * 0.5);
      }
    }

    if (link.verified && this.peers.get(link.id) === link) {
      this.peers.delete(link.id);
      this.emit('peer:disconnected', { id: link.id, timestamp: this.now() });
    }
  }

  // ---------------------------------------------------------------------
  // Observation
  // ---------------------------------------------------------------------

  _describe(link) {
    const local = this.hooks.getConsciousness();
    return {
      id: link.id,
      direction: link.direction,
      url: link.hello.url || link.url || null,
      connectedAt: link.connectedAt,
      latency: link.latency === null ? null : Math.round(link.latency),
      consciousness: link.consciousness,
      resonance: link.consciousness === null
        ? null
        : QuantumState.resonance(local, link.consciousness)
    };
  }

  getPeers() {
    return [...this.peers.values()].map((link) => this._describe(link));
  }

  /**
   * Network-level readings, all derived from live links:
   *   stability     share of expected peers that are answering their pulse
   *   entanglement  mean link strength, falling off with latency
   *   resonance     mean closeness of peers' consciousness to our own
   */
  getMetrics() {
    const now = this.now();
    const local = this.hooks.getConsciousness();
    const peers = [...this.peers.values()];

    let bootstrapTargets = 0;
    for (const address of this.addresses.values()) {
      if (address.bootstrap && !address.self) bootstrapTargets++;
    }

    const expected = Math.max(peers.length, bootstrapTargets);
    const answering = peers.filter(
      (link) => now - link.lastSeen <= this.config.peer.heartbeatInterval * 2.5
    ).length;

    let strength = 0;
    let resonance = 0;
    let resonant = 0;
    let latency = 0;
    let measured = 0;

    for (const link of peers) {
      strength += link.latency === null ? 0.5 : Math.exp(-link.latency / 500);
      if (link.latency !== null) {
        latency += link.latency;
        measured++;
      }
      if (link.consciousness !== null) {
        resonance += QuantumState.resonance(local, link.consciousness);
        resonant++;
      }
    }

    return {
      connectedPeers: peers.length,
      knownAddresses: this.addresses.size,
      stability: expected === 0 ? 1 : Math.min(1, answering / expected),
      entanglement: peers.length === 0 ? 0 : strength / peers.length,
      resonance: resonant === 0 ? 0 : resonance / resonant,
      averageLatency: measured === 0 ? null : Math.round(latency / measured)
    };
  }

  /**
   * Release every entanglement
   */
  async shutdown() {
    this.stopped = true;
    clearInterval(this._timer);

    const closing = [...this.links].map((link) => new Promise((resolve) => {
      if (link.ws.readyState === WebSocket.CLOSED) return resolve();
      link.ws.once('close', resolve);
      this._close(link, 1001, 'shutting down');
      setTimeout(() => link.ws.terminate(), 500).unref?.();
    }));

    await Promise.all(closing);
    await this._saving;
  }
}

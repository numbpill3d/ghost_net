import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConfig, normalizePeerUrl, parsePeerList } from '../config.js';
import { createIdentity, loadOrCreateIdentity, nodeIdFromPublicKey, sha256, verifySignature } from '../src/lib/identity.js';
import { QuantumState } from '../src/lib/quantum_state.js';
import { TransmissionHandler, canonicalTransmission, verifyTransmission } from '../src/lib/transmission.js';

const tempDir = () => mkdtemp(path.join(tmpdir(), 'ghost_net-unit-'));

test('identity: id is bound to the keypair and survives a restart', async () => {
  const dir = await tempDir();
  try {
    const first = await loadOrCreateIdentity(dir);
    const second = await loadOrCreateIdentity(dir);

    assert.match(first.id, /^[0-9a-f]{32}$/);
    assert.equal(first.id, nodeIdFromPublicKey(first.publicKey));
    assert.equal(second.id, first.id);

    const signature = first.sign('into the void');
    assert.ok(verifySignature('into the void', signature, second.publicKey));
    assert.ok(!verifySignature('into the vOid', signature, second.publicKey));
    assert.ok(!verifySignature('into the void', signature, createIdentity().publicKey));
    assert.ok(!verifySignature('into the void', signature, 'not a key'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('config: peer lists accept commas, spaces and JSON, and drop junk', () => {
  assert.deepEqual(parsePeerList('ws://a:1/peer, ws://b:2'), ['ws://a:1/peer', 'ws://b:2/peer']);
  assert.deepEqual(parsePeerList('["wss://ghost.example"]'), ['wss://ghost.example/peer']);
  assert.deepEqual(parsePeerList('http://nope, javascript:alert(1), ws://ok:3/peer'), ['ws://ok:3/peer']);
  assert.deepEqual(parsePeerList(''), []);
  assert.equal(normalizePeerUrl('ws://' + 'a'.repeat(300)), null);
});

test('consciousness: an idle node breathes, activity lifts it, time lets it settle', () => {
  let clock = 1_000_000;
  const state = new QuantumState({ birthTimestamp: clock, activityHalfLife: 1000, now: () => clock });

  const idle = [];
  for (let i = 0; i < 100; i++) {
    clock += 100;
    idle.push(state.pulse());
  }
  assert.ok(Math.min(...idle) >= 0.137 - 1e-9);
  assert.ok(Math.max(...idle) <= 0.137 + 0.863 * 0.2 + 1e-9);
  assert.ok(Math.max(...idle) - Math.min(...idle) > 0.1, 'idle level should move');
  assert.equal(state.history().length, 100);
  assert.ok(Math.abs(state.history().at(-1) - idle.at(-1)) < 1e-6, 'history is oldest first');

  const before = state.getActivity();
  for (let i = 0; i < 5; i++) state.excite(1);
  const excited = state.getActivity();
  assert.ok(excited > before + 0.5);

  clock += 20_000; // twenty half-lives
  assert.ok(state.getActivity() < 0.001);

  assert.equal(QuantumState.resonance(0.4, 0.4), 1);
  assert.ok(Math.abs(QuantumState.resonance(0.2, 0.7) - 0.5) < 1e-9);
  assert.equal(QuantumState.resonance(0.2, NaN), 0);
});

test('transmissions: signed on creation, every kind of tampering is caught', async () => {
  const dir = await tempDir();
  try {
    let clock = Date.now();
    const config = createConfig({ DATA_DIR: dir, TRANSMISSION_LIFETIME: '60', MAX_TRANSMISSION_LENGTH: '50' });
    const handler = new TransmissionHandler(config, { now: () => clock });
    const identity = createIdentity();
    await handler.initialize(identity);

    const t = handler.create('  first signal\r\nsecond line\u0007  ', 0.5);
    assert.equal(t.content, 'first signal\nsecond line');
    assert.equal(t.author, identity.id);
    assert.deepEqual(verifyTransmission(t, config, clock), { ok: true, transmission: t });

    const reason = (candidate, at = clock) => verifyTransmission(candidate, config, at).reason;

    // changed content
    assert.equal(reason({ ...t, content: 'something else' }), 'id_mismatch');

    // changed content with a recomputed id: the signature no longer matches
    const altered = { ...t, content: 'something else' };
    altered.id = sha256(canonicalTransmission(altered));
    assert.equal(reason(altered), 'bad_signature');

    // someone else's key claiming this author
    const thief = createIdentity();
    assert.equal(reason({ ...t, publicKey: thief.publicKey }), 'identity_mismatch');

    // a full forgery signed by a different key under the original author id
    const forged = { ...t, publicKey: thief.publicKey, author: t.author };
    forged.id = sha256(canonicalTransmission(forged));
    forged.signature = thief.sign(canonicalTransmission(forged));
    assert.equal(reason(forged), 'identity_mismatch');

    assert.equal(reason({ ...t, content: 'x'.repeat(51) }), 'too_long');
    assert.equal(reason({ ...t, consciousness: 2 }), 'malformed');
    assert.equal(reason({ ...t, id: 'short' }), 'malformed');
    assert.equal(reason(null), 'malformed');
    assert.equal(reason(t, clock + 60_000), 'expired');
    assert.equal(reason({ ...t, timestamp: clock + 10 * 60_000 }), 'from_the_future');

    // extra fields are not carried along
    const clean = verifyTransmission({ ...t, payload: 'junk' }, config, clock).transmission;
    assert.ok(!('payload' in clean));

    assert.throws(() => handler.create('   ', 0.5), /empty/);
    assert.throws(() => handler.create('x'.repeat(51), 0.5), /exceeds/);
    assert.throws(() => handler.create({ html: true }, 0.5), /text/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('transmissions: duplicates are ignored, decay removes, capacity drops the oldest', async () => {
  const dir = await tempDir();
  try {
    let clock = Date.now();
    const config = createConfig({ DATA_DIR: dir, TRANSMISSION_LIFETIME: '10', MAX_STORED_TRANSMISSIONS: '3' });

    const author = new TransmissionHandler(config, { now: () => clock });
    await author.initialize(createIdentity());
    const receiver = new TransmissionHandler(config, { now: () => clock });
    await receiver.initialize(createIdentity());

    const first = author.create('one', 0.2);
    assert.equal(receiver.accept(first).status, 'new');
    assert.equal(receiver.accept(first).status, 'duplicate');
    assert.equal(receiver.accept({ ...first, signature: 'AAAA', id: 'f'.repeat(64) }).status, 'rejected');
    assert.equal(receiver.size, 1);

    assert.equal(receiver.vitality(first), 1);
    clock += 5000;
    assert.ok(Math.abs(receiver.vitality(first) - 0.5) < 1e-9);

    // three more: capacity is 3, so the oldest is let go and stays forgotten
    for (const text of ['two', 'three', 'four']) {
      clock += 10;
      receiver.accept(author.create(text, 0.2));
    }
    assert.equal(receiver.size, 3);
    assert.ok(!receiver.has(first.id));
    assert.equal(receiver.accept(first).status, 'duplicate');
    assert.deepEqual(receiver.list().map((t) => t.content), ['four', 'three', 'two']);

    clock += 10_000;
    const dissolved = receiver.prune();
    assert.equal(dissolved.length, 3);
    assert.equal(receiver.size, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('transmissions: what is on disk is verified again when a node wakes', async () => {
  const dir = await tempDir();
  try {
    const config = createConfig({ DATA_DIR: dir });
    const identity = createIdentity();

    const before = new TransmissionHandler(config);
    await before.initialize(identity);
    const kept = before.create('persist me', 0.3);
    await before.flush();

    const { readFile, writeFile } = await import('node:fs/promises');
    const file = path.join(dir, 'transmissions.json');
    const stored = JSON.parse(await readFile(file, 'utf8'));
    stored.push({ ...kept, content: 'edited on disk' });
    await writeFile(file, JSON.stringify(stored));

    const after = new TransmissionHandler(config);
    await after.initialize(identity);
    assert.deepEqual(after.list(), [kept]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

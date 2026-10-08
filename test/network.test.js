import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createIdentity, sha256 } from '../src/lib/identity.js';
import { canonicalTransmission } from '../src/lib/transmission.js';
import { createVoid, sleep, until } from './helpers.js';

/**
 * A hand-rolled node for poking at the peer protocol from outside.
 * `honest: false` signs the proof with a key that does not match its id.
 */
async function rogueNode(void_, target, { honest = true, identity = createIdentity() } = {}) {
  const ws = new WebSocket(target.peerUrl);
  void_.track(ws);

  const rogue = { ws, identity, messages: [], closed: null };
  ws.on('close', (code, reason) => { rogue.closed = { code, reason: reason.toString() }; });
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    rogue.messages.push(message);

    if (message.type === 'hello') {
      ws.send(JSON.stringify({
        type: 'hello',
        protocol: 1,
        id: identity.id,
        publicKey: identity.publicKey,
        nonce: 'ab'.repeat(16),
        url: null
      }));
      const signer = honest ? identity : createIdentity();
      ws.send(JSON.stringify({
        type: 'proof',
        signature: signer.sign(`ghost_net:proof:${message.nonce}:${message.id}:${identity.id}`)
      }));
    }
  });

  rogue.send = (message) => ws.send(JSON.stringify(message));
  rogue.sign = (content, overrides = {}) => {
    const t = {
      author: identity.id,
      publicKey: identity.publicKey,
      content,
      timestamp: Date.now(),
      consciousness: 0.5,
      ...overrides
    };
    t.id = sha256(canonicalTransmission(t));
    t.signature = identity.sign(canonicalTransmission(t));
    return t;
  };

  await new Promise((resolve) => ws.once('open', resolve));
  return rogue;
}

test('a single node: post, read back, live feed, input limits', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const node = await void_.start({ MAX_TRANSMISSION_LENGTH: '100' });
  const feed = await void_.observe(node);

  const handshake = feed.of('handshake')[0];
  assert.equal(handshake.identity.id, node.id);
  assert.deepEqual(handshake.transmissions, []);

  const script = '<img src=x onerror=alert(1)>';
  const { status, body } = await void_.transmit(node, script);
  assert.equal(status, 201);
  assert.equal(body.transmission.content, script, 'content is stored verbatim; the client must not render it as HTML');
  assert.equal(body.transmission.author, node.id);

  await until(() => feed.received(body.transmission.id).length === 1, 'live transmission');

  const held = await void_.get(node, '/api/transmissions');
  assert.equal(held.transmissions.length, 1);
  assert.equal(held.transmissions[0].id, body.transmission.id);

  assert.equal((await void_.transmit(node, '   ')).status, 400);
  assert.equal((await void_.transmit(node, 'x'.repeat(101))).status, 400);
  assert.equal((await void_.transmit(node, { nested: true })).status, 400);

  const badJson = await fetch(`${node.http}/api/transmit`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope'
  });
  assert.equal(badJson.status, 400);

  assert.equal((await fetch(`${node.http}/api/nothing`)).status, 404);
  assert.equal((await void_.get(node, '/health')).status, 'alive');

  const status_ = await void_.get(node, '/api/status');
  assert.equal(status_.transmissions, 1);
  assert.equal(status_.peers, 0);
  assert.equal(status_.stability, 1);
  assert.equal(status_.observers, 1);
  assert.ok(status_.consciousness > 0.137 && status_.consciousness <= 1);

  // the pulse reaches the browser
  await until(() => feed.of('sync').length >= 2, 'state pulses');
  assert.equal(feed.of('sync').at(-1).state.nodeId, node.id);
});

test('a chain A - B - C relays in both directions, exactly once', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const a = await void_.start();
  const b = await void_.start({ BOOTSTRAP_NODES: a.peerUrl });
  const c = await void_.start({ BOOTSTRAP_NODES: b.peerUrl });

  await Promise.all([void_.entangled(a, 1), void_.entangled(b, 2), void_.entangled(c, 1)]);

  const [feedA, feedB, feedC] = await Promise.all([a, b, c].map((n) => void_.observe(n)));

  const sent = (await void_.transmit(a, 'from the first node')).body.transmission;
  await until(() => feedC.received(sent.id).length === 1, 'A -> C relay');
  await until(() => feedB.received(sent.id).length === 1, 'A -> B relay');

  const reply = (await void_.transmit(c, 'an echo from the far end')).body.transmission;
  await until(() => feedA.received(reply.id).length === 1, 'C -> A relay');

  // let any stray duplicate arrive before counting
  await sleep(300);
  for (const feed of [feedA, feedB, feedC]) {
    assert.equal(feed.received(sent.id).length, 1);
    assert.equal(feed.received(reply.id).length, 1);
  }

  // relayed copies are byte-identical to what the author signed
  assert.deepEqual(feedC.received(sent.id)[0].transmission, sent);
  assert.equal(sent.author, a.id);
  assert.equal(reply.author, c.id);

  for (const node of [a, b, c]) {
    assert.equal((await void_.get(node, '/api/transmissions')).transmissions.length, 2);
  }

  // metrics come from the live links
  const state = await until(async () => {
    const s = await void_.get(b, '/api/status');
    return s.averageLatency !== null && s.resonance > 0 ? s : null;
  }, 'measured link metrics');
  assert.equal(state.peers, 2);
  assert.equal(state.stability, 1);
  assert.ok(state.entanglement > 0.5 && state.entanglement <= 1);
  assert.ok(state.resonance > 0 && state.resonance <= 1);
  assert.ok(state.voidEcho === 1, 'everything B holds came from elsewhere');

  const peers = (await void_.get(b, '/api/peers')).peers;
  assert.deepEqual(peers.map((p) => p.id).sort(), [a.id, c.id].sort());
  assert.deepEqual(peers.map((p) => p.direction).sort(), ['in', 'out']);
});

test('a fully connected triangle does not echo forever', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const a = await void_.start();
  const b = await void_.start({ BOOTSTRAP_NODES: a.peerUrl });
  const c = await void_.start({ BOOTSTRAP_NODES: `${a.peerUrl},${b.peerUrl}` });
  await Promise.all([a, b, c].map((n) => void_.entangled(n, 2)));

  const feeds = await Promise.all([a, b, c].map((n) => void_.observe(n)));
  const messagesBefore = a.ghostNet.peerNetwork.metrics.messagesIn;

  const sent = [];
  for (let i = 0; i < 5; i++) sent.push((await void_.transmit(b, `signal ${i}`)).body.transmission);

  for (const feed of feeds) {
    await until(() => sent.every((s) => feed.received(s.id).length === 1), 'all five everywhere');
  }
  await sleep(300);

  for (const feed of feeds) {
    for (const s of sent) assert.equal(feed.received(s.id).length, 1);
  }
  for (const node of [a, b, c]) assert.equal(node.ghostNet.getTransmissions().length, 5);

  // A hears each signal at most once per neighbour, plus heartbeats
  const transmissionsHeard = a.ghostNet.transmissionHandler.metrics.received;
  assert.equal(transmissionsHeard, 5);
  assert.ok(a.ghostNet.peerNetwork.metrics.messagesIn - messagesBefore < 60);
});

test('two nodes that dial each other at once settle on one link', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const a = await void_.start();
  const b = await void_.start({ BOOTSTRAP_NODES: a.peerUrl });
  // teach A to dial B as well
  a.ghostNet.peerNetwork._learnAddress(b.peerUrl, { bootstrap: true });

  await sleep(800);

  assert.equal(a.ghostNet.getPeers().length, 1);
  assert.equal(b.ghostNet.getPeers().length, 1);
  assert.equal(a.ghostNet.peerNetwork.links.size, 1, 'no spare sockets left open on A');
  assert.equal(b.ghostNet.peerNetwork.links.size, 1, 'no spare sockets left open on B');

  const feedB = await void_.observe(b);
  const sent = (await void_.transmit(a, 'still one path')).body.transmission;
  await until(() => feedB.received(sent.id).length === 1, 'delivery over the surviving link');
});

test('a node that joins late is handed what the network is holding', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const a = await void_.start();
  const first = (await void_.transmit(a, 'before you arrived')).body.transmission;
  const second = (await void_.transmit(a, 'also before')).body.transmission;

  const late = await void_.start({ BOOTSTRAP_NODES: a.peerUrl });
  await until(() => late.ghostNet.getTransmissions().length === 2, 'history sync');

  const feed = await void_.observe(late);
  assert.deepEqual(
    feed.of('handshake')[0].transmissions.map((x) => x.id).sort(),
    [first.id, second.id].sort()
  );
});

test('the hop limit stops a transmission travelling further', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const a = await void_.start({ MAX_HOPS: '0' });
  const b = await void_.start({ MAX_HOPS: '0', BOOTSTRAP_NODES: a.peerUrl });
  const c = await void_.start({ MAX_HOPS: '0', BOOTSTRAP_NODES: b.peerUrl });
  await Promise.all([void_.entangled(a, 1), void_.entangled(b, 2), void_.entangled(c, 1)]);

  const sent = (await void_.transmit(a, 'one hop only')).body.transmission;
  await until(() => b.ghostNet.transmissionHandler.has(sent.id), 'first hop');
  await sleep(300);
  assert.ok(!c.ghostNet.transmissionHandler.has(sent.id), 'C is two hops away');
});

test('peer exchange: nodes find each other through a shared neighbour', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  // B and C only know A, but both say where they can be reached
  const a = await void_.start();
  const b = await void_.start({ PORT: '39411', PUBLIC_URL: 'ws://127.0.0.1:39411/peer', BOOTSTRAP_NODES: a.peerUrl });
  const c = await void_.start({ PORT: '39412', PUBLIC_URL: 'ws://127.0.0.1:39412/peer', BOOTSTRAP_NODES: a.peerUrl });

  await Promise.all([void_.entangled(a, 2), void_.entangled(b, 2), void_.entangled(c, 2)]);
  assert.ok(c.ghostNet.getPeers().some((p) => p.id === b.id), 'C found B without being told about it');

  // with exchange off, a node keeps to the peers it was given
  const hermit = await void_.start({ PEER_EXCHANGE: 'false', BOOTSTRAP_NODES: a.peerUrl });
  await void_.entangled(hermit, 1);
  await sleep(400);
  assert.equal(hermit.ghostNet.getPeers().length, 1);
});

test('the handshake refuses impostors and forged transmissions are dropped', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const node = await void_.start();
  const victim = createIdentity();

  // claims the victim's id without holding its key
  const impostor = await rogueNode(void_, node, { honest: false, identity: victim });
  await until(() => impostor.closed, 'impostor disconnected');
  assert.equal(impostor.closed.code, 1008);
  assert.equal(node.ghostNet.getPeers().length, 0);

  // speaks before proving anything
  const eager = new WebSocket(node.peerUrl);
  void_.track(eager);
  const eagerClosed = new Promise((resolve) => eager.once('close', resolve));
  eager.once('open', () => eager.send(JSON.stringify({ type: 'transmission', transmission: {}, hops: 0 })));
  assert.equal(await eagerClosed, 1008);

  // a real peer: honest transmissions get through, forgeries do not
  const rogue = await rogueNode(void_, node);
  await void_.entangled(node, 1);
  const feed = await void_.observe(node);

  const honest = rogue.sign('a real signal from outside');
  rogue.send({ type: 'transmission', transmission: honest, hops: 0 });
  await until(() => feed.received(honest.id).length === 1, 'honest transmission accepted');

  const edited = { ...honest, content: 'words the author never wrote' };
  const reIded = { ...edited, id: sha256(canonicalTransmission(edited)) };
  const asVictim = rogue.sign('signed by the wrong key', { author: victim.id, publicKey: victim.publicKey });
  const stale = rogue.sign('from long ago', { timestamp: Date.now() - 365 * 86400 * 1000 });

  rogue.send({ type: 'transmission', transmission: edited, hops: 0 });
  rogue.send({ type: 'transmission', transmission: reIded, hops: 0 });
  rogue.send({ type: 'transmission', transmission: asVictim, hops: 0 });
  rogue.send({ type: 'transmission', transmission: stale, hops: 0 });
  rogue.send({ type: 'transmission', transmission: honest, hops: 99 });
  rogue.send({ type: 'something_from_the_future', data: 1 });

  await sleep(300);
  assert.deepEqual(node.ghostNet.getTransmissions().map((x) => x.id), [honest.id]);
  assert.equal(feed.of('transmission').length, 1);
  assert.equal(rogue.closed, null, 'a few bad signals are tolerated');

  // keep forging and the link is cut
  for (let i = 0; i < 5; i++) {
    const forgery = { ...honest, content: `forgery ${i}` };
    forgery.id = sha256(canonicalTransmission(forgery));
    rogue.send({ type: 'transmission', transmission: forgery, hops: 0 });
  }
  await until(() => rogue.closed, 'persistent forger disconnected');
  assert.equal(rogue.closed.code, 1008);
  assert.equal(node.ghostNet.getPeers().length, 0);
});

test('transmissions decay: the node forgets them and tells its observers', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const a = await void_.start({ TRANSMISSION_LIFETIME: '0.6' });
  const b = await void_.start({ TRANSMISSION_LIFETIME: '0.6', BOOTSTRAP_NODES: a.peerUrl });
  await void_.entangled(b, 1);

  const feedB = await void_.observe(b);
  const sent = (await void_.transmit(a, 'nothing is permanent')).body.transmission;
  await until(() => feedB.received(sent.id).length === 1, 'relay before decay');

  await until(() => feedB.of('decayed').some((m) => m.ids.includes(sent.id)), 'decay notice', 3000);
  assert.equal((await void_.get(a, '/api/transmissions')).transmissions.length, 0);
  assert.equal((await void_.get(b, '/api/transmissions')).transmissions.length, 0);

  // a decayed transmission is not welcomed back
  b.ghostNet.peerNetwork.emit('transmission', sent, 0, a.id);
  assert.equal(b.ghostNet.getTransmissions().length, 0);
});

test('a node keeps its identity and its transmissions across a restart, and peers reconnect', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const a = await void_.start({ PORT: '39413' });
  const b = await void_.start({ BOOTSTRAP_NODES: a.peerUrl });
  await void_.entangled(b, 1);

  const sent = (await void_.transmit(a, 'remember me')).body.transmission;
  const { id, dataDir } = a;

  await void_.stop(a);
  await void_.entangled(b, 0);
  const lone = await void_.get(b, '/api/status');
  assert.equal(lone.stability, 0, 'the only expected peer is gone');

  const reborn = await void_.start({ PORT: '39413', DATA_DIR: dataDir });
  assert.equal(reborn.id, id);
  assert.deepEqual(reborn.ghostNet.getTransmissions(), [sent]);

  await void_.entangled(b, 1);
  await void_.entangled(reborn, 1);
  assert.equal((await void_.get(b, '/api/status')).stability, 1);
});

test('posting is rate limited per client', async (t) => {
  const void_ = createVoid();
  t.after(() => void_.close());

  const node = await void_.start({ TRANSMIT_LIMIT_MAX: '3' });
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await void_.transmit(node, `burst ${i}`)).status);

  assert.deepEqual(statuses, [201, 201, 201, 429, 429]);
  assert.equal(node.ghostNet.getTransmissions().length, 3);
});

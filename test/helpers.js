import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createConfig } from '../config.js';
import { QuantumServer } from '../src/server.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `check` returns something truthy. */
export async function until(check, what = 'condition', timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

/**
 * A small cluster of in-process nodes with fast timers, cleaned up by close().
 */
export function createVoid() {
  const nodes = [];
  const sockets = [];
  const dirs = [];

  const start = async (env = {}) => {
    let dataDir = env.DATA_DIR;
    if (!dataDir) {
      dataDir = await mkdtemp(path.join(tmpdir(), 'ghost_net-test-'));
      dirs.push(dataDir);
    }

    const config = createConfig({
      PORT: '0',
      HOST: '127.0.0.1',
      HEARTBEAT_INTERVAL: '100',
      PULSE_INTERVAL: '100',
      MAINTENANCE_INTERVAL: '100',
      RECONNECT_MIN: '50',
      RECONNECT_MAX: '200',
      ...env,
      DATA_DIR: dataDir
    });

    const node = await new QuantumServer(config, { log: () => {} }).initialize();
    node.dataDir = dataDir;
    node.http = `http://127.0.0.1:${node.port}`;
    node.peerUrl = `ws://127.0.0.1:${node.port}/peer`;
    node.id = node.ghostNet.getIdentity().id;
    nodes.push(node);
    return node;
  };

  const stop = async (node) => {
    nodes.splice(nodes.indexOf(node), 1);
    await node.shutdown();
  };

  /** Open the browser feed of a node and collect everything it says. */
  const observe = async (node) => {
    const ws = new WebSocket(`ws://127.0.0.1:${node.port}/ws`);
    const messages = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    sockets.push(ws);
    await until(() => messages.some((m) => m.type === 'handshake'), 'observer handshake');

    return {
      messages,
      of: (type) => messages.filter((m) => m.type === type),
      received: (id) => messages.filter((m) => m.type === 'transmission' && m.transmission.id === id)
    };
  };

  const transmit = async (node, content, key = null) => {
    const headers = { 'content-type': 'application/json' };
    if (key !== null) headers.authorization = `Bearer ${key}`;

    const response = await fetch(`${node.http}/api/transmit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content })
    });
    return { status: response.status, body: await response.json() };
  };

  const get = async (node, route) => (await fetch(`${node.http}${route}`)).json();

  const entangled = (node, count) =>
    until(() => node.ghostNet.getPeers().length === count, `${count} peers on ${node.id.slice(0, 6)}`);

  const close = async () => {
    for (const ws of sockets) ws.terminate();
    await Promise.all(nodes.splice(0).map((node) => node.shutdown()));
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  };

  return { start, stop, observe, transmit, get, entangled, close, track: (ws) => sockets.push(ws) };
}

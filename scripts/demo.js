// A small local void: three nodes in a chain, A - B - C.
// A transmission sent on A reaches C only because B relays it.
//
//   npm run demo            ports 3000, 3001, 3002
//   DEMO_PORT=4000 npm run demo
import path from 'node:path';
import { createConfig, ROOT } from '../config.js';
import { QuantumServer } from '../src/server.js';

const basePort = Number(process.env.DEMO_PORT) || 3000;
const names = ['A', 'B', 'C'];
const nodes = [];

try {
  for (const [index, name] of names.entries()) {
    const port = basePort + index;
    const config = createConfig({
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: path.join(ROOT, '_void_demo', name),
      BOOTSTRAP_NODES: index === 0 ? '' : `ws://127.0.0.1:${port - 1}/peer`
    });

    const node = await new QuantumServer(config, { log: () => {} }).initialize();
    nodes.push(node);
    console.log(`🔷 node ${name}  http://localhost:${port}  ${node.ghostNet.getIdentity().id.slice(0, 12)}`);
  }
} catch (error) {
  console.error(error.code === 'EADDRINUSE'
    ? `❌ port ${error.port} is in use — try DEMO_PORT=4000 npm run demo`
    : `❌ ${error.message}`);
  await Promise.all(nodes.map((node) => node.shutdown()));
  process.exit(1);
}

console.log('\nopen all three. A and C are not connected to each other:');
console.log('what you send on one reaches the other through B.');
console.log('ctrl+c to dissolve the void.');

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await Promise.all(nodes.map((node) => node.shutdown()));
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

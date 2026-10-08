import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfig, loadEnvFile } from '../config.js';
import { GhostNet } from './lib/ghost_net.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

/**
 * Quantum Server for Ghost Net
 * One HTTP server carrying three things: the interface and its API, the
 * live feed to browsers (/ws) and the tunnel other nodes connect to (/peer).
 */
export class QuantumServer {
  constructor(config = createConfig(), options = {}) {
    this.config = config;
    this.log = options.log ?? console.log;

    this.app = express();
    this.server = createServer(this.app);
    this.ghostNet = new GhostNet(config, options);

    this.metrics = {
      startTime: Date.now(),
      requests: 0,
      errors: 0
    };

    // Browsers watching this node
    this.connections = new Map();
  }

  async initialize() {
    this._initializeSecurity();
    this._initializeMiddleware();
    this._initializeRoutes();
    this._initializeWebSocket();
    await this.ghostNet.initialize();
    this._initializeQuantumSync();
    await this._startServer();
    return this;
  }

  /** The port the node is actually listening on. */
  get port() {
    return this.server.address()?.port;
  }

  _initializeSecurity() {
    this.app.disable('x-powered-by');
    this.app.set('trust proxy', this.config.security.trustProxy);

    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          // Nodes are often reached over plain http on a LAN; upgrading
          // would break the websocket tunnel there
          upgradeInsecureRequests: null
        }
      },
      strictTransportSecurity: false
    }));

    const limited = (res, window) => {
      res.status(429).json({
        error: 'Quantum limit exceeded',
        retryAfter: Math.ceil(window / 1000)
      });
    };

    const { rateLimit: general, transmitLimit } = this.config.security;

    this.app.use('/api', rateLimit({
      windowMs: general.window,
      limit: general.max,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => limited(res, general.window)
    }));

    this.transmitLimiter = rateLimit({
      windowMs: transmitLimit.window,
      limit: transmitLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => limited(res, transmitLimit.window)
    });
  }

  _initializeMiddleware() {
    this.app.use(compression());
    this.app.use(express.json({ limit: '16kb', strict: true }));
    this.app.use(express.static(PUBLIC_DIR, { etag: true, lastModified: true }));

    this.app.use((req, res, next) => {
      this.metrics.requests++;
      next();
    });
  }

  _initializeRoutes() {
    const { app, ghostNet } = this;

    app.get('/health', (req, res) => {
      res.json({ status: 'alive', uptime: process.uptime() });
    });

    app.get('/api/identity', (req, res) => {
      res.json({
        ...ghostNet.getIdentity(),
        lifetime: this.config.transmission.lifetime,
        maxLength: this.config.transmission.maxLength
      });
    });

    app.get('/api/status', (req, res) => {
      res.json({
        ...ghostNet.getState(),
        uptime: Math.round((Date.now() - this.metrics.startTime) / 1000),
        observers: this.connections.size,
        version: this.config.version
      });
    });

    app.get('/api/peers', (req, res) => {
      res.json({ peers: ghostNet.getPeers(), timestamp: Date.now() });
    });

    app.get('/api/transmissions', (req, res) => {
      res.json({
        transmissions: ghostNet.getTransmissions(),
        lifetime: this.config.transmission.lifetime,
        timestamp: Date.now()
      });
    });

    app.post('/api/transmit', this.transmitLimiter, (req, res, next) => {
      try {
        const transmission = ghostNet.transmit({ content: req.body?.content });
        res.status(201).json({ transmission, timestamp: Date.now() });
      } catch (error) {
        next(error);
      }
    });

    app.use('/api', (req, res) => {
      res.status(404).json({ error: 'No such frequency' });
    });

    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
      const status = error.status || error.statusCode || 500;
      if (status >= 500) {
        this.metrics.errors++;
        console.error('❌ Quantum error:', error);
      }
      res.status(status).json({
        error: status >= 500 ? 'The void returned an error' : error.message
      });
    });
  }

  _initializeWebSocket() {
    this.browserWss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
    this.peerWss = new WebSocketServer({
      noServer: true,
      maxPayload: this.config.peer.maxPayload
    });

    this.server.on('upgrade', (req, socket, head) => {
      let pathname;
      try {
        pathname = new URL(req.url, 'http://ghost.net').pathname;
      } catch {
        return socket.destroy();
      }

      if (pathname === '/peer') {
        this.peerWss.handleUpgrade(req, socket, head, (ws) => {
          this.ghostNet.attachPeerSocket(ws);
        });
      } else if (pathname === '/ws') {
        this.browserWss.handleUpgrade(req, socket, head, (ws) => {
          this._handleObserver(ws);
        });
      } else {
        socket.destroy();
      }
    });

    // Drop observers whose connection has silently died
    this.keepAlive = setInterval(() => {
      for (const ws of this.connections.values()) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);
    this.keepAlive.unref?.();
  }

  /**
   * A browser opened the live feed
   */
  _handleObserver(ws) {
    if (this.connections.size >= this.config.security.maxBrowsers) {
      ws.close(1013, 'the void is crowded');
      return;
    }

    const connectionId = randomBytes(8).toString('hex');
    this.connections.set(connectionId, ws);
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => this.connections.delete(connectionId));
    ws.on('error', () => { /* a close event always follows */ });

    // Everything a new observer needs to render the node as it is now
    this._sendTo(ws, {
      type: 'handshake',
      identity: this.ghostNet.getIdentity(),
      lifetime: this.config.transmission.lifetime,
      maxLength: this.config.transmission.maxLength,
      state: this.ghostNet.getState(),
      peers: this.ghostNet.getPeers(),
      history: this.ghostNet.quantumState.history(),
      transmissions: this.ghostNet.getTransmissions()
    });
  }

  _initializeQuantumSync() {
    const { ghostNet } = this;

    ghostNet.on('quantum:pulse', (state) => {
      this._broadcast({ type: 'sync', state, peers: ghostNet.getPeers() });
    });

    ghostNet.on('transmission', (transmission) => {
      this._broadcast({ type: 'transmission', transmission });
    });

    ghostNet.on('transmission:decayed', (ids) => {
      this._broadcast({ type: 'decayed', ids });
    });

    ghostNet.on('peer:connected', (peer) => {
      this.log(`🔗 entangled with ${peer.id.slice(0, 12)} (${peer.direction})`);
    });

    ghostNet.on('peer:disconnected', (peer) => {
      this.log(`⛓️‍💥 entanglement with ${peer.id.slice(0, 12)} collapsed`);
    });
  }

  _sendTo(ws, message) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }

  _broadcast(message) {
    if (this.connections.size === 0) return;
    const payload = JSON.stringify(message);
    for (const ws of this.connections.values()) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }

  _startServer() {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  /**
   * Release every connection and persist what the node is holding
   */
  async shutdown() {
    clearInterval(this.keepAlive);

    for (const ws of this.connections.values()) ws.close(1001, 'node shutting down');
    await this.ghostNet.shutdown();

    await new Promise((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections?.();
    });
  }
}

// ---------------------------------------------------------------------------
// Run as a node when started directly
// ---------------------------------------------------------------------------

const startedDirectly = () => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
};

if (startedDirectly()) {
  loadEnvFile();
  const config = createConfig();
  const quantumServer = new QuantumServer(config);

  try {
    await quantumServer.initialize();
  } catch (error) {
    const reason = error.code === 'EADDRINUSE'
      ? `port ${config.port} is already in use — set PORT to another one`
      : error.message;
    console.error(`❌ Quantum Server initialization failed: ${reason}`);
    process.exit(1);
  }

  const identity = quantumServer.ghostNet.getIdentity();
  const shownHost = ['0.0.0.0', '::'].includes(config.host) ? 'localhost' : config.host;

  console.log(`🔷 ghost_net node ${identity.id}`);
  console.log(`   interface  http://${shownHost}:${quantumServer.port}`);
  console.log(`   peer link  ws://${shownHost}:${quantumServer.port}/peer`);
  console.log(`   holding    ${quantumServer.ghostNet.getTransmissions().length} transmissions`);
  console.log(config.peer.bootstrap.length > 0
    ? `   reaching   ${config.peer.bootstrap.join(', ')}`
    : '   reaching   no bootstrap nodes — waiting to be found');

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n🔻 ${signal} — dissolving node`);
    await quantumServer.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

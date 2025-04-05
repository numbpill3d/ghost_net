import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { createHash, randomBytes } from 'crypto';
import { promisify } from 'util';
import config from '../config.js';
import { GhostNet } from './lib/ghost_net.js';

const sleep = promisify(setTimeout);

/**
 * Quantum Server for Ghost Net
 * Manages decentralized consciousness networking
 */
class QuantumServer {
  constructor() {
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);
    this.ghostNet = new GhostNet(config);

    // Advanced quantum state tracking
    this.metrics = {
      startTime: Date.now(),
      requests: 0,
      errors: 0,
      activeConnections: 0,
      bandwidthUsage: 0,
      quantumStability: 1.0,
      lastGC: Date.now(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      consciousnessField: new Float32Array(1024),
      entropyFactor: 0.01
    };

    // Connection & network state
    this.connections = new Map();
    this.pendingHandshakes = new Map();
    this.quantumBuffers = {
      transmissions: new Map(),
      consciousness: new Float32Array(100),
      resonance: new Float32Array(100),
      peerSignatures: new Map()
    };
  }

  async initialize() {
    try {
      console.log('🔷 Initializing Quantum Server...');

      await this._initializeSecurity();
      await this._initializeMiddleware();
      await this._initializeRoutes();
      await this._initializeWebSocket();
      await this.ghostNet.initialize();
      await this._startServer();
      await this._initializeQuantumSync();

      console.log('✅ Quantum Server initialization complete.');
    } catch (error) {
      console.error('❌ Quantum Server initialization failed:', error);
      process.exit(1);
    }
  }

  async _initializeSecurity() {
    this.app.use(helmet());

    const quantumLimiter = rateLimit({
      windowMs: this.config.security.rateLimit.window || 60000,
      max: this.config.security.rateLimit.max || 100,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const input = `${req.ip}:${req.headers['user-agent']}:${Date.now()}`;
        return createHash('sha256').update(input).digest('hex');
      },
      handler: (req, res) => {
        res.status(429).json({
          error: 'Quantum limit exceeded',
          retryAfter: Math.ceil(this.config.security.rateLimit.window / 1000),
          quantumStability: this.metrics.quantumStability
        });
      }
    });

    this.app.use(quantumLimiter);
  }

  async _initializeMiddleware() {
    this.app.use(cors({ origin: '*', methods: ['GET', 'POST'], credentials: true }));
    this.app.use(compression());
    this.app.use(express.json({ limit: '50mb', strict: true }));
    this.app.use(express.static('src/public', { maxAge: '1d', etag: true, lastModified: true }));

    this.app.use((req, res, next) => {
      this.metrics.requests++;
      next();
    });
  }

  async _initializeRoutes() {
    this.app.get('/api/status', (req, res) => {
      res.json({
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        quantumStability: this.metrics.quantumStability,
        activePeers: this.connections.size
      });
    });

    this.app.post('/api/transmit', async (req, res) => {
      try {
        await this._validateQuantumTransmission(req);
        const transmission = await this.ghostNet.transmit(req.body);
        this._updateQuantumBuffers('transmission', transmission);
        res.json({ transmission, timestamp: Date.now(), resonance: this._calculateResonance(transmission) });
      } catch (error) {
        this._handleQuantumError(error, res);
      }
    });

    this.app.get('/api/peers', async (req, res) => {
      try {
        const peers = await this.ghostNet.getPeers();
        res.json({ peers, timestamp: Date.now(), networkStability: this.metrics.quantumStability });
      } catch (error) {
        this._handleQuantumError(error, res);
      }
    });
  }

  async _initializeWebSocket() {
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws, req) => {
      const connectionId = randomBytes(16).toString('hex');
      this.connections.set(connectionId, ws);
      this._performQuantumHandshake(ws, connectionId, req);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'sync') {
            this._synchronizeQuantumState(ws, data);
          } else {
            console.log(`🔹 Quantum Message from ${connectionId}:`, data);
          }
        } catch (err) {
          console.error('❌ Error processing message:', err);
        }
      });

      ws.on('close', () => {
        this.connections.delete(connectionId);
      });

      ws.send(JSON.stringify({ status: 'Connected to Quantum Network' }));
    });

    this.wss.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
  }

  async _startServer() {
    return new Promise((resolve, reject) => {
      const port = this.config.peer.network.port || 8080;

      this.server.listen(port, () => {
        console.log(`🔷 Quantum Server running on port ${port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('❌ Quantum Server Error:', error);
        reject(error);
      });
    });
  }

  async _initializeQuantumSync() {
    setInterval(() => {
      this._updateConsciousnessField();
      this._broadcastQuantumMetrics();
    }, 5000);
  }

  _performQuantumHandshake(ws, connectionId, req) {
    const peerSignature = createHash('sha256').update(req.headers['user-agent']).digest('hex');
    this.quantumBuffers.peerSignatures.set(connectionId, peerSignature);
    ws.send(JSON.stringify({ type: 'handshake', peerId: connectionId, signature: peerSignature }));
  }

  _synchronizeQuantumState(ws, data) {
    if (data.field) {
      this.metrics.consciousnessField = new Float32Array(data.field);
    }
    ws.send(JSON.stringify({ type: 'sync_ack', field: Array.from(this.metrics.consciousnessField) }));
  }

  _updateConsciousnessField() {
    for (let i = 0; i < this.metrics.consciousnessField.length; i++) {
      this.metrics.consciousnessField[i] += (Math.random() - 0.5) * this.metrics.entropyFactor;
    }
    this.metrics.quantumStability = this._calculateQuantumStability();
  }

  _broadcastQuantumMetrics() {
    const payload = JSON.stringify({
      type: 'sync',
      field: Array.from(this.metrics.consciousnessField),
      quantumStability: this.metrics.quantumStability
    });

    for (const ws of this.connections.values()) {
      ws.send(payload);
    }
  }

  _calculateQuantumStability() {
    let stability = 0;
    for (const value of this.metrics.consciousnessField) {
      stability += Math.exp(-Math.abs(value) * 10);
    }
    return stability / this.metrics.consciousnessField.length;
  }

  _handleQuantumError(error, target) {
    this.metrics.errors++;
    const errorResponse = { error: error.message, timestamp: Date.now(), stability: this.metrics.quantumStability };
    if (target instanceof WebSocket) {
      target.send(JSON.stringify(errorResponse));
    } else {
      target.status(500).json(errorResponse);
    }
  }
}

// Start the Quantum Server
const quantumServer = new QuantumServer();
quantumServer.initialize();

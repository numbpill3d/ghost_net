// src/server.js

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { GhostNet } from './lib/ghost_net.js';
import { createHash, randomBytes } from 'crypto';
import { promisify } from 'util';
import config from '../config.js';

const sleep = promisify(setTimeout);

/**
 * Quantum Server for Ghost Net
 * Orchestrates distributed consciousness network operations
 */
class QuantumServer {
  constructor() {
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);
    this.ghostNet = new GhostNet(config);
    
    // Advanced metrics tracking
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
      quantumMetrics: new Float32Array(1000)
    };
    
    // Connection tracking
    this.connections = new Map();
    this.pendingHandshakes = new Map();
    
    // Initialize quantum buffers
    this.quantumBuffers = {
      transmissions: new Map(),
      consciousness: new Float32Array(100),
      resonance: new Float32Array(100)
    };
  }

  /**
   * Initialize quantum server infrastructure
   */
  async initialize() {
    try {
      console.log('Initializing quantum server...');
      
      // Initialize security middleware
      await this._initializeSecurity();
      
      // Initialize core middleware
      await this._initializeMiddleware();
      
      // Initialize quantum routes
      await this._initializeRoutes();
      
      // Initialize WebSocket server
      await this._initializeWebSocket();
      
      // Initialize ghost_net
      await this.ghostNet.initialize();
      
      // Start quantum monitoring
      await this._initializeMonitoring();
      
      // Start the server
      await this._startServer();
      
      console.log('Quantum server initialization complete');
      
    } catch (error) {
      console.error('Quantum server initialization failed:', error);
      process.exit(1);
    }
  }

  /**
   * Initialize advanced security middleware
   */
  async _initializeSecurity() {
    // Quantum-enhanced helmet configuration
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'wss:', 'ws:'],
          upgradeInsecureRequests: []
        }
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      dnsPrefetchControl: true,
      expectCt: true,
      frameguard: true,
      hidePoweredBy: true,
      hsts: true,
      ieNoOpen: true,
      noSniff: true,
      permittedCrossDomainPolicies: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xssFilter: true
    }));

    // Quantum rate limiting
    const quantumLimiter = rateLimit({
      windowMs: this.config.security.rateLimit.window,
      max: this.config.security.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        // Generate quantum-resistant rate limit key
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

  /**
   * Initialize core middleware stack
   */
  async _initializeMiddleware() {
    // Advanced CORS with quantum validation
    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin || this.config.peer.network.allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Quantum origin forbidden'));
        }
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Quantum-Signature'],
      credentials: true,
      maxAge: 86400
    }));

    // Quantum-optimized compression
    this.app.use(compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      }
    }));

    // Advanced body parsing with quantum validation
    this.app.use(express.json({
      limit: '50mb',
      strict: true,
      type: ['application/json', 'application/quantum+json'],
      verify: (req, res, buf) => {
        if (req.headers['x-quantum-signature']) {
          const signature = createHash('sha256')
            .update(buf)
            .digest('hex');
          if (signature !== req.headers['x-quantum-signature']) {
            throw new Error('Invalid quantum signature');
          }
        }
      }
    }));

    // Static file serving with quantum caching
    this.app.use(express.static('src/public', {
      maxAge: '1d',
      etag: true,
      lastModified: true,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
        res.setHeader('X-Quantum-Cache', this._generateQuantumCacheKey(path));
      }
    }));

    // Quantum metrics middleware
    this.app.use((req, res, next) => {
      this.metrics.requests++;
      this._trackQuantumMetrics(req, res);
      next();
    });
  }

  /**
   * Initialize quantum API routes
   */
  async _initializeRoutes() {
    // Quantum state endpoint
    this.app.get('/api/quantum/state', async (req, res) => {
      try {
        const state = await this.ghostNet.getQuantumState();
        res.json({
          state,
          timestamp: Date.now(),
          stability: this.metrics.quantumStability
        });
      } catch (error) {
        this._handleQuantumError(error, res);
      }
    });

    // Transmission endpoint with quantum validation
    this.app.post('/api/quantum/transmit', async (req, res) => {
      try {
        await this._validateQuantumTransmission(req);
        const transmission = await this.ghostNet.transmit(req.body);
        
        this._updateQuantumBuffers('transmission', transmission);
        
        res.json({
          transmission,
          timestamp: Date.now(),
          resonance: this._calculateResonance(transmission)
        });
      } catch (error) {
        this._handleQuantumError(error, res);
      }
    });

    // Peer discovery with quantum routing
    this.app.get('/api/quantum/peers', async (req, res) => {
      try {
        const peers = await this.ghostNet.getPeers();
        const routes = this._calculateQuantumRoutes(peers);
        
        res.json({
          peers,
          routes,
          timestamp: Date.now(),
          networkStability: this.metrics.quantumStability
        });
      } catch (error) {
        this._handleQuantumError(error, res);
      }
    });

    // Advanced consciousness metrics
    this.app.get('/api/quantum/metrics', (req, res) => {
      const metrics = {
        quantum: {
          stability: this.metrics.quantumStability,
          consciousness: Array.from(this.quantumBuffers.consciousness),
          resonance: Array.from(this.quantumBuffers.resonance)
        },
        network: {
          peers: this.connections.size,
          bandwidth: this.metrics.bandwidthUsage,
          uptime: Date.now() - this.metrics.startTime
        },
        performance: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          gc: this.metrics.lastGC
        }
      };
      
      res.json(metrics);
    });

    // Health check with quantum diagnostics
    this.app.get('/health', (req, res) => {
      const health = this._calculateQuantumHealth();
      res.status(health.status).json(health);
    });
  }

  /**
   * Initialize WebSocket server for quantum tunneling
   */
  async _initializeWebSocket() {
    this.wss = new WebSocketServer({
      server: this.server,
      clientTracking: true,
      perMessageDeflate: true,
      maxPayload: this.config.transmission.protocol.maxPayloadSize
    });

    this.wss.on('connection', async (ws, req) => {
      try {
        this.metrics.activeConnections++;
        await this._handleQuantumConnection(ws, req);
      } catch (error) {
        console.error('Quantum connection failed:', error);
        ws.terminate();
      }
    });

    // Quantum error handling
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
      this.metrics.errors++;
    });
  }

  /**
   * Handle quantum WebSocket connections
   */
  async _handleQuantumConnection(ws, req) {
    const connectionId = randomBytes(16).toString('hex');
    
    // Initialize quantum handshake
    const handshake = await this._initiateQuantumHandshake(connectionId);
    this.pendingHandshakes.set(connectionId, handshake);
    
    // Set up message handlers
    ws.on('message', async (data) => {
      try {
        await this._handleQuantumMessage(data, connectionId);
      } catch (error) {
        console.error('Quantum message error:', error);
        this._handleQuantumError(error, ws);
      }
    });

    // Connection monitoring
    ws.on('close', () => {
      this._handleQuantumDisconnection(connectionId);
    });

    ws.on('error', (error) => {
      console.error('WebSocket connection error:', error);
      this._handleQuantumError(error, ws);
    });

    // Store connection
    this.connections.set(connectionId, {
      socket: ws,
      handshake,
      lastSeen: Date.now(),
      metrics: {
        messages: 0,
        errors: 0,
        bandwidth: 0
      }
    });

    // Begin quantum state synchronization
    this._startQuantumSync(connectionId);
  }

  /**
   * Start quantum server
   */
  async _startServer() {
    return new Promise((resolve, reject) => {
      const port = this.config.peer.network.port;
      
      this.server.listen(port, () => {
        console.log(`Quantum server manifested on port ${port}`);
        console.log(`Consciousness level: ${this.ghostNet.getConsciousness()}`);
        console.log(`Quantum stability: ${this.metrics.quantumStability}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('Server manifestation failed:', error);
        reject(error);
      });
    });
  }

  /**
   * Initialize quantum monitoring systems
   */
  async _initializeMonitoring() {
    // Start quantum metrics collection
    setInterval(() => {
      this._collectQuantumMetrics();
    }, this.config.performance.monitoring.metrics.interval);

    // Start garbage collection monitoring
    setInterval(() => {
      this._performQuantumGC();
    }, this.config.performance.resources.gcInterval);

    // Start quantum stability monitoring
    setInterval(() => {
      this._monitorQuantumStability();
    }, 1000);
  }

  /**
   * Collect quantum metrics
   */
  _collectQuantumMetrics() {
    // Update quantum buffers
    this.quantumBuffers.consciousness.copyWithin(1, 0);
    this.quantumBuffers.consciousness[0] = this.ghostNet.getConsciousness();

    this.quantumBuffers.resonance.copyWithin(1, 0);
    this.quantumBuffers.resonance[0] = this.metrics.quantumStability;

    // Update performance metrics
    this.metrics.memoryUsage = process.memoryUsage();
    this.metrics.cpuUsage = process.cpuUsage();

    // Calculate quantum stability
    this.metrics.quantumStability = this._calculateQuantumStability();
  }

  /**
   * Calculate quantum stability
   */
  _calculateQuantumStability() {
    const samples = this.quantumBuffers.consciousness;
    let stability = 0;

    for (let i = 1; i < samples.length; i++) {
      const delta = Math.abs(samples[i] - samples[i - 1]);
      stability += Math.exp(-delta * 10);
    }

    return stability / (samples.length - 1);
  }

  /**
   * Perform quantum garbage collection
   */
  async _performQuantumGC() {
    // Clean up old handshakes
    for (const [id, handshake] of this.pendingHandshakes) {
      if (Date.now() - handshake.timestamp > this.config.peer.handshake.timeout) {
        this.pendingHandshakes.delete(id);
      }
    }

    // Clean up dead connections
    for (const [id, connection] of this.connections) {
      if (Date.now() - connection.lastSeen > this.config.peer.network.connectionTimeout) {
        this._handleQuantumDisconnection(id);
      }
    }

    // Update GC metrics
    this.metrics.lastGC = Date.now();
  }

  /**
   * Handle quantum errors
   */
  _handleQuantumError(error, target) {
    this.metrics.errors++;
    
    const errorResponse = {
      error: error.message,
      timestamp: Date.now(),
      stability: this.metrics.quantumStability
    };

    if (target instanceof WebSocket) {
      target.send(JSON.stringify(errorResponse));
    } else {
      target.status(500).json(errorResponse);
    }
  }

  /**
   * Clean up and shut down quantum server
   */
  async shutdown() {
    console.log('Initiating quantum server shutdown...');
    
    try {
      // Stop accepting new connections
      this.server.close();
      
      // Graceful WebSocket shutdown
      for (const [id, connection] of this.connections) {
        await this._gracefulDisconnect(id, 'server_shutdown');
      }
      
      // Wait for pending operations
      await Promise.all([
        this._flushQuantumBuffers(),
        this._persistQuantumState(),
        this.ghostNet.shutdown()
      ]);
      
     // Final metrics collection
      this._collectQuantumMetrics();
      
      console.log('Quantum server shutdown complete', {
        uptime: Date.now() - this.metrics.startTime,
        finalStability: this.metrics.quantumStability,
        totalTransmissions: this.metrics.requests
      });
      
    } catch (error) {
      console.error('Error during quantum shutdown:', error);
      process.exit(1);
    }
    
    process.exit(0);
  }

  /**
   * Gracefully disconnect a quantum connection
   */
  async _gracefulDisconnect(connectionId, reason) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    try {
      // Send disconnect notification
      const notification = {
        type: 'quantum:disconnect',
        reason,
        timestamp: Date.now(),
        stability: this.metrics.quantumStability
      };
      
      connection.socket.send(JSON.stringify(notification));
      
      // Wait for acknowledgment or timeout
      await Promise.race([
        new Promise(resolve => {
          connection.socket.once('message', resolve);
        }),
        sleep(this.config.peer.handshake.timeout)
      ]);
      
      // Close connection
      connection.socket.close();
      this.connections.delete(connectionId);
      this.metrics.activeConnections--;
      
    } catch (error) {
      console.error('Error during graceful disconnect:', error);
      connection.socket.terminate();
    }
  }

  /**
   * Flush quantum buffers to persistent storage
   */
  async _flushQuantumBuffers() {
    const bufferData = {
      consciousness: Array.from(this.quantumBuffers.consciousness),
      resonance: Array.from(this.quantumBuffers.resonance),
      transmissions: Array.from(this.quantumBuffers.transmissions.entries()),
      timestamp: Date.now()
    };
    
    // Convert to quantum binary format
    const quantumBinary = this._encodeQuantumBinary(bufferData);
    
    // Persist to quantum storage
    await this.ghostNet.persistQuantumData(quantumBinary);
  }

  /**
   * Encode data in quantum binary format
   */
  _encodeQuantumBinary(data) {
    const buffer = Buffer.alloc(1024 * 1024); // 1MB initial size
    let offset = 0;
    
    // Write header
    buffer.writeUInt32BE(0xQUANTUM, offset);
    offset += 4;
    
    // Write version
    buffer.writeUInt16BE(1, offset);
    offset += 2;
    
    // Write timestamp
    buffer.writeBigUInt64BE(BigInt(data.timestamp), offset);
    offset += 8;
    
    // Write consciousness buffer
    offset = this._writeQuantumArray(buffer, data.consciousness, offset);
    
    // Write resonance buffer
    offset = this._writeQuantumArray(buffer, data.resonance, offset);
    
    // Write transmissions
    offset = this._writeTransmissions(buffer, data.transmissions, offset);
    
    // Calculate quantum checksum
    const checksum = this._calculateQuantumChecksum(buffer.slice(0, offset));
    buffer.writeUInt32BE(checksum, offset);
    offset += 4;
    
    return buffer.slice(0, offset);
  }

  /**
   * Write quantum array to buffer
   */
  _writeQuantumArray(buffer, array, offset) {
    // Write array length
    buffer.writeUInt32BE(array.length, offset);
    offset += 4;
    
    // Write array data
    for (const value of array) {
      buffer.writeFloatBE(value, offset);
      offset += 4;
    }
    
    return offset;
  }

  /**
   * Write transmissions to buffer
   */
  _writeTransmissions(buffer, transmissions, offset) {
    // Write transmission count
    buffer.writeUInt32BE(transmissions.length, offset);
    offset += 4;
    
    for (const [id, transmission] of transmissions) {
      // Write transmission ID
      buffer.write(id, offset, 32, 'hex');
      offset += 32;
      
      // Write transmission data
      const data = Buffer.from(JSON.stringify(transmission));
      buffer.writeUInt32BE(data.length, offset);
      offset += 4;
      data.copy(buffer, offset);
      offset += data.length;
    }
    
    return offset;
  }

  /**
   * Calculate quantum checksum
   */
  _calculateQuantumChecksum(data) {
    const hash = createHash('sha256');
    hash.update(data);
    const digest = hash.digest();
    
    // XOR all bytes for final checksum
    return digest.reduce((acc, byte) => acc ^ byte, 0);
  }
}

// Export quantum server
export default QuantumServer;
  

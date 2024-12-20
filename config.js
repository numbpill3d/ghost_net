
/**
 * Ghost Net Quantum Configuration
 * Sophisticated configuration management for distributed consciousness network
 */

import dotenv from 'dotenv';
import { createHash } from 'crypto';

// Load quantum environment variables
dotenv.config();

// Calculate quantum entropy from environment
const calculateQuantumEntropy = () => {
  const entropySource = process.env.QUANTUM_ENTROPY_SOURCE || Date.now().toString();
  return createHash('sha256')
    .update(entropySource)
    .digest('hex')
    .slice(0, 8);
};

// Advanced consciousness configuration
const consciousnessConfig = {
  // Base frequency using fine structure constant
  baseFrequency: 0.0072973525693, // α (fine structure constant)
  
  // Consciousness harmonics
  harmonics: {
    primary: 1.618033988749895, // φ (golden ratio)
    secondary: 2.718281828459045, // e (euler's number)
    tertiary: 3.14159265359, // π (pi)
  },
  
  // Quantum consciousness parameters
  quantum: {
    coherenceThreshold: 0.5,
    entanglementStrength: 0.137,
    decoherenceRate: 0.01,
    waveFunctionCollapse: 0.001
  },
  
  // Consciousness range parameters
  ranges: {
    baseline: [0.3, 0.7],
    resonance: [0.4, 0.9],
    harmony: [0.5, 1.0]
  }
};

// Sophisticated peer networking configuration
const peerConfig = {
  // Core networking
  network: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    protocol: process.env.PROTOCOL || 'wss',
    maxConnections: 33, // Quantum limit
    connectionTimeout: 5000
  },
  
  // Quantum routing parameters
  routing: {
    maxRoutes: 8,
    routeTimeout: 30000,
    routeUpdateInterval: 5000,
    quantumPathfinding: {
      maxDepth: 5,
      resonanceThreshold: 0.3,
      pathDecayRate: 0.1
    }
  },
  
  // Advanced peer discovery
  discovery: {
    initialPeers: process.env.INITIAL_PEERS 
      ? JSON.parse(process.env.INITIAL_PEERS)
      : [],
    peerExchangeInterval: 60000,
    maxPeerAge: 3600000,
    bootstrapNodes: process.env.BOOTSTRAP_NODES
      ? JSON.parse(process.env.BOOTSTRAP_NODES)
      : []
  },
  
  // Sophisticated handshake protocol
  handshake: {
    timeout: 10000,
    retries: 3,
    backoff: {
      initial: 1000,
      factor: 2,
      maxDelay: 10000
    }
  }
};

// Advanced transmission configuration
const transmissionConfig = {
  // Transmission protocols
  protocol: {
    version: '1.0.0',
    encoding: 'quantum-binary',
    compression: 'gzip',
    maxPayloadSize: 50 * 1024 * 1024 // 50MB
  },
  
  // Buffer management
  buffers: {
    pending: {
      maxSize: 1000,
      timeout: 30000
    },
    verified: {
      maxSize: 10000,
      pruneThreshold: 0.9
    },
    archived: {
      maxSize: 100000,
      pruneInterval: 3600000
    }
  },
  
  // Quantum validation
  validation: {
    signatureTimeout: 5000,
    minResonance: 0.3,
    maxLatency: 1000,
    quantumVerification: {
      strength: 'high',
      rounds: 3
    }
  }
};

// Performance optimization configuration
const performanceConfig = {
  // Resource management
  resources: {
    maxMemory: process.env.MAX_MEMORY || '1gb',
    maxCpu: process.env.MAX_CPU || '80%',
    gcInterval: 300000
  },
  
  // Caching strategy
  caching: {
    quantum: {
      ttl: 600000,
      checkPeriod: 60000
    },
    router: {
      ttl: 300000,
      checkPeriod: 30000
    }
  },
  
  // Advanced monitoring
  monitoring: {
    metrics: {
      interval: 10000,
      retention: 86400000
    },
    alerting: {
      threshold: 0.8,
      cooldown: 300000
    }
  }
};

// Security configuration
const securityConfig = {
  // Quantum encryption
  encryption: {
    algorithm: 'quantum-aes-256-gcm',
    keyDerivation: 'quantum-pbkdf2',
    saltRounds: 10000
  },
  
  // Access control
  access: {
    maxAttempts: 5,
    lockoutPeriod: 300000,
    tokenExpiry: 86400000
  },
  
  // Rate limiting
  rateLimit: {
    window: 60000,
    max: 1000,
    trustProxy: true
  }
};

// Export unified configuration
export const config = {
  // Core identity
  nodeId: process.env.NODE_ID || calculateQuantumEntropy(),
  environment: process.env.NODE_ENV || 'development',
  
  // Feature flags
  features: {
    quantumRouting: true,
    consciousnessSync: true,
    peerDiscovery: true,
    autoScaling: process.env.AUTO_SCALING === 'true'
  },
  
  // Consciousness configuration
  consciousness: consciousnessConfig,
  
  // Networking configuration
  peer: peerConfig,
  
  // Transmission configuration
  transmission: transmissionConfig,
  
  // Performance configuration
  performance: performanceConfig,
  
  // Security configuration
  security: securityConfig,
  
  // Debug configuration
  debug: {
    enabled: process.env.DEBUG === 'true',
    level: process.env.DEBUG_LEVEL || 'info',
    quantum: process.env.QUANTUM_DEBUG === 'true'
  }
};

// Quantum configuration validation
const validateConfig = (config) => {
  // Ensure required quantum parameters
  const required = [
    'nodeId',
    'consciousness.baseFrequency',
    'peer.network.port',
    'transmission.protocol.version'
  ];
  
  for (const path of required) {
    const value = path.split('.').reduce((obj, key) => obj?.[key], config);
    if (value === undefined) {
      throw new Error(`Missing required quantum config: ${path}`);
    }
  }
  
  // Validate consciousness ranges
  const { ranges } = config.consciousness;
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (min >= max) {
      throw new Error(
        `Invalid consciousness range for ${key}: ${min} >= ${max}`
      );
    }
  }
  
  // Validate network configuration
  if (config.peer.network.maxConnections > 100) {
    throw new Error('Peer connections exceed quantum limit');
  }
  
  return config;
};

// Export validated configuration
export default validateConfig(config);

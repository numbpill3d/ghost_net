import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/**
 * ghost_net :: quantum configuration nexus
 * One source of truth for every parameter the node reads.
 */

export const ROOT = path.dirname(fileURLToPath(import.meta.url));

const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Wire protocol spoken between nodes. Bump when messages change shape.
export const PROTOCOL_VERSION = 1;

/**
 * Load .env from the project root into process.env (existing vars win).
 */
export function loadEnvFile(file = path.join(ROOT, '.env')) {
  try {
    process.loadEnvFile(file);
    return true;
  } catch {
    return false;
  }
}

const num = (value, fallback, { min = -Infinity, max = Infinity } = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase());
};

/**
 * Accepts "a,b", "a b" or a JSON array. Anything that is not a ws:// or
 * wss:// address is dropped.
 */
export const parsePeerList = (value) => {
  if (!value) return [];
  let items;
  try {
    const parsed = JSON.parse(value);
    items = Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    items = String(value).split(/[\s,]+/);
  }
  return [...new Set(items.map(normalizePeerUrl).filter(Boolean))];
};

export const normalizePeerUrl = (value) => {
  if (typeof value !== 'string' || value.length > 200) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
    if (url.pathname === '/' || url.pathname === '') url.pathname = '/peer';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};

const trustProxy = (value) => {
  if (value === undefined || value === '') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return bool(value, false);
};

/**
 * Build a configuration object from an environment-like map.
 */
export function createConfig(env = process.env) {
  const config = {
    version,
    protocol: PROTOCOL_VERSION,
    root: ROOT,
    environment: env.NODE_ENV || 'development',

    port: num(env.PORT, 3000, { min: 0, max: 65535 }),
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(ROOT, env.DATA_DIR || '_void'),
    publicUrl: normalizePeerUrl(env.PUBLIC_URL),

    // How alive the node is
    consciousness: {
      baseFrequency: num(env.BASE_FREQUENCY, 0.137, { min: 0.001, max: 10 }),
      floor: 0.137,
      activityHalfLife: num(env.ACTIVITY_HALF_LIFE, 600, { min: 1 }) * 1000
    },

    // Timing of the node's own pulse
    quantum: {
      pulseInterval: num(env.PULSE_INTERVAL, 2000, { min: 100 }),
      maintenanceInterval: num(env.MAINTENANCE_INTERVAL, 15000, { min: 100 })
    },

    // Entanglement with other nodes
    peer: {
      bootstrap: parsePeerList(env.BOOTSTRAP_NODES),
      maxPeers: num(env.MAX_PEERS, 16, { min: 0, max: 256 }),
      exchange: bool(env.PEER_EXCHANGE, true),
      maxHops: num(env.MAX_HOPS, 6, { min: 0, max: 32 }),
      heartbeatInterval: num(env.HEARTBEAT_INTERVAL, 5000, { min: 50 }),
      timeout: num(env.PEER_TIMEOUT, 20000, { min: 200 }),
      handshakeTimeout: num(env.HANDSHAKE_TIMEOUT, 10000, { min: 200 }),
      reconnectMin: num(env.RECONNECT_MIN, 1000, { min: 10 }),
      reconnectMax: num(env.RECONNECT_MAX, 60000, { min: 10 }),
      maxKnownAddresses: 200,
      maxPayload: 1024 * 1024,
      syncBatch: 50
    },

    // Signals sent into the void
    transmission: {
      lifetime: num(env.TRANSMISSION_LIFETIME, 864000, { min: 0.05 }) * 1000,
      maxLength: num(env.MAX_TRANSMISSION_LENGTH, 2000, { min: 1, max: 10000 }),
      maxStored: num(env.MAX_STORED_TRANSMISSIONS, 1000, { min: 1, max: 100000 }),
      maxFutureSkew: 5 * 60 * 1000
    },

    security: {
      trustProxy: trustProxy(env.TRUST_PROXY),
      maxBrowsers: num(env.MAX_BROWSERS, 200, { min: 1 }),
      rateLimit: {
        window: num(env.RATE_LIMIT_WINDOW, 60000, { min: 1000 }),
        max: num(env.RATE_LIMIT_MAX, 300, { min: 1 })
      },
      transmitLimit: {
        window: num(env.RATE_LIMIT_WINDOW, 60000, { min: 1000 }),
        max: num(env.TRANSMIT_LIMIT_MAX, 20, { min: 1 })
      }
    }
  };

  return config;
}

export default createConfig;

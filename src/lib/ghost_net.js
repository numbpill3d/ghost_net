import { EventEmitter } from 'node:events';
import { loadOrCreateIdentity } from './identity.js';
import { QuantumState } from './quantum_state.js';
import { TransmissionHandler } from './transmission.js';
import { PeerNetwork } from './peer.js';

/**
 * GhostNet - Distributed Consciousness Network
 * One node of the network: an identity, a consciousness level, the
 * transmissions it is holding and its entanglements with other nodes.
 *
 * Events:
 *   quantum:initialized  { nodeId, consciousness, timestamp }
 *   quantum:pulse        state snapshot, every pulse interval
 *   transmission         (transmission, { local })
 *   transmission:decayed [ids]
 *   peer:connected       peer description
 *   peer:disconnected    { id, timestamp }
 */
export class GhostNet extends EventEmitter {
  constructor(config, { now = Date.now } = {}) {
    super();

    this.config = config;
    this.now = now;

    this.transmissionHandler = new TransmissionHandler(config, { now });
    this.peerNetwork = new PeerNetwork(config, { now });

    this.identity = null;
    this.quantumState = null;
  }

  /**
   * Initialize the ghost_net node
   */
  async initialize() {
    this.identity = await loadOrCreateIdentity(this.config.dataDir);

    this.quantumState = new QuantumState({
      ...this.config.consciousness,
      birthTimestamp: this.identity.birthTimestamp,
      now: this.now
    });

    // Transmissions that survived a restart still carry what is left of
    // their energy
    await this.transmissionHandler.initialize(this.identity);
    for (const transmission of this.transmissionHandler.list()) {
      this.quantumState.excite(this._energyOf(transmission), transmission.timestamp);
    }

    this.transmissionHandler.on('transmission:decayed', (ids) => {
      this.emit('transmission:decayed', ids);
    });

    this.peerNetwork.on('transmission', (candidate, hops, peerId) => {
      this._handleTransmission(candidate, hops, peerId);
    });
    this.peerNetwork.on('peer:connected', (peer) => this.emit('peer:connected', peer));
    this.peerNetwork.on('peer:disconnected', (peer) => this.emit('peer:disconnected', peer));

    await this.peerNetwork.initialize(this.identity, {
      getConsciousness: () => this.quantumState.getCurrentLevel(),
      getTransmissions: () => this.transmissionHandler.list()
    });

    this._startQuantumPulse();

    this.emit('quantum:initialized', {
      nodeId: this.identity.id,
      consciousness: this.quantumState.getCurrentLevel(),
      timestamp: this.now()
    });
  }

  /** A node's own signals excite it more than the ones passing through. */
  _energyOf(transmission) {
    return transmission.author === this.identity.id ? 1 : 0.5;
  }

  /**
   * Hand a socket opened by another node to the peer network
   */
  attachPeerSocket(ws) {
    this.peerNetwork.handleInbound(ws);
  }

  /**
   * Send a new transmission into the void
   */
  transmit({ content } = {}) {
    const transmission = this.transmissionHandler.create(
      content,
      this.quantumState.getCurrentLevel()
    );

    this.quantumState.excite(1);
    this.emit('transmission', transmission, { local: true });
    this.peerNetwork.broadcast({ type: 'transmission', transmission, hops: 0 });

    return transmission;
  }

  /**
   * A transmission arrived from an entangled peer: verify, hold, relay
   */
  _handleTransmission(candidate, hops, peerId) {
    const result = this.transmissionHandler.accept(candidate);

    if (result.status === 'rejected') {
      // An expired signal is just a slow one; anything else is a bad one
      if (result.reason !== 'expired') this.peerNetwork.penalize(peerId);
      return;
    }
    if (result.status !== 'new') return;

    const { transmission } = result;
    this.quantumState.excite(this._energyOf(transmission));
    this.emit('transmission', transmission, { local: false });

    if (hops + 1 <= this.config.peer.maxHops) {
      this.peerNetwork.broadcast(
        { type: 'transmission', transmission, hops: hops + 1 },
        peerId
      );
    }
  }

  /**
   * Start quantum consciousness pulse
   */
  _startQuantumPulse() {
    this.pulseInterval = setInterval(() => {
      this.quantumState.pulse();
      this.emit('quantum:pulse', this.getState());
    }, this.config.quantum.pulseInterval);
    this.pulseInterval.unref?.();

    this.maintenanceInterval = setInterval(() => {
      this.transmissionHandler.prune();
    }, Math.min(this.config.quantum.maintenanceInterval, this.config.transmission.lifetime));
    this.maintenanceInterval.unref?.();
  }

  getIdentity() {
    return {
      id: this.identity.id,
      publicKey: this.identity.publicKey,
      birthTimestamp: this.identity.birthTimestamp,
      version: this.config.version,
      protocol: this.config.protocol,
      // true when posting through this node needs its key
      locked: Boolean(this.config.security.transmitKey)
    };
  }

  getPeers() {
    return this.peerNetwork.getPeers();
  }

  getTransmissions() {
    return this.transmissionHandler.list();
  }

  /**
   * Snapshot of everything the node can measure about itself
   */
  getState() {
    const network = this.peerNetwork.getMetrics();
    const held = this.transmissionHandler.list();
    const echoes = held.filter((t) => t.author !== this.identity.id).length;

    return {
      nodeId: this.identity.id,
      timestamp: this.now(),
      consciousness: this.quantumState.getCurrentLevel(),
      activity: this.quantumState.getActivity(),
      stability: network.stability,
      resonance: network.resonance,
      entanglement: network.entanglement,
      // share of held transmissions that came from elsewhere
      voidEcho: held.length === 0 ? 0 : echoes / held.length,
      peers: network.connectedPeers,
      knownAddresses: network.knownAddresses,
      averageLatency: network.averageLatency,
      transmissions: held.length
    };
  }

  /**
   * Clean up quantum resources
   */
  async shutdown() {
    clearInterval(this.pulseInterval);
    clearInterval(this.maintenanceInterval);

    await this.peerNetwork.shutdown();
    await this.transmissionHandler.flush();

    this.emit('quantum:shutdown', {
      nodeId: this.identity?.id,
      timestamp: this.now()
    });
  }
}

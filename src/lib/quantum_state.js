/**
 * QuantumState
 * The node's consciousness level: a number in [0, 1] that says how alive the
 * node is right now. Two things feed it:
 *
 *   activity  every transmission the node sends or relays adds energy, which
 *             decays with a half-life
 *   breath    a slow oscillation at the base frequency, so an idle node
 *             still has a pulse
 */
export class QuantumState {
  constructor({
    baseFrequency = 0.137,
    floor = 0.137,
    activityHalfLife = 600000,
    birthTimestamp = Date.now(),
    now = Date.now
  } = {}) {
    this.baseFrequency = baseFrequency;
    this.floor = floor;
    this.activityHalfLife = activityHalfLife;
    this.birthTimestamp = birthTimestamp;
    this.now = now;

    this.energy = 0;
    this.energyAt = now();

    // Rolling record of recent pulses
    this.samples = new Float32Array(120);
    this.sampleCount = 0;
  }

  _decayedEnergy(at) {
    const elapsed = Math.max(0, at - this.energyAt);
    return this.energy * Math.pow(0.5, elapsed / this.activityHalfLife);
  }

  /**
   * Add activity energy. `at` lets stored transmissions count for what is
   * left of them when a node restarts.
   */
  excite(amount = 1, at = this.now()) {
    const now = this.now();
    const age = Math.max(0, now - at);
    this.energy = this._decayedEnergy(now) + amount * Math.pow(0.5, age / this.activityHalfLife);
    this.energyAt = now;
  }

  /** Activity component in [0, 1). */
  getActivity(at = this.now()) {
    return 1 - Math.exp(-this._decayedEnergy(at) / 4);
  }

  /** Current consciousness level in [0, 1]. */
  getCurrentLevel(at = this.now()) {
    const seconds = (at - this.birthTimestamp) / 1000;
    const breath = 0.5 + 0.5 * Math.sin(2 * Math.PI * this.baseFrequency * seconds);
    const level = this.floor + (1 - this.floor) * (0.8 * this.getActivity(at) + 0.2 * breath);
    return Math.min(1, Math.max(0, level));
  }

  /** Record a sample of the current level. */
  pulse() {
    const level = this.getCurrentLevel();
    this.samples.copyWithin(1, 0);
    this.samples[0] = level;
    this.sampleCount = Math.min(this.samples.length, this.sampleCount + 1);
    return level;
  }

  /** Recent samples, oldest first. */
  history() {
    return Array.from(this.samples.subarray(0, this.sampleCount)).reverse();
  }

  /** Resonance between two consciousness levels: 1 when equal, 0 when opposite. */
  static resonance(local, remote) {
    if (!Number.isFinite(local) || !Number.isFinite(remote)) return 0;
    return 1 - Math.min(1, Math.abs(local - remote));
  }
}

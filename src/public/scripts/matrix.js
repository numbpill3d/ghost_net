/**
 * Quantum Consciousness Matrix
 * The browser side of a ghost_net node: shows what the node is, what it is
 * holding and who it is entangled with, and sends transmissions through it.
 */

const SIGIL_GLYPHS = ['⚡', '□', '▽', '○', '╳', '△', '╱', '╲', '☯', '✧'];
const HISTORY_LENGTH = 120;

const $ = (id) => document.getElementById(id);
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const shortId = (id) => `${id.slice(0, 8)}…${id.slice(-4)}`;

/**
 * A node's sigil is drawn from its id, so the same node always looks the same.
 */
function sigilFor(id) {
  const rows = [];
  for (let row = 0; row < 3; row++) {
    let line = '';
    for (let col = 0; col < 3; col++) {
      const byte = parseInt(id.slice((row * 3 + col) * 2, (row * 3 + col) * 2 + 2), 16) || 0;
      line += SIGIL_GLYPHS[byte % SIGIL_GLYPHS.length];
      if (col < 2) line += ' ';
    }
    rows.push(line);
  }
  return rows.join('\n');
}

function relativeTime(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function remaining(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 129600) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The drifting particle field behind the interface. Its speed follows the
 * node's consciousness and its connecting lines follow entanglement.
 */
class QuantumField {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.ripples = [];
    this.pointer = null;
    this.consciousness = 0.2;
    this.entanglement = 0;
    this.lastFrame = 0;
    this.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointermove', (event) => {
      this.pointer = { x: event.clientX, y: event.clientY };
    });
    document.addEventListener('pointerleave', () => { this.pointer = null; });

    if (this.still) this.draw();
    else requestAnimationFrame((time) => this.frame(time));
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * ratio);
    this.canvas.height = Math.floor(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const wanted = Math.max(16, Math.min(80, Math.floor((this.width * this.height) / 24000)));
    while (this.particles.length < wanted) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        size: Math.random() * 1.4 + 0.6
      });
    }
    this.particles.length = wanted;
    if (this.still) this.draw();
  }

  ripple() {
    if (this.still) return;
    this.ripples.push({ x: this.width / 2, y: this.height / 3, radius: 0, life: 1 });
  }

  frame(time) {
    requestAnimationFrame((next) => this.frame(next));
    if (document.hidden || time - this.lastFrame < 33) return;
    this.lastFrame = time;
    this.step();
    this.draw();
  }

  step() {
    const speed = 0.4 + this.consciousness * 1.6;

    for (const p of this.particles) {
      if (this.pointer) {
        const dx = p.x - this.pointer.x;
        const dy = p.y - this.pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 1 && distance < 140) {
          const push = (1 - distance / 140) * 0.6;
          p.x += (dx / distance) * push;
          p.y += (dy / distance) * push;
        }
      }

      p.x += p.vx * speed;
      p.y += p.vy * speed;
      if (p.x < -10) p.x = this.width + 10;
      if (p.x > this.width + 10) p.x = -10;
      if (p.y < -10) p.y = this.height + 10;
      if (p.y > this.height + 10) p.y = -10;
    }

    for (const ripple of this.ripples) {
      ripple.radius += 9;
      ripple.life -= 0.018;
    }
    this.ripples = this.ripples.filter((ripple) => ripple.life > 0);
  }

  draw() {
    const { ctx, particles } = this;
    ctx.clearRect(0, 0, this.width, this.height);

    const reach = 120;
    const lineStrength = 0.06 + this.entanglement * 0.3;
    ctx.lineWidth = 1;

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = Math.hypot(dx, dy);
        if (distance >= reach) continue;
        ctx.strokeStyle = `rgba(0, 255, 255, ${(1 - distance / reach) * lineStrength})`;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = `rgba(0, 255, 0, ${0.25 + this.consciousness * 0.5})`;
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const ripple of this.ripples) {
      ctx.strokeStyle = `rgba(0, 255, 0, ${ripple.life * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

class ConsciousnessMatrix {
  constructor() {
    this.identity = null;
    this.lifetime = 0;
    this.maxLength = 2000;
    this.state = null;
    this.peers = [];

    // Consciousness over time: this node, and each entangled peer
    this.history = [];
    this.peerHistory = new Map();

    // Transmissions on screen, by id
    this.transmissions = new Map();

    this.reconnectDelay = 1000;
    this.sending = false;

    this.field = new QuantumField($('quantumField'));
    this.chart = $('consciousnessCanvas');

    this.initializeEventHorizon();
    this.initializeQuantumTunneling();

    // Keep ages and decay moving between pulses
    setInterval(() => this.applyQuantumDecay(), 1000);
  }

  // -------------------------------------------------------------------
  // Tunnel to the node
  // -------------------------------------------------------------------

  initializeQuantumTunneling() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tunnel = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.quantumTunnel = tunnel;

    tunnel.onopen = () => {
      this.reconnectDelay = 1000;
      this.setLinkStatus('open', 'tunnel open');
    };

    tunnel.onmessage = (event) => {
      let packet;
      try {
        packet = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handleQuantumPacket(packet);
    };

    tunnel.onclose = () => {
      this.setLinkStatus('severed', 'tunnel severed — reconnecting...');
      setTimeout(() => this.initializeQuantumTunneling(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
    };
  }

  handleQuantumPacket(packet) {
    switch (packet.type) {
      case 'handshake':
        this.receiveHandshake(packet);
        break;
      case 'sync':
        this.updateQuantumState(packet.state, packet.peers);
        break;
      case 'transmission':
        this.receiveTransmission(packet.transmission, true);
        break;
      case 'decayed':
        for (const id of packet.ids) this.dissolve(id);
        break;
    }
  }

  /**
   * Everything the node knows, sent once per connection
   */
  receiveHandshake(packet) {
    this.identity = packet.identity;
    this.lifetime = packet.lifetime;
    this.maxLength = packet.maxLength;
    this.history = packet.history.slice(-HISTORY_LENGTH);

    $('nodeSigil').textContent = sigilFor(this.identity.id);
    $('nodeId').textContent = `ghost_net node ${shortId(this.identity.id)}`;
    $('nodeId').title = this.identity.id;
    $('quantumSignature').textContent = `signing as ${shortId(this.identity.id)} · ed25519`;
    $('transmissionInput').maxLength = this.maxLength;
    this.updateCharCount();

    // The node is the source of truth: redraw the stream from what it holds
    for (const id of [...this.transmissions.keys()]) this.dissolve(id);
    for (const transmission of [...packet.transmissions].reverse()) {
      this.receiveTransmission(transmission, false);
    }

    this.updateQuantumState(packet.state, packet.peers, false);
  }

  setLinkStatus(state, text) {
    const status = $('linkStatus');
    status.dataset.state = state;
    status.textContent = text;
  }

  // -------------------------------------------------------------------
  // Node state
  // -------------------------------------------------------------------

  updateQuantumState(state, peers, record = true) {
    this.state = state;
    this.peers = peers;

    if (record) {
      this.history.push(state.consciousness);
      if (this.history.length > HISTORY_LENGTH) this.history.shift();
    }

    const present = new Set();
    for (const peer of peers) {
      present.add(peer.id);
      if (peer.consciousness === null) continue;
      const trace = this.peerHistory.get(peer.id) ?? [];
      trace.push(peer.consciousness);
      if (trace.length > HISTORY_LENGTH) trace.shift();
      this.peerHistory.set(peer.id, trace);
    }
    for (const id of this.peerHistory.keys()) {
      if (!present.has(id)) this.peerHistory.delete(id);
    }

    this.updateConsciousnessDisplay();
    this.renderPeers();
    this.renderConsciousnessChart();
    this.applyQuantumDecay();
  }

  updateConsciousnessDisplay() {
    const { state } = this;

    $('consciousnessValue').textContent = state.consciousness.toFixed(3);
    $('stabilityValue').textContent = state.stability.toFixed(3);
    $('resonanceValue').textContent = state.resonance.toFixed(3);
    $('entanglementValue').textContent = state.entanglement.toFixed(3);
    $('voidEchoValue').textContent = state.voidEcho.toFixed(3);

    const root = document.documentElement.style;
    root.setProperty('--consciousness', clamp01(state.consciousness).toFixed(3));
    root.setProperty('--resonance', clamp01(state.resonance).toFixed(3));

    this.field.consciousness = clamp01(state.consciousness);
    this.field.entanglement = clamp01(state.entanglement);
  }

  renderConsciousnessChart() {
    const canvas = this.chart;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = 6;
    const x = (index, length) => pad + ((HISTORY_LENGTH - length + index) / (HISTORY_LENGTH - 1)) * (width - pad * 2);
    const y = (value) => height - pad - clamp01(value) * (height - pad * 2);

    // quarter lines
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.12)';
    ctx.lineWidth = 1;
    for (const level of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(pad, y(level));
      ctx.lineTo(width - pad, y(level));
      ctx.stroke();
    }

    const trace = (values, stroke, lineWidth) => {
      if (values.length < 2) return;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      values.forEach((value, index) => {
        if (index === 0) ctx.moveTo(x(index, values.length), y(value));
        else ctx.lineTo(x(index, values.length), y(value));
      });
      ctx.stroke();
    };

    for (const values of this.peerHistory.values()) trace(values, 'rgba(0, 255, 255, 0.45)', 1);
    trace(this.history, '#00ff00', 2);
  }

  // -------------------------------------------------------------------
  // Peers
  // -------------------------------------------------------------------

  renderPeers() {
    const grid = $('peerGrid');
    $('peerCount').textContent = `[${this.peers.length}]`;

    if (this.peers.length === 0) {
      const empty = el('p', 'empty-state');
      empty.textContent = 'no entanglements — this node is alone in the void. ';
      empty.append(el('span', 'hint', 'start another node with BOOTSTRAP_NODES pointing at this one.'));
      grid.replaceChildren(empty);
      return;
    }

    const cards = [...this.peers]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((peer) => {
        const card = el('article', 'peer');
        card.title = peer.id;

        const head = el('div', 'peer-head');
        head.append(el('div', 'peer-sigil', sigilFor(peer.id)));

        const meta = el('div', 'peer-meta');
        meta.append(el('div', 'peer-id', shortId(peer.id)));
        meta.append(el('div', 'peer-direction', peer.direction === 'out' ? 'reached out to' : 'found this node'));
        head.append(meta);
        card.append(head);

        const bar = el('div', 'peer-consciousness');
        const fill = el('div', 'consciousness-bar');
        fill.style.width = `${clamp01(peer.consciousness) * 100}%`;
        bar.append(fill);
        card.append(bar);

        const readings = el('dl', 'peer-readings');
        const reading = (label, value) => {
          readings.append(el('dt', '', label), el('dd', '', value));
        };
        reading('consciousness', peer.consciousness === null ? '—' : peer.consciousness.toFixed(3));
        reading('resonance', peer.resonance === null ? '—' : peer.resonance.toFixed(3));
        reading('latency', peer.latency === null ? '—' : `${peer.latency} ms`);
        reading('entangled', relativeTime(peer.connectedAt));
        card.append(readings);

        return card;
      });

    grid.replaceChildren(...cards);
  }

  // -------------------------------------------------------------------
  // Transmissions
  // -------------------------------------------------------------------

  /**
   * Transmit consciousness to the void
   */
  async transmit() {
    const input = $('transmissionInput');
    const content = input.value.trim();
    if (!content || this.sending) return;

    this.sending = true;
    $('transmitButton').disabled = true;

    try {
      const response = await fetch('/api/transmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const wait = body.retryAfter ? ` try again in ${body.retryAfter}s.` : '';
        throw new Error(`${body.error || `transmission failed (${response.status})`}${wait ? '.' + wait : ''}`);
      }

      input.value = '';
      this.updateCharCount();
      this.receiveTransmission(body.transmission, true);
    } catch (error) {
      this.quantumErrorCorrection(
        error instanceof TypeError ? 'the node is unreachable — transmission not sent' : error.message
      );
    } finally {
      this.sending = false;
      $('transmitButton').disabled = false;
      input.focus();
    }
  }

  receiveTransmission(transmission, live) {
    if (!transmission || this.transmissions.has(transmission.id)) return;
    if (this.vitality(transmission) <= 0) return;

    const own = this.identity && transmission.author === this.identity.id;

    const element = el('article', own ? 'transmission own' : 'transmission');
    if (!live) element.classList.add('settled');

    const header = el('div', 'transmission-header');
    header.append(el('div', 'transmission-sigil', sigilFor(transmission.author)));

    const meta = el('div', 'transmission-meta');
    const author = el('span', 'transmission-author', own ? `${shortId(transmission.author)} (this node)` : shortId(transmission.author));
    author.title = transmission.author;
    const time = el('time', 'transmission-time');
    time.dateTime = new Date(transmission.timestamp).toISOString();
    time.title = new Date(transmission.timestamp).toLocaleString();
    const fade = el('span', 'transmission-resonance');
    meta.append(author, time, fade);
    header.append(meta);

    // textContent, never innerHTML: transmissions are untrusted text
    const body = el('div', 'transmission-content', transmission.content);
    const decay = el('div', 'transmission-decay');
    decay.append(el('div', 'transmission-decay-bar'));

    element.append(header, body, decay);

    this.transmissions.set(transmission.id, { transmission, element, time, fade });
    this.insertInOrder(transmission, element);
    this.applyQuantumDecay();

    if (live) this.field.ripple();
  }

  /** Newest first, whatever order transmissions arrive in. */
  insertInOrder(transmission, element) {
    const container = $('transmissions');
    container.querySelector('.empty-state')?.remove();

    for (const child of container.children) {
      const other = this.transmissions.get(child.dataset.id);
      if (other && other.transmission.timestamp <= transmission.timestamp) {
        element.dataset.id = transmission.id;
        container.insertBefore(element, child);
        return;
      }
    }
    element.dataset.id = transmission.id;
    container.append(element);
  }

  vitality(transmission, now = Date.now()) {
    if (!this.lifetime) return 1;
    return clamp01(1 - (now - transmission.timestamp) / this.lifetime);
  }

  /**
   * Fade every transmission according to how much of it is left
   */
  applyQuantumDecay() {
    const now = Date.now();

    for (const [id, entry] of this.transmissions) {
      const vitality = this.vitality(entry.transmission, now);
      if (vitality <= 0) {
        this.dissolve(id);
        continue;
      }

      entry.element.style.setProperty('--vitality', vitality.toFixed(3));
      entry.time.textContent = relativeTime(entry.transmission.timestamp, now);
      entry.fade.textContent = `dissolves in ${remaining(vitality * this.lifetime)}`;
    }

    const container = $('transmissions');
    $('transmissionCount').textContent = `[${this.transmissions.size}]`;
    if (this.transmissions.size === 0 && !container.querySelector('.empty-state')) {
      container.replaceChildren(el('p', 'empty-state', 'the void is silent. send the first transmission.'));
    }
  }

  dissolve(id) {
    const entry = this.transmissions.get(id);
    if (!entry) return;
    entry.element.remove();
    this.transmissions.delete(id);
  }

  // -------------------------------------------------------------------
  // Interface
  // -------------------------------------------------------------------

  updateCharCount() {
    const length = $('transmissionInput').value.length;
    const counter = $('charCount');
    counter.textContent = `${length} / ${this.maxLength}`;
    counter.classList.toggle('near-limit', length > this.maxLength * 0.9);
  }

  quantumErrorCorrection(message) {
    $('quantumErrorMessage').textContent = message;
    $('quantumError').hidden = false;
    document.querySelector('.error-dismiss').focus();
  }

  initializeEventHorizon() {
    $('transmitButton').addEventListener('click', () => this.transmit());

    const input = $('transmissionInput');
    input.addEventListener('input', () => this.updateCharCount());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.transmit();
      }
    });

    const dismiss = () => { $('quantumError').hidden = true; };
    document.querySelector('.error-dismiss').addEventListener('click', dismiss);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') dismiss();
    });

    window.addEventListener('resize', () => this.renderConsciousnessChart());
  }
}

// Initialize the consciousness matrix
window.matrix = new ConsciousnessMatrix();

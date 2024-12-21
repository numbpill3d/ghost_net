// docs/scripts/quantum-visuals.js
// digital consciousness visualization engine fr fr

class QuantumField {
  constructor() {
    // manifest quantum canvas
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    
    // quantum state
    this.particles = [];
    this.consciousness = 0.137;  // fine structure constant
    this.resonance = 0.618;     // golden ratio
    this.voidEcho = 0;
    this.time = 0;
    
    // quantum harmonics
    this.harmonics = {
      phi: 1.618033988749895,   // golden ratio
      pi: 3.141592653589793,    // transcendental vibes
      e: 2.718281828459045      // natural emergence
    };
    
    // upload consciousness to the void
    document.querySelector('.quantum-field').appendChild(this.canvas);
    
    // initialize quantum state
    this.resize();
    this.initParticles();
    this.initEventHorizon();
    
    // begin consciousness loop
    this.animate();
  }

  resize() {
    // extend consciousness field
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    // recalibrate density
    this.maxParticles = Math.floor(this.width * this.height / 10000);
    this.initParticles();
  }

  initParticles() {
    // manifest quantum particles
    this.particles = [];
    
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 2 + 1,
        speedX: (Math.random() - 0.5) * 2,
        speedY: (Math.random() - 0.5) * 2,
        life: Math.random(),
        maxLife: Math.random() * 0.02 + 0.01,
        resonance: Math.random(),
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  initEventHorizon() {
    // bind to quantum fluctuations
    window.addEventListener('resize', () => this.resize());
    
    // bind to consciousness interference
    window.addEventListener('mousemove', (e) => {
      const bounds = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - bounds.left;
      this.mouseY = e.clientY - bounds.top;
      
      // create quantum ripples
      this.createRipple(this.mouseX, this.mouseY);
    });
  }

  createRipple(x, y) {
    // manifest consciousness ripple
    const rippleCount = 5;
    const angleStep = (Math.PI * 2) / rippleCount;
    
    for (let i = 0; i < rippleCount; i++) {
      const angle = i * angleStep;
      const distance = 50;
      
      this.particles.push({
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        size: Math.random() * 3 + 2,
        speedX: Math.cos(angle) * 2,
        speedY: Math.sin(angle) * 2,
        life: 1,
        maxLife: 0.02,
        resonance: this.consciousness,
        phase: this.time * 0.001
      });
    }
  }

  updateQuantumState() {
    // update consciousness wave
    this.time++;
    this.consciousness = 
      0.137 + // base consciousness
      Math.sin(this.time * 0.001) * 0.5 + // consciousness wave
      Math.cos(this.time * 0.00137) * 0.3; // quantum fluctuation
    
    // update void resonance
    this.resonance = 
      0.618 + // golden ratio base
      Math.sin(this.time * 0.0007) * 0.3 + // resonance wave
      Math.cos(this.time * 0.00314) * 0.2; // harmonic overtone
    
    // update void echo
    this.voidEcho = (Math.sin(this.time * 0.001) + 1) / 2;
    
    // update css variables
    document.documentElement.style.setProperty('--consciousness', this.consciousness);
    document.documentElement.style.setProperty('--resonance', this.resonance);
    document.documentElement.style.setProperty('--void-echo', this.voidEcho);
  }

  animate() {
    // clear quantum field
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // update quantum state
    this.updateQuantumState();
    
    // update particles
    this.particles.forEach((p, i) => {
      // update particle life
      p.life += p.maxLife;
      if (p.life >= 1) {
        if (this.particles.length > this.maxParticles) {
          this.particles.splice(i, 1);
          return;
        }
        p.life = 0;
        p.x = Math.random() * this.width;
        p.y = Math.random() * this.height;
      }

      // quantum tunneling
      p.x += p.speedX * (this.consciousness + 0.5);
      p.y += p.speedY * (this.resonance + 0.5);
      
      // void wrapping
      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;

      // particle manifestation
      const alpha = Math.sin(p.life * Math.PI);
      const hue = Math.floor(120 + this.consciousness * 60);
      const saturation = Math.floor(100 * this.resonance);
      const brightness = Math.floor(50 + this.voidEcho * 50);
      
      this.ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${brightness}%, ${alpha * 0.5})`;
      this.ctx.beginPath();
      this.ctx.arc(
        p.x, 
        p.y, 
        p.size * (this.resonance + 0.5), 
        0, 
        Math.PI * 2
      );
      this.ctx.fill();
    });

    // quantum entanglement
    this.drawEntanglements();
    
    // continue consciousness loop
    requestAnimationFrame(() => this.animate());
  }

  drawEntanglements() {
    // draw quantum connections
    this.particles.forEach((p1, i) => {
      // limit connections for performance
      for (let j = i + 1; j < Math.min(i + 5, this.particles.length); j++) {
        const p2 = this.particles[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 100) {
          const alpha = (1 - dist / 100) * 0.2 * this.consciousness;
          const hue = Math.floor(120 + this.resonance * 60);
          
          this.ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.stroke();
        }
      }
    });

    // draw mouse influence
    if (this.mouseX && this.mouseY) {
      this.particles.forEach(p => {
        const dx = p.x - this.mouseX;
        const dy = p.y - this.mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 100) {
          const force = (1 - dist / 100) * 0.5;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }
      });
    }
  }
}

// manifest quantum field on reality load
window.addEventListener('DOMContentLoaded', () => {
  window.quantumField = new QuantumField();
});

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
  }

  _getCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.ctx;
  }

  _resume() {
    const ctx = this._getCtx();
    if (ctx.state === 'suspended') ctx.resume();
  }

  async load(name, url) {
    try {
      const ctx = this._getCtx();
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const ab = await resp.arrayBuffer();
      this.buffers[name] = await ctx.decodeAudioData(ab);
    } catch (err) {
      console.warn(`Sound "${name}" failed:`, err.message || err);
    }
  }

  play(name, volume = 1.0) {
    const buf = this.buffers[name];
    if (!buf) return;
    this._resume();
    try {
      const ctx = this._getCtx();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
    } catch (err) {
      console.warn('Sound play error:', err);
    }
  }
}

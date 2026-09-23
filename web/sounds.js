export class Sounds {
  constructor() {
    this.context = null;
    this.background = null;
    this.previewTimer = null;
    this.tones = new Set();
    this.buffers = new Map();
  }

  get ready() { return this.context?.state === 'running'; }

  async unlock() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      if (!this.context || this.context.state === 'closed') this.context = new Context();
      await this.context.resume();
      return this.ready;
    } catch { return false; }
  }

  stopChime() {
    for (const tone of this.tones) tone.stop();
    this.tones.clear();
  }

  chime(settings) {
    this.stopChime();
    if (!this.ready || !settings.sound || !settings.soundVolume) return;
    const context = this.context, volume = settings.soundVolume / 100;
    const notes = settings.chime === 'beep' ? [[660, 0, 0.22], [660, 0.27, 0.22]]
      : settings.chime === 'chime' ? [[523.25, 0, 0.8], [659.25, 0.18, 0.8], [783.99, 0.36, 1.2]]
      : [[880, 0, 1.4], [1760, 0, 0.7]];
    for (const [frequency, delay, duration] of notes) {
      const tone = context.createOscillator(), gain = context.createGain();
      const start = context.currentTime + delay;
      tone.type = 'sine';
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * (frequency === 1760 ? 0.045 : 0.18), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      tone.connect(gain); gain.connect(context.destination);
      this.tones.add(tone);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); this.tones.delete(tone); };
      tone.start(start); tone.stop(start + duration + 0.02);
    }
  }

  noise(kind) {
    if (this.buffers.has(kind)) return this.buffers.get(kind);
    const context = this.context, length = context.sampleRate * 8;
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let brown = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + white * 0.02) / 1.02;
        data[i] = kind === 'brown' ? brown * 3.5 : white * 0.4;
      }
      // Join the loop at zero without a sharp edge or a repeated click.
      const edge = Math.floor(context.sampleRate * 0.02);
      for (let i = 0; i < edge; i++) {
        data[i] *= i / edge;
        data[length - 1 - i] *= i / edge;
      }
    }
    this.buffers.set(kind, buffer);
    return buffer;
  }

  ambience(settings, active) {
    if (this.previewTimer) return;
    const wanted = active?.phase === 'running' && active.deadline > Date.now();
    this.playBackground(wanted ? settings.ambience : 'off', settings.ambienceVolume);
  }

  playBackground(kind, volume) {
    if (!this.ready || kind === 'off' || volume === 0) { this.stopBackground(); return; }
    if (this.background?.kind === kind) {
      this.background.gain.gain.setTargetAtTime(volume / 100 * 0.6, this.context.currentTime, 0.08);
      return;
    }
    this.stopBackground();
    const context = this.context, source = context.createBufferSource();
    const filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.noise(kind); source.loop = true;
    filter.type = 'lowpass'; filter.frequency.value = kind === 'brown' ? 800 : 3500;
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.setTargetAtTime(volume / 100 * 0.6, context.currentTime, 0.15);
    source.connect(filter); filter.connect(gain); gain.connect(context.destination);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start();
    this.background = { kind, source, gain };
  }

  stopBackground() {
    if (!this.background) return;
    const { source, gain } = this.background, now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, 0.03);
    source.stop(now + 0.2);
    this.background = null;
  }

  previewAmbience(settings, onEnd) {
    this.cancelPreview();
    this.playBackground(settings.ambience, settings.ambienceVolume);
    this.previewTimer = setTimeout(() => { this.cancelPreview(); onEnd(); }, 5000);
  }

  cancelPreview() {
    if (!this.previewTimer) return;
    clearTimeout(this.previewTimer);
    this.previewTimer = null;
    this.stopBackground();
  }

  stop() {
    this.cancelPreview(); this.stopBackground(); this.stopChime();
  }
}

export type AudioEvent =
  | 'feed' | 'bond' | 'dash' | 'hit' | 'pulse' | 'break'
  | 'victory' | 'hazard' | 'mutate' | 'defeat' | 'start';

const minimum = 0.0001;
const voiceLimit = 20;
const pitchVariation = [1, 1.12, 0.945, 1.06];
const burstInterval: Partial<Record<AudioEvent, number>> = {
  feed: 0.05, hit: 0.10, pulse: 0.14, break: 0.08, hazard: 0.7,
};

function noiseBuffer(context: AudioContext): AudioBuffer {
  const length = context.sampleRate * 3;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const noise = buffer.getChannelData(0);
  let state = 0x7d8c901f;
  let smoothed = 0;
  for (let index = 0; index < length; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const white = (state >>> 0) / 0x80000000 - 1;
    smoothed = 0.81 * smoothed + 0.19 * white;
    noise[index] = 0.54 * smoothed + 0.35 * white;
  }
  const edge = Math.floor(context.sampleRate * 0.04);
  for (let index = 0; index < edge; index++) {
    const mix = index / edge;
    noise[index] *= mix;
    noise[length - 1 - index] *= mix;
  }
  return buffer;
}

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: BiquadFilterNode | null = null;
  private currentNoise: AudioBuffer | null = null;
  private bedLevel: GainNode | null = null;
  private reflection: GainNode | null = null;
  private volume = 0.6;
  private muted = false;
  private threat = 0;
  private voices = 0;
  private motif = 0;
  private readonly lastEvent: Partial<Record<AudioEvent, number>> = {};

  async unlock(): Promise<void> {
    try {
      if (!this.context || this.context.state === 'closed') this.initialize();
      if (this.context?.state !== 'running') await this.context?.resume();
    } catch {
      // Audio output can be denied by the browser or unavailable on the device.
    }
  }

  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.6;
    this.updateMaster();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateMaster();
  }

  setThreat(value: number): void {
    if (!Number.isFinite(value)) return;
    const threat = Math.min(1, Math.max(0, value));
    if (Math.abs(threat - this.threat) < 0.015) return;
    this.threat = threat;
    this.updateBed();
  }

  play(event: AudioEvent): void {
    const context = this.context;
    if (context?.state !== 'running' || !this.master || this.muted || this.volume === 0) return;
    const time = context.currentTime;
    const elapsed = time - (this.lastEvent[event] ?? -Infinity);
    if (elapsed < (burstInterval[event] ?? 0)) return;
    const isTransition = event === 'mutate' || event === 'victory' || event === 'defeat' || event === 'start';
    if (!isTransition && this.voices >= 12) return;
    this.lastEvent[event] = time;
    const variation = pitchVariation[this.motif++ & 3];
    const left = this.motif % 2 === 0 ? -0.12 : 0.12;

    switch (event) {
      case 'feed':
        this.tone(time, 'sine', 550 * variation, 910 * variation, 0.18, 0.036, left);
        this.tone(time + 0.014, 'sine', 1130 * variation, 960 * variation, 0.13, 0.016, left);
        break;
      case 'bond':
        this.tone(time, 'triangle', 183, 267, 0.22, 0.047, -0.19);
        this.tone(time + 0.075, 'sine', 554, 683, 0.42, 0.052, 0.17);
        this.tone(time + 0.14, 'sine', 825, 831, 0.37, 0.025, 0.04);
        break;
      case 'dash':
        this.noise(time, 470, 2400, 0.25, 0.16, 0.02);
        this.tone(time, 'sine', 159, 59, 0.17, 0.079, 0, 0.011);
        break;
      case 'hit':
        this.noise(time, 940, 270, 0.19, 0.18, left);
        this.tone(time, 'triangle', 180 * variation, 68, 0.22, 0.061, 0);
        break;
      case 'pulse':
        this.tone(time, 'triangle', 96, 330, 0.38, 0.071, 0, 0.035);
        this.tone(time + 0.065, 'sine', 510, 175, 0.44, 0.047, 0.12, 0.024);
        this.noise(time + 0.043, 430, 1780, 0.38, 0.13, -0.07);
        break;
      case 'break':
        this.noise(time, 1750, 380, 0.32, 0.23, left, 0.004);
        this.tone(time + 0.025, 'triangle', 360, 93, 0.31, 0.05, -left);
        break;
      case 'hazard':
        this.tone(time, 'sine', 76, 64, 0.55, 0.065, -0.08, 0.06);
        this.tone(time + 0.16, 'triangle', 101, 98, 0.5, 0.033, 0.08, 0.07);
        break;
      case 'mutate':
        this.noise(time, 320, 2100, 0.78, 0.15, 0, 0.13);
        this.chime(time, [146.83, 220, 293.66, 369.99, 440], 0.10, 0.95);
        break;
      case 'victory':
        this.chime(time, [146.83, 220, 329.63, 369.99, 587.33, 659.26], 0.16, 1.7);
        this.noise(time, 230, 1800, 1.65, 0.13, 0, 0.24);
        break;
      case 'defeat':
        this.chime(time, [293.66, 207.65, 164.81, 98], 0.19, 1.45);
        this.noise(time, 870, 110, 1.15, 0.15, 0, 0.05);
        break;
      case 'start':
        this.chime(time, [146.83, 220, 329.63, 440], 0.15, 1.18);
        break;
    }
  }

  private initialize(): void {
    const context = new AudioContext({ latencyHint: 'interactive' });
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -13;
    compressor.knee.value = 14;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.21;
    master.gain.value = 0;
    master.connect(compressor).connect(context.destination);

    this.context = context;
    this.master = master;
    this.currentNoise = noiseBuffer(context);
    this.voices = 0;
    this.createBed(context, master);
    this.createReflections(context, master);
    this.updateMaster();
  }

  private createReflections(context: AudioContext, master: GainNode): void {
    const bus = context.createGain();
    const water = context.createBiquadFilter();
    water.type = 'lowpass';
    water.frequency.value = 1400;
    water.Q.value = 0.3;
    bus.connect(water);
    for (const [seconds, side, level] of [[0.124, -0.63, 0.21], [0.211, 0.58, 0.13]]) {
      const delay = context.createDelay(0.3);
      delay.delayTime.value = seconds;
      const pan = context.createStereoPanner();
      pan.pan.value = side;
      const gain = context.createGain();
      gain.gain.value = level;
      water.connect(delay).connect(pan).connect(gain).connect(master);
    }
    this.reflection = bus;
  }

  private createBed(context: AudioContext, master: GainNode): void {
    const bus = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 430;
    filter.Q.value = 0.33;
    bus.gain.value = minimum;
    filter.connect(bus).connect(master);
    this.ambience = filter;
    this.bedLevel = bus;

    const chord = [
      { frequency: 73.42, detune: 0, level: 0.29, drift: 0.09, pan: 0, type: 'sine' },
      { frequency: 110, detune: -4, level: 0.115, drift: 0.071, pan: -0.38, type: 'triangle' },
      { frequency: 146.83, detune: 4, level: 0.090, drift: 0.047, pan: 0.39, type: 'sine' },
      { frequency: 220, detune: 8, level: 0.042, drift: 0.041, pan: 0.13, type: 'sine' },
    ] as const;
    for (const partial of chord) {
      const oscillator = context.createOscillator();
      oscillator.type = partial.type;
      oscillator.frequency.value = partial.frequency;
      oscillator.detune.value = partial.detune;
      const gain = context.createGain();
      gain.gain.value = partial.level;
      const motion = context.createOscillator();
      motion.frequency.value = partial.drift;
      const depth = context.createGain();
      depth.gain.value = partial.level * 0.18;
      motion.connect(depth).connect(gain.gain);

      const pan = context.createStereoPanner();
      pan.pan.value = partial.pan;
      oscillator.connect(gain).connect(pan).connect(filter);
      oscillator.start();
      motion.start();
    }

    const hiss = context.createBufferSource();
    hiss.buffer = this.currentNoise;
    hiss.loop = true;
    const media = context.createBiquadFilter();
    media.type = 'bandpass';
    media.frequency.value = 340;
    media.Q.value = 0.49;
    const hissGain = context.createGain();
    hissGain.gain.value = 0.30;
    hiss.connect(media).connect(hissGain).connect(filter);
    hiss.start();
    this.updateBed();
  }

  private updateBed(): void {
    if (!this.context) return;
    const time = this.context.currentTime;
    this.ambience?.frequency.setTargetAtTime(370 + this.threat * 360, time, 0.7);
    this.bedLevel?.gain.setTargetAtTime(0.15 + this.threat * 0.09, time, 0.85);
  }

  private updateMaster(): void {
    if (!this.context || !this.master) return;
    const time = this.context.currentTime;
    this.master.gain.cancelScheduledValues(time);
    this.master.gain.setTargetAtTime(this.muted ? 0 : Math.pow(this.volume, 1.6), time, 0.04);
  }

  private chime(time: number, notes: number[], spacing: number, length: number): void {
    notes.forEach((frequency, index) => {
      const pan = 0.20 * Math.sin(index * 2.3);
      const start = time + index * spacing;
      this.tone(start, 'sine', frequency, frequency * 1.002, length, 0.055, pan, 0.055);
      this.tone(start, 'sine', frequency * 2, frequency * 2, length * 0.7, 0.017, -pan, 0.085);
    });
  }

  private tone(time: number, type: OscillatorType, from: number, to: number, duration: number, gain: number, pan: number, attack = 0.009): void {
    if (!this.context || this.voices >= voiceLimit) return;
    const tone = this.context.createOscillator();
    tone.type = type;
    tone.frequency.setValueAtTime(from, time);
    tone.frequency.exponentialRampToValueAtTime(to, Math.max(time + 0.015, time + duration * 0.58));
    this.voice(tone, tone, time, duration, gain, pan, attack);
  }

  private noise(time: number, from: number, to: number, duration: number, gain: number, pan: number, attack = 0.024): void {
    if (!this.context || !this.currentNoise || this.voices >= voiceLimit) return;
    const source = this.context.createBufferSource();
    source.buffer = this.currentNoise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.75;
    filter.frequency.setValueAtTime(from, time);
    filter.frequency.exponentialRampToValueAtTime(to, time + duration * 0.82);
    source.connect(filter);
    this.voice(source, filter, time, duration, gain, pan, attack, 0.08 + (this.motif % 7) * 0.11);
  }

  private voice(source: AudioScheduledSourceNode, signal: AudioNode, time: number, duration: number, level: number, pan: number, attack: number, offset = 0): void {
    const context = this.context;
    if (!context || !this.master) return;
    const gain = context.createGain();
    const stereo = context.createStereoPanner();
    stereo.pan.value = pan;
    gain.gain.setValueAtTime(minimum, time);
    gain.gain.exponentialRampToValueAtTime(level, time + attack);
    gain.gain.exponentialRampToValueAtTime(minimum, time + duration);
    signal.connect(gain).connect(stereo).connect(this.master);
    if (this.reflection) stereo.connect(this.reflection);
    this.voices++;
    source.onended = () => {
      if (this.context === context) this.voices--;
      source.disconnect();
      if (signal !== source) signal.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
    if (source instanceof AudioBufferSourceNode) source.start(time, offset);
    else source.start(time);
    source.stop(time + duration + 0.02);
  }
}

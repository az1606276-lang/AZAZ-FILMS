export type CinemaAudioPreset = 'studio' | 'imax' | 'dialogue' | 'midnight' | 'spatial3d';

export interface AudioEngineStatus {
  supported: boolean;
  connected: boolean;
  reason?: 'cross_origin_restricted' | 'unsupported';
}

function buildAuditoriumImpulse(
  ctx: AudioContext,
  durationSec = 1.65,
  decayRate = 2.9
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    // Crisp early reflections followed by warm exponential auditorium tail
    let lastSample = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decayRate);
      const white = Math.random() * 2 - 1;
      // Gentle low-pass damping simulating velvet cinema wall acoustics
      lastSample = lastSample * 0.42 + white * 0.58;
      channelData[i] = lastSample * env * (channel === 0 ? 1 : 0.96);
    }
  }
  return impulse;
}

export class CinemaAudioEngine {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private attachedVideo: HTMLVideoElement | null = null;
  private lowShelf: BiquadFilterNode | null = null;
  private midPeak: BiquadFilterNode | null = null;
  private highShelf: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private panner: StereoPannerNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyBuffer: Uint8Array<ArrayBuffer> | null = null;
  private currentPreset: CinemaAudioPreset = 'studio';
  private seatPan = 0;
  private hallDepth = 0.35;
  private failedDueToCors = false;

  public canProcessVideo(video: HTMLVideoElement): boolean {
    const src = video.currentSrc || video.src;
    if (!src) return false;
    try {
      const parsed = new URL(src, window.location.href);
      if (parsed.origin === window.location.origin) return true;
      return video.crossOrigin === 'anonymous';
    } catch {
      return false;
    }
  }

  public attach(video: HTMLVideoElement): AudioEngineStatus {
    if (typeof window === 'undefined') {
      return { supported: false, connected: false, reason: 'unsupported' };
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return { supported: false, connected: false, reason: 'unsupported' };
    }

    if (!this.canProcessVideo(video)) {
      this.failedDueToCors = true;
      return { supported: false, connected: false, reason: 'cross_origin_restricted' };
    }

    try {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      if (this.attachedVideo !== video) {
        this.source = this.ctx.createMediaElementSource(video);
        this.attachedVideo = video;

        this.lowShelf = this.ctx.createBiquadFilter();
        this.lowShelf.type = 'lowshelf';
        this.lowShelf.frequency.value = 75;

        this.midPeak = this.ctx.createBiquadFilter();
        this.midPeak.type = 'peaking';
        this.midPeak.frequency.value = 2350;
        this.midPeak.Q.value = 1.1;

        this.highShelf = this.ctx.createBiquadFilter();
        this.highShelf.type = 'highshelf';
        this.highShelf.frequency.value = 9500;

        this.compressor = this.ctx.createDynamicsCompressor();
        this.panner = this.ctx.createStereoPanner();
        this.panner.pan.value = this.seatPan;

        this.dryGain = this.ctx.createGain();
        this.wetGain = this.ctx.createGain();
        this.dryGain.gain.value = 1;
        this.wetGain.gain.value = 0;

        this.convolver = this.ctx.createConvolver();
        this.convolver.buffer = buildAuditoriumImpulse(this.ctx, 1.7, 3.0);

        this.masterGain = this.ctx.createGain();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.smoothingTimeConstant = 0.78;
        this.frequencyBuffer = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

        this.source.connect(this.lowShelf);
        this.lowShelf.connect(this.midPeak);
        this.midPeak.connect(this.highShelf);
        this.highShelf.connect(this.compressor);
        this.compressor.connect(this.panner);

        // Parallel dry + auditorium spatial convolver path
        this.panner.connect(this.dryGain);
        this.dryGain.connect(this.masterGain);

        this.panner.connect(this.convolver);
        this.convolver.connect(this.wetGain);
        this.wetGain.connect(this.masterGain);

        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        this.applyPreset(this.currentPreset);
      }

      this.failedDueToCors = false;
      return { supported: true, connected: true };
    } catch {
      this.failedDueToCors = true;
      return { supported: false, connected: false, reason: 'cross_origin_restricted' };
    }
  }

  public resumeIfNeeded(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setSpatialSeat(pan: number, depth: number): void {
    this.seatPan = Math.max(-0.85, Math.min(0.85, pan));
    this.hallDepth = Math.max(0.05, Math.min(0.85, depth));
    if (!this.ctx || !this.panner) return;
    const now = this.ctx.currentTime;
    this.panner.pan.setTargetAtTime(this.seatPan, now, 0.06);
    if (this.currentPreset === 'spatial3d' && this.wetGain && this.dryGain) {
      this.wetGain.gain.setTargetAtTime(0.14 + this.hallDepth * 0.36, now, 0.08);
      this.dryGain.gain.setTargetAtTime(1 - this.hallDepth * 0.14, now, 0.08);
    }
  }

  public applyPreset(preset: CinemaAudioPreset): void {
    this.currentPreset = preset;
    if (
      !this.ctx ||
      !this.lowShelf ||
      !this.midPeak ||
      !this.highShelf ||
      !this.compressor ||
      !this.masterGain ||
      !this.dryGain ||
      !this.wetGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const ramp = 0.08;

    this.dryGain.gain.setTargetAtTime(1, now, ramp);
    this.wetGain.gain.setTargetAtTime(0, now, ramp);

    if (preset === 'studio') {
      this.lowShelf.frequency.setTargetAtTime(75, now, ramp);
      this.lowShelf.gain.setTargetAtTime(0, now, ramp);
      this.midPeak.frequency.setTargetAtTime(2350, now, ramp);
      this.midPeak.gain.setTargetAtTime(0, now, ramp);
      this.highShelf.gain.setTargetAtTime(0, now, ramp);
      this.compressor.threshold.setTargetAtTime(-4, now, ramp);
      this.compressor.ratio.setTargetAtTime(1.5, now, ramp);
      this.masterGain.gain.setTargetAtTime(1, now, ramp);
    } else if (preset === 'imax') {
      this.lowShelf.frequency.setTargetAtTime(70, now, ramp);
      this.lowShelf.gain.setTargetAtTime(6.0, now, ramp);
      this.midPeak.frequency.setTargetAtTime(650, now, ramp);
      this.midPeak.gain.setTargetAtTime(-1.8, now, ramp);
      this.highShelf.gain.setTargetAtTime(3.2, now, ramp);
      this.compressor.threshold.setTargetAtTime(-16, now, ramp);
      this.compressor.ratio.setTargetAtTime(3.5, now, ramp);
      this.masterGain.gain.setTargetAtTime(1.08, now, ramp);
    } else if (preset === 'dialogue') {
      this.lowShelf.frequency.setTargetAtTime(110, now, ramp);
      this.lowShelf.gain.setTargetAtTime(-3.5, now, ramp);
      this.midPeak.frequency.setTargetAtTime(2400, now, ramp);
      this.midPeak.gain.setTargetAtTime(5.2, now, ramp);
      this.highShelf.gain.setTargetAtTime(1.5, now, ramp);
      this.compressor.threshold.setTargetAtTime(-18, now, ramp);
      this.compressor.ratio.setTargetAtTime(3.0, now, ramp);
      this.masterGain.gain.setTargetAtTime(1.06, now, ramp);
    } else if (preset === 'midnight') {
      this.lowShelf.frequency.setTargetAtTime(85, now, ramp);
      this.lowShelf.gain.setTargetAtTime(-4.5, now, ramp);
      this.midPeak.frequency.setTargetAtTime(2100, now, ramp);
      this.midPeak.gain.setTargetAtTime(2.6, now, ramp);
      this.highShelf.gain.setTargetAtTime(-1.5, now, ramp);
      this.compressor.threshold.setTargetAtTime(-28, now, ramp);
      this.compressor.ratio.setTargetAtTime(6.0, now, ramp);
      this.masterGain.gain.setTargetAtTime(1.12, now, ramp);
    } else if (preset === 'spatial3d') {
      this.lowShelf.frequency.setTargetAtTime(80, now, ramp);
      this.lowShelf.gain.setTargetAtTime(3.8, now, ramp);
      this.midPeak.frequency.setTargetAtTime(2200, now, ramp);
      this.midPeak.gain.setTargetAtTime(2.2, now, ramp);
      this.highShelf.gain.setTargetAtTime(2.8, now, ramp);
      this.compressor.threshold.setTargetAtTime(-14, now, ramp);
      this.compressor.ratio.setTargetAtTime(2.8, now, ramp);
      this.dryGain.gain.setTargetAtTime(1 - this.hallDepth * 0.14, now, ramp);
      this.wetGain.gain.setTargetAtTime(0.14 + this.hallDepth * 0.36, now, ramp);
      this.masterGain.gain.setTargetAtTime(1.05, now, ramp);
    }
  }

  public getSpectrumLevels(barCount = 16): number[] | null {
    if (!this.analyser || !this.frequencyBuffer || this.failedDueToCors) return null;
    this.analyser.getByteFrequencyData(this.frequencyBuffer);
    const len = Math.min(barCount, this.frequencyBuffer.length);
    const levels: number[] = [];
    for (let i = 0; i < len; i++) {
      levels.push(this.frequencyBuffer[i] / 255);
    }
    return levels;
  }

  public dispose(): void {
    try {
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.source = null;
    this.attachedVideo = null;
    this.lowShelf = null;
    this.midPeak = null;
    this.highShelf = null;
    this.compressor = null;
    this.panner = null;
    this.dryGain = null;
    this.wetGain = null;
    this.convolver = null;
    this.masterGain = null;
    this.analyser = null;
    this.frequencyBuffer = null;
  }
}

/**
 * Procedural 35mm Cinema Room & Harmonic Spatial Tone Synthesizer.
 * Generates zero-asset mechanical reel atmosphere + spatial theatre harmonics in real time.
 */
export class TheatreAmbianceSynth {
  private ctx: AudioContext | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private lfo: OscillatorNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private panner: StereoPannerNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private masterGain: GainNode | null = null;
  private running = false;

  public start(withHarmonicTone = true, initialPan = 0, initialDepth = 0.4): boolean {
    if (this.running) return true;
    if (typeof window === 'undefined') return false;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      // 35mm optical projector reel texture (brown noise + subtle 24Hz flutter LFO)
      const bufSize = ctx.sampleRate * 3;
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.03 * white) / 1.03;
        data[i] = lastOut * 2.2;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'lowpass';
      bandpass.frequency.value = 340;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.07;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 12; // subtle mechanical shutter pulse
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.025;
      lfo.connect(lfoGain);
      lfoGain.connect(noiseGain.gain);

      const panner = ctx.createStereoPanner();
      panner.pan.value = initialPan;

      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      dryGain.gain.value = 0.85;
      wetGain.gain.value = 0.15 + initialDepth * 0.45;

      const convolver = ctx.createConvolver();
      convolver.buffer = buildAuditoriumImpulse(ctx, 1.9, 2.5);

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.001, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.35);

      noise.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(panner);

      if (withHarmonicTone) {
        // Warm cinema Fifth chord (D2 + A2) to demonstrate 3D spatial positioning clearly
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 73.42;
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = 110.0;

        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 420;

        const padGain = ctx.createGain();
        padGain.gain.value = 0.055;

        osc1.connect(padFilter);
        osc2.connect(padFilter);
        padFilter.connect(padGain);
        padGain.connect(panner);

        osc1.start();
        osc2.start();
        this.osc1 = osc1;
        this.osc2 = osc2;
      }

      panner.connect(dryGain);
      dryGain.connect(master);
      panner.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(master);
      master.connect(ctx.destination);

      noise.start();
      lfo.start();

      this.noiseSource = noise;
      this.lfo = lfo;
      this.panner = panner;
      this.dryGain = dryGain;
      this.wetGain = wetGain;
      this.convolver = convolver;
      this.masterGain = master;
      this.running = true;
      return true;
    } catch {
      return false;
    }
  }

  public setSeat(pan: number, depth: number): void {
    if (!this.ctx || !this.panner || !this.wetGain || !this.dryGain) return;
    const now = this.ctx.currentTime;
    const clampedPan = Math.max(-0.85, Math.min(0.85, pan));
    const clampedDepth = Math.max(0.05, Math.min(0.95, depth));
    this.panner.pan.setTargetAtTime(clampedPan, now, 0.05);
    this.wetGain.gain.setTargetAtTime(0.12 + clampedDepth * 0.55, now, 0.07);
    this.dryGain.gain.setTargetAtTime(0.95 - clampedDepth * 0.25, now, 0.07);
  }

  public stop(): void {
    if (!this.running) return;
    this.running = false;
    try {
      this.noiseSource?.stop();
      this.lfo?.stop();
      this.osc1?.stop();
      this.osc2?.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.noiseSource = null;
    this.lfo = null;
    this.osc1 = null;
    this.osc2 = null;
    this.panner = null;
    this.dryGain = null;
    this.wetGain = null;
    this.convolver = null;
    this.masterGain = null;
  }
}

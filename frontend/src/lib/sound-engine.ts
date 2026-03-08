/**
 * Bear Trap Sound Engine
 *
 * Manages all audio for the Bear Trap game:
 * - ElevenLabs voiceover lines (The Trapper)
 * - Procedural sound effects via Web Audio API
 * - Background music
 *
 * SFX are generated procedurally until ElevenLabs quota allows generation.
 * Voiceover uses pre-generated ElevenLabs MP3 files in /public/audio/.
 */

type SoundEventType =
  | "countdown_tick"
  | "countdown_zero"
  | "ticket_burn"
  | "wrong_guess"
  | "proof_ready"
  | "prize_claimed"
  | "trap_ambient";

type VoiceLineType =
  | "trapper-begin"
  | "trapper-wrong"
  | "trapper-proof-valid"
  | "trapper-broken"
  | "trapper-teaser"
  | "trapper-error";

const VOICE_FILES: Record<string, string> = {
  "trapper-begin": "/audio/trapper-begin.mp3",
  "trapper-wrong": "/audio/trapper-wrong.mp3",
  "trapper-proof-valid": "/audio/trapper-proof-valid.mp3",
  "trapper-broken": "/audio/trapper-broken.mp3",
  "trapper-teaser": "/audio/trapper-teaser.mp3",
  // Will be added when API key credit quota refreshes:
  // "trapper-error": "/audio/trapper-error.mp3",
};

class SoundEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private voiceCache: Map<string, AudioBuffer> = new Map();
  private ambientSource: AudioBufferSourceNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  private getMasterGain(): GainNode {
    this.getContext();
    return this.masterGain!;
  }

  // ── Mute Control ──────────────────────────────

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        muted ? 0 : 1,
        this.audioContext!.currentTime
      );
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("bear-trap-muted", muted ? "1" : "0");
    }
  }

  loadMutePreference(): boolean {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("bear-trap-muted");
    this.muted = saved === "1";
    return this.muted;
  }

  // ── Voiceover (ElevenLabs pre-generated) ──────

  async preloadVoice(name: VoiceLineType): Promise<void> {
    if (this.voiceCache.has(name)) return;
    const url = VOICE_FILES[name];
    if (!url) return;

    try {
      const ctx = this.getContext();
      const response = await fetch(url);
      if (!response.ok) return;
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.voiceCache.set(name, audioBuffer);
    } catch {
      // Silently fail — voiceover is enhancement, not critical
    }
  }

  async preloadAllVoices(): Promise<void> {
    const names = Object.keys(VOICE_FILES) as VoiceLineType[];
    await Promise.all(names.map((n) => this.preloadVoice(n)));
  }

  playVoice(name: VoiceLineType): void {
    if (this.muted) return;
    const buffer = this.voiceCache.get(name);
    if (!buffer) {
      // Try loading and playing
      this.preloadVoice(name).then(() => {
        const b = this.voiceCache.get(name);
        if (b) this._playBuffer(b, 0.9);
      });
      return;
    }
    this._playBuffer(buffer, 0.9);
  }

  private _playBuffer(buffer: AudioBuffer, volume: number): void {
    const ctx = this.getContext();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.getMasterGain());
    source.start();
  }

  // ── Procedural Sound Effects (Web Audio API) ──

  playSfx(event: SoundEventType): void {
    if (this.muted) return;

    switch (event) {
      case "countdown_tick":
        this._playTick();
        break;
      case "countdown_zero":
        this._playBoom();
        break;
      case "ticket_burn":
        this._playFireCrackle();
        break;
      case "wrong_guess":
        this._playTrapSnap();
        break;
      case "proof_ready":
        this._playChime();
        break;
      case "prize_claimed":
        this._playChainBreak();
        break;
      case "trap_ambient":
        this._startAmbient();
        break;
    }
  }

  /** Deep metallic tick */
  private _playTick(): void {
    const ctx = this.getContext();
    const t = ctx.currentTime;

    // Metallic ping
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);

    filter.type = "bandpass";
    filter.frequency.value = 600;
    filter.Q.value = 15;

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.getMasterGain());
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Deep cinematic boom */
  private _playBoom(): void {
    const ctx = this.getContext();
    const t = ctx.currentTime;

    // Sub bass
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(60, t);
    sub.frequency.exponentialRampToValueAtTime(20, t + 1.5);
    subGain.gain.setValueAtTime(0.8, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 2);
    sub.connect(subGain);
    subGain.connect(this.getMasterGain());
    sub.start(t);
    sub.stop(t + 2);

    // Impact noise burst
    const bufferSize = ctx.sampleRate * 0.3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(this.getMasterGain());
    noise.start(t);
  }

  /** Quick fire crackle */
  private _playFireCrackle(): void {
    const ctx = this.getContext();
    const t = ctx.currentTime;

    for (let i = 0; i < 8; i++) {
      const delay = i * 0.04 + Math.random() * 0.02;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 2000 + Math.random() * 4000;
      gain.gain.setValueAtTime(0.15, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3000 + Math.random() * 2000;
      bp.Q.value = 5;
      osc.connect(bp);
      bp.connect(gain);
      gain.connect(this.getMasterGain());
      osc.start(t + delay);
      osc.stop(t + delay + 0.06);
    }
  }

  /** Bear trap snap - metallic clang + buzz */
  private _playTrapSnap(): void {
    const ctx = this.getContext();
    const t = ctx.currentTime;

    // Metallic clang
    const freqs = [440, 880, 1320, 1760];
    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(this.getMasterGain());
      osc.start(t);
      osc.stop(t + 0.35);
    });

    // Low buzz
    const buzz = ctx.createOscillator();
    const buzzGain = ctx.createGain();
    buzz.type = "sawtooth";
    buzz.frequency.value = 80;
    buzzGain.gain.setValueAtTime(0.3, t + 0.05);
    buzzGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    buzz.connect(buzzGain);
    buzzGain.connect(this.getMasterGain());
    buzz.start(t);
    buzz.stop(t + 0.65);
  }

  /** Ascending crystalline chime */
  private _playChime(): void {
    const ctx = this.getContext();
    const t = ctx.currentTime;

    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
      osc.connect(gain);
      gain.connect(this.getMasterGain());
      osc.start(start);
      osc.stop(start + 0.85);
    });
  }

  /** Chain breaking + triumph */
  private _playChainBreak(): void {
    const ctx = this.getContext();
    const t = ctx.currentTime;

    // Chain snap (noise burst)
    const bufferSize = ctx.sampleRate * 0.2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2000;
    noise.connect(hp);
    hp.connect(noiseGain);
    noiseGain.connect(this.getMasterGain());
    noise.start(t);

    // Triumphant fanfare (major chord arpeggio)
    const fanfare = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
    fanfare.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = t + 0.15 + i * 0.08;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.setValueAtTime(0.2, start + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.2);
      osc.connect(gain);
      gain.connect(this.getMasterGain());
      osc.start(start);
      osc.stop(start + 1.25);
    });
  }

  /** Low ominous ambient drone (looping) */
  private _startAmbient(): void {
    if (this.ambientSource) return;

    const ctx = this.getContext();
    const t = ctx.currentTime;

    // Create a low drone with beating frequencies
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.value = 55; // A1
    osc2.type = "sine";
    osc2.frequency.value = 55.5; // Slightly detuned for beating

    gain.gain.value = 0.08;

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.getMasterGain());

    osc1.start(t);
    osc2.start(t);

    // Store reference for cleanup (store osc1 as the "source")
    this.ambientSource = osc1 as unknown as AudioBufferSourceNode;
    // Hack: store both oscillators for later cleanup
    (this as unknown as Record<string, unknown>)._ambientOsc2 = osc2;
    (this as unknown as Record<string, unknown>)._ambientGain = gain;
  }

  stopAmbient(): void {
    if (this.ambientSource) {
      try {
        (this.ambientSource as unknown as OscillatorNode).stop();
      } catch {
        /* already stopped */
      }
      this.ambientSource = null;
    }
    const osc2 = (this as unknown as Record<string, unknown>)._ambientOsc2 as OscillatorNode | null;
    if (osc2) {
      try {
        osc2.stop();
      } catch {
        /* already stopped */
      }
      (this as unknown as Record<string, unknown>)._ambientOsc2 = null;
    }
  }

  // ── Cleanup ───────────────────────────────────

  destroy(): void {
    this.stopAmbient();
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* */
      }
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.voiceCache.clear();
  }
}

// Singleton
let instance: SoundEngine | null = null;

export function getSoundEngine(): SoundEngine {
  if (!instance) {
    instance = new SoundEngine();
  }
  return instance;
}

export type { SoundEventType, VoiceLineType };

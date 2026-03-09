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
  "trapper-error": "/audio/trapper-error.mp3",
};

const SFX_FILES: Record<SoundEventType, string> = {
  countdown_tick: "/audio/sfx-tick.mp3",
  countdown_zero: "/audio/sfx-boom.mp3",
  ticket_burn: "/audio/sfx-fire.mp3",
  wrong_guess: "/audio/sfx-trap-snap.mp3",
  proof_ready: "/audio/sfx-chime.mp3",
  prize_claimed: "/audio/sfx-chain-break.mp3",
  trap_ambient: "/audio/sfx-ambient.mp3",
};

const MUSIC_FILES = {
  ambient: "/audio/music-ambient.mp3",
  victory: "/audio/music-victory.mp3",
};

class SoundEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private musicGainNode: GainNode | null = null;
  private muted = false;
  private audioCache: Map<string, AudioBuffer> = new Map();
  private ambientSource: AudioBufferSourceNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicPlaying = false;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);

      // Submix channels
      this.sfxGain = this.audioContext.createGain();
      this.sfxGain.gain.value = 0.8;
      this.sfxGain.connect(this.masterGain);

      this.voiceGain = this.audioContext.createGain();
      this.voiceGain.gain.value = 0.9;
      this.voiceGain.connect(this.masterGain);

      this.musicGainNode = this.audioContext.createGain();
      this.musicGainNode.gain.value = 0.25; // Music quieter (background)
      this.musicGainNode.connect(this.masterGain);
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // ── Mute Control ──────────────────────────────

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setValueAtTime(
        muted ? 0 : 1,
        this.audioContext.currentTime
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

  // ── Audio Loading ─────────────────────────────

  private async loadAudio(url: string): Promise<AudioBuffer | null> {
    if (this.audioCache.has(url)) return this.audioCache.get(url)!;
    try {
      const ctx = this.getContext();
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.audioCache.set(url, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    }
  }

  private async playFile(
    url: string,
    gainNode: GainNode,
    loop = false
  ): Promise<AudioBufferSourceNode | null> {
    if (this.muted) return null;
    const buffer = await this.loadAudio(url);
    if (!buffer) return null;

    const ctx = this.getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gainNode);
    source.start();
    return source;
  }

  // ── Preloading ────────────────────────────────

  async preloadAllVoices(): Promise<void> {
    const urls = [
      ...Object.values(VOICE_FILES),
      ...Object.values(SFX_FILES),
    ];
    await Promise.all(urls.map((url) => this.loadAudio(url)));
  }

  // ── Voiceover ─────────────────────────────────

  playVoice(name: VoiceLineType): void {
    const url = VOICE_FILES[name];
    if (!url) return;
    this.getContext();
    this.playFile(url, this.voiceGain!);
  }

  // ── Sound Effects ─────────────────────────────

  playSfx(event: SoundEventType): void {
    if (event === "trap_ambient") {
      this.startAmbient();
      return;
    }
    const url = SFX_FILES[event];
    if (!url) return;
    this.getContext();
    this.playFile(url, this.sfxGain!);
  }

  // ── Ambient Loop ──────────────────────────────

  private async startAmbient(): Promise<void> {
    if (this.ambientSource) return;
    this.getContext();
    const source = await this.playFile(
      SFX_FILES.trap_ambient,
      this.sfxGain!,
      true
    );
    if (source) {
      this.ambientSource = source;
    }
  }

  stopAmbient(): void {
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
      } catch {
        /* already stopped */
      }
      this.ambientSource = null;
    }
  }

  // ── Music ─────────────────────────────────────

  async playMusic(track: "ambient" | "victory"): Promise<void> {
    this.stopMusic();
    this.getContext();
    const url = MUSIC_FILES[track];
    const loop = track === "ambient";
    const source = await this.playFile(url, this.musicGainNode!, loop);
    if (source) {
      this.musicSource = source;
      this.musicPlaying = true;
      if (!loop) {
        source.onended = () => {
          this.musicPlaying = false;
          this.musicSource = null;
        };
      }
    }
  }

  stopMusic(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* already stopped */
      }
      this.musicSource = null;
      this.musicPlaying = false;
    }
  }

  // ── Cleanup ───────────────────────────────────

  destroy(): void {
    this.stopAmbient();
    this.stopMusic();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.audioCache.clear();
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

"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSoundEngine, type SoundEventType, type VoiceLineType } from "@/lib/sound-engine";

interface SoundContextValue {
  muted: boolean;
  toggleMute: () => void;
  playSfx: (event: SoundEventType) => void;
  playVoice: (name: VoiceLineType) => void;
}

const SoundContext = createContext<SoundContextValue>({
  muted: false,
  toggleMute: () => {},
  playSfx: () => {},
  playVoice: () => {},
});

export function useSoundEngine() {
  return useContext(SoundContext);
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const engine = getSoundEngine();
    const savedMute = engine.loadMutePreference();
    setMuted(savedMute);
    // Preload voice lines after first user interaction
    const preload = () => {
      engine.preloadAllVoices();
      window.removeEventListener("click", preload);
      window.removeEventListener("keydown", preload);
    };
    window.addEventListener("click", preload, { once: true });
    window.addEventListener("keydown", preload, { once: true });
    return () => {
      window.removeEventListener("click", preload);
      window.removeEventListener("keydown", preload);
    };
  }, []);

  const toggleMute = useCallback(() => {
    const engine = getSoundEngine();
    const newMuted = !engine.isMuted;
    engine.setMuted(newMuted);
    setMuted(newMuted);
  }, []);

  const playSfx = useCallback((event: SoundEventType) => {
    getSoundEngine().playSfx(event);
  }, []);

  const playVoice = useCallback((name: VoiceLineType) => {
    getSoundEngine().playVoice(name);
  }, []);

  return (
    <SoundContext.Provider value={{ muted, toggleMute, playSfx, playVoice }}>
      {children}
    </SoundContext.Provider>
  );
}

/** Mute/unmute button for the header */
export function SoundToggle() {
  const { muted, toggleMute } = useSoundEngine();

  return (
    <button
      onClick={toggleMute}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-trap-border/50 bg-trap-dark/50 text-trap-muted hover:text-trap-text hover:border-trap-border transition-all"
      title={muted ? "Unmute" : "Mute"}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
    >
      {muted ? (
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
    </button>
  );
}

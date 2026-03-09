import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        trap: {
          black: "#0a0a0a",
          dark: "#111111",
          mid: "#1a1a1a",
          border: "#2a2a2a",
          muted: "#666666",
          text: "#e5e5e5",
          green: "#22c55e",
          "green-dim": "#16a34a",
          red: "#ef4444",
          "red-dim": "#dc2626",
          amber: "#f59e0b",
          brown: "#8B4513",
          "brown-dim": "#654321",
          "brown-light": "#A0522D",
          rust: "#B7410E",
          "rust-dim": "#8B2500",
          ember: "#FF4500",
          gold: "#FFD700",
          "gold-dim": "#DAA520",
          steel: "#708090",
          chain: "#A9A9A9",
          shadow: "#1a1a2e",
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
        body: ['"Instrument Sans"', "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)",
        "noise-texture": "url('/noise.svg')",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
        flicker: "flicker 3s ease-in-out infinite",
        shake: "shake 0.4s ease-in-out",
        "chain-break": "chainBreak 0.6s ease-out forwards",
        shimmer: "shimmer 2s linear infinite",
        "ember-glow": "ember-glow 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
        },
        chainBreak: {
          "0%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.1)" },
          "100%": { opacity: "0", transform: "scale(1.5) rotate(5deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "ember-glow": {
          "0%, 100%": {
            boxShadow:
              "0 0 8px rgba(183,65,14,0.2), 0 0 20px rgba(183,65,14,0.05)",
          },
          "50%": {
            boxShadow:
              "0 0 16px rgba(183,65,14,0.4), 0 0 40px rgba(183,65,14,0.1)",
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;

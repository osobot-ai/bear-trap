"use client";

import { motion } from "framer-motion";

interface BearTrapSVGProps {
  state: "open" | "closed" | "snapping" | "opening";
  size?: number;
}

const jawVariants = {
  upper: {
    open: { rotate: -35 },
    closed: { rotate: 0 },
    snapping: { rotate: 0 },
    opening: { rotate: -35 },
  },
  lower: {
    open: { rotate: 35 },
    closed: { rotate: 0 },
    snapping: { rotate: 0 },
    opening: { rotate: 35 },
  },
};

const springTransitions = {
  open: { type: "spring" as const, stiffness: 100, damping: 20 },
  closed: { duration: 0 },
  snapping: { type: "spring" as const, stiffness: 400, damping: 15 },
  opening: { type: "spring" as const, stiffness: 100, damping: 20 },
};

export function BearTrapSVG({ state, size = 120 }: BearTrapSVGProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Rusty metal gradient */}
        <linearGradient id="rustGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#B7410E" />
          <stop offset="50%" stopColor="#8B4513" />
          <stop offset="100%" stopColor="#8B2500" />
        </linearGradient>
        {/* Steel gradient for teeth */}
        <linearGradient id="steelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#708090" />
          <stop offset="100%" stopColor="#4a5568" />
        </linearGradient>
        {/* Chain gradient */}
        <linearGradient id="chainGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#A9A9A9" />
          <stop offset="50%" stopColor="#708090" />
          <stop offset="100%" stopColor="#A9A9A9" />
        </linearGradient>
        {/* Glow filter for pressure plate */}
        <filter id="plateGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Chain links at base */}
      <g>
        {/* Link 1 */}
        <ellipse
          cx="52"
          cy="108"
          rx="7"
          ry="4.5"
          fill="none"
          stroke="url(#chainGrad)"
          strokeWidth="2.5"
        />
        {/* Link 2 — interlocking */}
        <ellipse
          cx="60"
          cy="106"
          rx="7"
          ry="4.5"
          fill="none"
          stroke="url(#chainGrad)"
          strokeWidth="2.5"
          transform="rotate(15, 60, 106)"
        />
        {/* Link 3 */}
        <ellipse
          cx="68"
          cy="108"
          rx="7"
          ry="4.5"
          fill="none"
          stroke="url(#chainGrad)"
          strokeWidth="2.5"
        />
      </g>

      {/* Base plate / spring mechanism */}
      <rect
        x="30"
        y="58"
        width="60"
        height="8"
        rx="2"
        fill="url(#rustGrad)"
        opacity="0.9"
      />
      {/* Spring coils */}
      <path
        d="M45 66 L45 95 M55 66 L55 95 M65 66 L65 95 M75 66 L75 95"
        stroke="#8B4513"
        strokeWidth="1.5"
        opacity="0.5"
        strokeDasharray="3 2"
      />
      {/* Vertical supports */}
      <rect x="42" y="66" width="4" height="32" rx="1" fill="#8B4513" opacity="0.7" />
      <rect x="74" y="66" width="4" height="32" rx="1" fill="#8B4513" opacity="0.7" />
      {/* Base bar */}
      <rect x="35" y="95" width="50" height="5" rx="2" fill="url(#rustGrad)" opacity="0.8" />

      {/* Pressure plate (center) */}
      <circle
        cx="60"
        cy="55"
        r="10"
        fill="#654321"
        stroke="#B7410E"
        strokeWidth="1.5"
        filter="url(#plateGlow)"
      />
      <circle cx="60" cy="55" r="6" fill="none" stroke="#8B4513" strokeWidth="1" opacity="0.6" />
      <circle cx="60" cy="55" r="2" fill="#B7410E" opacity="0.8" />

      {/* Upper jaw — rotates around the hinge point at the base plate level */}
      <motion.g
        style={{ originX: "50%", originY: "52px" }}
        variants={jawVariants.upper}
        animate={state}
        transition={springTransitions[state]}
      >
        {/* Jaw arm */}
        <path
          d="M25 55 Q30 30, 60 20 Q90 30, 95 55"
          fill="none"
          stroke="url(#rustGrad)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Teeth — upper (pointing down) */}
        <polygon points="34,52 37,42 40,52" fill="url(#steelGrad)" />
        <polygon points="44,48 47,36 50,48" fill="url(#steelGrad)" />
        <polygon points="53,45 56,32 59,45" fill="url(#steelGrad)" />
        <polygon points="61,45 64,32 67,45" fill="url(#steelGrad)" />
        <polygon points="70,48 73,36 76,48" fill="url(#steelGrad)" />
        <polygon points="80,52 83,42 86,52" fill="url(#steelGrad)" />
        {/* Rust texture dots on jaw */}
        <circle cx="40" cy="40" r="1" fill="#8B2500" opacity="0.4" />
        <circle cx="70" cy="38" r="1.5" fill="#8B2500" opacity="0.3" />
        <circle cx="55" cy="30" r="1" fill="#8B2500" opacity="0.5" />
      </motion.g>

      {/* Lower jaw — rotates opposite direction */}
      <motion.g
        style={{ originX: "50%", originY: "58px" }}
        variants={jawVariants.lower}
        animate={state}
        transition={springTransitions[state]}
      >
        {/* Jaw arm */}
        <path
          d="M25 58 Q30 80, 60 90 Q90 80, 95 58"
          fill="none"
          stroke="url(#rustGrad)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Teeth — lower (pointing up) */}
        <polygon points="34,58 37,68 40,58" fill="url(#steelGrad)" />
        <polygon points="44,62 47,74 50,62" fill="url(#steelGrad)" />
        <polygon points="53,65 56,78 59,65" fill="url(#steelGrad)" />
        <polygon points="61,65 64,78 67,65" fill="url(#steelGrad)" />
        <polygon points="70,62 73,74 76,62" fill="url(#steelGrad)" />
        <polygon points="80,58 83,68 86,58" fill="url(#steelGrad)" />
        {/* Rust texture dots on jaw */}
        <circle cx="45" cy="72" r="1" fill="#8B2500" opacity="0.4" />
        <circle cx="65" cy="75" r="1.5" fill="#8B2500" opacity="0.3" />
        <circle cx="80" cy="65" r="1" fill="#8B2500" opacity="0.5" />
      </motion.g>

      {/* Hinge pins at pivot points */}
      <circle cx="25" cy="56" r="3" fill="#708090" stroke="#4a5568" strokeWidth="1" />
      <circle cx="95" cy="56" r="3" fill="#708090" stroke="#4a5568" strokeWidth="1" />
    </svg>
  );
}

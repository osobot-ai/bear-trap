"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useSoundEngine } from "@/components/SoundController";

interface CountdownTimerProps {
  startsAt: string; // ISO 8601 timestamp
}

export function CountdownTimer({ startsAt }: CountdownTimerProps) {
  const { playSfx, playVoice } = useSoundEngine();
  const lastSecondRef = useRef(-1);
  const hasPlayedZeroRef = useRef(false);
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const totalSeconds = timeLeft.days * 86400 + timeLeft.hours * 3600 + timeLeft.minutes * 60 + timeLeft.seconds;
  const isUrgent = totalSeconds > 0 && totalSeconds < 60;
  const isFinal = totalSeconds > 0 && totalSeconds <= 10;

  useEffect(() => {
    const calculateTimeLeft = () => {
      const startTime = new Date(startsAt).getTime();
      const now = new Date().getTime();
      const difference = startTime - now;

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        if (!hasPlayedZeroRef.current) {
          hasPlayedZeroRef.current = true;
          playSfx("countdown_zero");
          setTimeout(() => playVoice("trapper-begin"), 500);
        }
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [startsAt, playSfx, playVoice]);

  useEffect(() => {
    const totalSec = timeLeft.days * 86400 + timeLeft.hours * 3600 + timeLeft.minutes * 60 + timeLeft.seconds;
    if (totalSec > 0 && totalSec <= 10 && timeLeft.seconds !== lastSecondRef.current) {
      lastSecondRef.current = timeLeft.seconds;
      playSfx("countdown_tick");
    }
  }, [timeLeft, playSfx]);

  const formatDigits = (value: number) => value.toString().padStart(2, "0");

  const digitColor = isUrgent ? 'text-trap-red' : 'text-trap-gold';
  const glowClass = isUrgent ? '' : 'animate-glow-gold';

  return (
    <div className="text-center space-y-6">
      {isFinal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          className="fixed inset-0 bg-black pointer-events-none z-40"
        />
      )}

      <motion.div
        animate={isUrgent ? {
          boxShadow: ['0 0 20px rgba(239,68,68,0.1)', '0 0 40px rgba(239,68,68,0.3)', '0 0 20px rgba(239,68,68,0.1)'],
        } : { boxShadow: '0 0 0px transparent' }}
        transition={{ duration: 1.5, repeat: isUrgent ? Infinity : 0 }}
        className="rounded-xl p-4"
      >
        <div className="flex items-center justify-center gap-4 sm:gap-6">
          <div className="text-center">
            <div className={`font-display text-4xl sm:text-5xl lg:text-6xl ${digitColor} ${glowClass}`}>
              {formatDigits(timeLeft.days)}
            </div>
            <div className="text-xs font-mono text-trap-muted uppercase tracking-wider mt-1">
              Days
            </div>
          </div>
          
          <div className={`${isUrgent ? 'text-trap-red/50' : 'text-trap-gold/50'} text-3xl sm:text-4xl lg:text-5xl font-display animate-pulse`}>
            :
          </div>
          
          <div className="text-center">
            <div className={`font-display text-4xl sm:text-5xl lg:text-6xl ${digitColor} ${glowClass}`}>
              {formatDigits(timeLeft.hours)}
            </div>
            <div className="text-xs font-mono text-trap-muted uppercase tracking-wider mt-1">
              Hours
            </div>
          </div>
          
          <div className={`${isUrgent ? 'text-trap-red/50' : 'text-trap-gold/50'} text-3xl sm:text-4xl lg:text-5xl font-display animate-pulse`}>
            :
          </div>
          
          <div className="text-center">
            <div className={`font-display text-4xl sm:text-5xl lg:text-6xl ${digitColor} ${glowClass}`}>
              {formatDigits(timeLeft.minutes)}
            </div>
            <div className="text-xs font-mono text-trap-muted uppercase tracking-wider mt-1">
              Minutes
            </div>
          </div>
          
          <div className={`${isUrgent ? 'text-trap-red/50' : 'text-trap-gold/50'} text-3xl sm:text-4xl lg:text-5xl font-display animate-pulse`}>
            :
          </div>
          
          <div className="text-center">
            <div className={`font-display text-4xl sm:text-5xl lg:text-6xl ${digitColor} ${glowClass}`}>
              {formatDigits(timeLeft.seconds)}
            </div>
            <div className="text-xs font-mono text-trap-muted uppercase tracking-wider mt-1">
              Seconds
            </div>
          </div>
        </div>
      </motion.div>

      <div className="text-xl sm:text-2xl font-display text-trap-rust uppercase tracking-wider">
        THE TRAP IS BEING SET...
      </div>
    </div>
  );
}

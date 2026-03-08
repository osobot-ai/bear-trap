"use client";

import { useState, useEffect } from "react";

interface CountdownTimerProps {
  startsAt: string; // ISO 8601 timestamp
}

export function CountdownTimer({ startsAt }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

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
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [startsAt]);

  const formatDigits = (value: number) => value.toString().padStart(2, "0");

  return (
    <div className="text-center space-y-6">
      {/* Countdown Display */}
      <div className="flex items-center justify-center gap-4 sm:gap-6">
        <div className="text-center">
          <div className="font-display text-4xl sm:text-5xl lg:text-6xl text-trap-gold animate-glow-gold">
            {formatDigits(timeLeft.days)}
          </div>
          <div className="text-xs font-mono text-trap-muted uppercase tracking-wider mt-1">
            Days
          </div>
        </div>
        
        <div className="text-trap-gold/50 text-3xl sm:text-4xl lg:text-5xl font-display animate-pulse">
          :
        </div>
        
        <div className="text-center">
          <div className="font-display text-4xl sm:text-5xl lg:text-6xl text-trap-gold animate-glow-gold">
            {formatDigits(timeLeft.hours)}
          </div>
          <div className="text-xs font-mono text-trap-muted uppercase tracking-wider mt-1">
            Hours
          </div>
        </div>
        
        <div className="text-trap-gold/50 text-3xl sm:text-4xl lg:text-5xl font-display animate-pulse">
          :
        </div>
        
        <div className="text-center">
          <div className="font-display text-4xl sm:text-5xl lg:text-6xl text-trap-gold animate-glow-gold">
            {formatDigits(timeLeft.minutes)}
          </div>
          <div className="text-xs font-mono text-trap-muted uppercase tracking-wider mt-1">
            Minutes
          </div>
        </div>
        
        <div className="text-trap-gold/50 text-3xl sm:text-4xl lg:text-5xl font-display animate-pulse">
          :
        </div>
        
        <div className="text-center">
          <div className="font-display text-4xl sm:text-5xl lg:text-6xl text-trap-gold animate-glow-gold">
            {formatDigits(timeLeft.seconds)}
          </div>
          <div className="text-xs font-mono text-trap-muted uppercase tracking-wider mt-1">
            Seconds
          </div>
        </div>
      </div>

      {/* Subtitle */}
      <div className="text-xl sm:text-2xl font-display text-trap-rust uppercase tracking-wider">
        THE TRAP IS BEING SET...
      </div>
    </div>
  );
}
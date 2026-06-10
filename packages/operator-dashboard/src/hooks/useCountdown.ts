import { useState, useEffect } from 'react';

export function useCountdown(deadline: string): { minutes: number; seconds: number; isUrgent: boolean } {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const calc = () => Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
    setRemaining(calc());
    const id = setInterval(() => setRemaining(calc()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return {
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
    isUrgent: remaining < 5 * 60, // red when < 5 minutes
  };
}

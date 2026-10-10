import { useState, useEffect, useRef } from 'react';
import { useMotionMode } from './useReducedMotion';

export function useCountUp(targetValue: number, duration = 800, decimals = 0): number {
  const { isOff } = useMotionMode();
  const [current, setCurrent] = useState(isOff ? targetValue : 0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (isOff) {
      setCurrent(targetValue);
      return;
    }

    if (hasAnimated.current) {
      setCurrent(targetValue);
      return;
    }

    hasAnimated.current = true;
    const startValue = 0;
    const startTime = performance.now();

    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic: 1 - Math.pow(1 - progress, 3)
      const ease = 1 - Math.pow(1 - progress, 3);
      const val = startValue + (targetValue - startValue) * ease;
      
      setCurrent(Number(val.toFixed(decimals)));

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        setCurrent(targetValue);
      }
    };

    requestAnimationFrame(update);
  }, [targetValue, duration, decimals, isOff]);

  return current;
}

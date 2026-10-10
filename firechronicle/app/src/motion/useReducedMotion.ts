import { useState, useEffect } from 'react';
import type { MotionMode } from './tokens';

const STORAGE_KEY = 'bengalflare_motion_mode';

export function getInitialMotionMode(): MotionMode {
  const saved = localStorage.getItem(STORAGE_KEY) as MotionMode | null;
  if (saved === 'full' || saved === 'reduced' || saved === 'off') {
    return saved;
  }
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'reduced';
  }
  return 'full';
}

export function useMotionMode() {
  const [motionMode, setMotionModeState] = useState<MotionMode>(getInitialMotionMode);

  useEffect(() => {
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setMotionModeState(e.matches ? 'reduced' : 'full');
      }
    };

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  const setMotionMode = (mode: MotionMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    setMotionModeState(mode);
    document.documentElement.setAttribute('data-motion', mode);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-motion', motionMode);
  }, [motionMode]);

  return {
    motionMode,
    setMotionMode,
    isFull: motionMode === 'full',
    isReduced: motionMode === 'reduced',
    isOff: motionMode === 'off',
  };
}

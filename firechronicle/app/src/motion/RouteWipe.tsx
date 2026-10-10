import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMotionMode } from './useReducedMotion';
import './RouteWipe.css';

export const RouteWipe: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { isFull } = useMotionMode();
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!isFull) return;
    setAnimating(true);
    const timer = setTimeout(() => {
      setAnimating(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [location.pathname, isFull]);

  return (
    <div className={`route-wipe-container ${animating ? 'is-wiping' : ''}`}>
      {animating && <div className="scan-line" />}
      <div className="route-wipe-content">
        {children}
      </div>
    </div>
  );
};

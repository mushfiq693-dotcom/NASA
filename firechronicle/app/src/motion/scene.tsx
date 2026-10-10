import React, { useEffect, useRef } from 'react';
import { useMotionMode } from './useReducedMotion';

interface SatelliteArc {
  name: string;
  sensor: string;
  radiusX: number;
  radiusY: number;
  rotation: number; // inclination angle
  speed: number;
  color: string;
  offset: number;
}

export const SharedMotionScene: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { motionMode } = useMotionMode();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Generate Stars
    const numStars = 120;
    const stars = Array.from({ length: numStars }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.7 + 0.2,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
    }));

    // Pointer Parallax
    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = width / 2;
    let targetMouseY = height / 2;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Satellites Configuration
    const satellites: SatelliteArc[] = [
      { name: 'Terra', sensor: 'MODIS', radiusX: 320, radiusY: 140, rotation: -0.35, speed: 0.0008, color: '#ff9800', offset: 0 },
      { name: 'Aqua', sensor: 'MODIS', radiusX: 360, radiusY: 155, rotation: 0.42, speed: 0.00075, color: '#ffb74d', offset: Math.PI * 0.4 },
      { name: 'S-NPP', sensor: 'VIIRS', radiusX: 400, radiusY: 170, rotation: -0.28, speed: 0.0007, color: '#f44336', offset: Math.PI * 0.8 },
      { name: 'NOAA-20', sensor: 'VIIRS', radiusX: 440, radiusY: 185, rotation: 0.38, speed: 0.00068, color: '#66fcf1', offset: Math.PI * 1.2 },
      { name: 'NOAA-21', sensor: 'VIIRS', radiusX: 480, radiusY: 200, rotation: -0.45, speed: 0.00065, color: '#45a29e', offset: Math.PI * 1.6 },
    ];

    let time = 0;
    let isVisible = true;

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const render = () => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Smooth parallax
      if (motionMode === 'full') {
        mouseX += (targetMouseX - mouseX) * 0.05;
        mouseY += (targetMouseY - mouseY) * 0.05;
      }

      const parallaxX = ((mouseX - width / 2) / (width / 2)) * 15;
      const parallaxY = ((mouseY - height / 2) / (height / 2)) * 15;

      // Draw Stars
      ctx.fillStyle = '#ffffff';
      for (const star of stars) {
        ctx.globalAlpha = star.alpha;
        if (motionMode === 'full') {
          star.alpha += Math.sin(time * star.twinkleSpeed) * 0.005;
          star.alpha = Math.max(0.1, Math.min(0.9, star.alpha));
        }
        ctx.fillRect(star.x + parallaxX * 0.3, star.y + parallaxY * 0.3, star.size, star.size);
      }
      ctx.globalAlpha = 1.0;

      // Draw Satellite Orbital Arcs & Markers
      const centerX = width / 2 + parallaxX;
      const centerY = height / 2 + parallaxY;

      satellites.forEach((sat) => {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(sat.rotation);

        // Orbital Ellipse Arc
        ctx.beginPath();
        ctx.ellipse(0, 0, sat.radiusX, sat.radiusY, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(102, 252, 241, 0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Satellite Marker position
        const angle = motionMode === 'off' ? sat.offset : (time * sat.speed * (motionMode === 'reduced' ? 0.3 : 1.0) + sat.offset) % (Math.PI * 2);
        const satX = sat.radiusX * Math.cos(angle);
        const satY = sat.radiusY * Math.sin(angle);

        // Marker dot
        ctx.beginPath();
        ctx.arc(satX, satY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = sat.color;
        ctx.shadowColor = sat.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(197, 198, 199, 0.6)';
        ctx.fillText(sat.name, satX + 6, satY + 3);

        ctx.restore();
      });

      if (motionMode !== 'off') {
        time += 1;
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [motionMode]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div
        style={{
          position: 'fixed',
          bottom: '12px',
          left: '12px',
          fontSize: '0.65rem',
          fontFamily: '"JetBrains Mono", monospace',
          color: 'rgba(102, 252, 241, 0.4)',
          letterSpacing: '1px',
          zIndex: 1,
          pointerEvents: 'none'
        }}
      >
        ORBIT SIMULATION · CONSTEL SPEED ×60 · MODIS/VIIRS
      </div>
    </div>
  );
};

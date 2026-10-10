/**
 * Overpass Sweep Primitive & Ignition Timing Helper
 * Spec from animation_prompt_all_pages.md Section 0 & 1
 */

export interface OverpassPass {
  id: string;
  satellite: string;
  sensor: 'MODIS' | 'VIIRS';
  timeUtc: string;
  localTime: string;
  isOutage?: boolean;
  swathWidthKm: number; // MODIS ~2330, VIIRS ~3060
  detectionsCount: number;
}

export interface SweepOptions {
  durationMs: number;
  direction?: 'left-to-right' | 'north-to-south';
  isOutage?: boolean;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}

export class SwathSweepController {
  private startTime: number = 0;
  private duration: number = 1200;
  private isRunning: boolean = false;
  private rafId: number = 0;
  private options: SweepOptions;

  constructor(options: SweepOptions) {
    this.options = options;
    this.duration = options.durationMs || 1200;
  }

  public start() {
    this.isRunning = true;
    this.startTime = performance.now();
    this.tick();
  }

  public stop() {
    this.isRunning = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private tick = () => {
    if (!this.isRunning) return;
    const now = performance.now();
    const elapsed = now - this.startTime;
    const progress = Math.min(1, elapsed / this.duration);

    if (this.options.onProgress) {
      this.options.onProgress(progress);
    }

    if (progress < 1) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.isRunning = false;
      if (this.options.onComplete) {
        this.options.onComplete();
      }
    }
  };
}

/**
 * Calculates point cooling color given age in milliseconds.
 * Flash: #ffffff / #ffeb3b -> Hot orange: #ff9800 -> Deep ember red: #b71c1c
 */
export function getPointCoolingColor(ageMs: number, maxAgeMs = 3000): string {
  const t = Math.min(1, Math.max(0, ageMs / maxAgeMs));
  if (t < 0.1) return '#ffffff'; // Initial ignition flash
  if (t < 0.3) return '#ffeb3b'; // High thermal yellow
  if (t < 0.6) return '#ff9800'; // Orange
  if (t < 0.85) return '#f44336'; // Thermal Red
  return '#8a1313'; // Cool ember
}

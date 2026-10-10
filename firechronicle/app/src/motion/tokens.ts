/**
 * FireChronicle Motion Design Tokens
 * Spec from animation_prompt_all_pages.md Section 1
 */

export const MOTION_DURATIONS = {
  instant: 120, // 120ms
  micro: 240,   // 240ms
  medium: 480,  // 480ms
  macro: 900,   // 900ms
  scene: 1600,  // 1600ms
} as const;

export const MOTION_EASINGS = {
  enter: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  linear: 'linear',
  gsapEnter: 'power3.out',
  gsapInOut: 'power2.inOut',
} as const;

export type MotionMode = 'full' | 'reduced' | 'off';

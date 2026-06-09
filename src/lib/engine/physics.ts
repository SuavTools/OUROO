// Shared movement feel for every game mode on the platform.
// These constants are the exact values OUROO's jump loop is tuned around (see the
// ArcadeCanvas JUMP block) so a player who knows OUROO's air control feels at home
// in any new mode built on top of them.
export const GRAVITY = 0.76;          // downward accel, px/frame²
export const TERMINAL_VY = 20;        // max fall speed, px/frame
export const JUMP_VY = -14.6;         // ground jump impulse
export const AIR_JUMP_VY = -12.4;     // second (air) jump
export const TRIPLE_JUMP_VY = -11.5;  // third jump (triple-jump power-up)
export const COYOTE_FRAMES = 5;       // grace frames to still jump just after leaving footing
export const JUMP_BUFFER_FRAMES = 6;  // frames an early jump press is remembered

// One gravity step on any body exposing a mutable vy. Clamps to terminal velocity.
export function applyGravity(body: { vy: number }) {
  body.vy = Math.min(body.vy + GRAVITY, TERMINAL_VY);
}

// Peak rise (px) of a single jump from a given impulse — used by the map generator to
// guarantee the next coin sits inside a reachable arc. h = v² / (2·g).
export function jumpRise(impulse: number = JUMP_VY): number {
  return (impulse * impulse) / (2 * GRAVITY);
}

// Total airtime (frames) of a jump that returns to its launch height: t = 2·|v| / g.
export function jumpAirtime(impulse: number = JUMP_VY): number {
  return (2 * Math.abs(impulse)) / GRAVITY;
}

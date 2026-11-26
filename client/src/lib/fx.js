import confetti from 'canvas-confetti';

const COLORS = ['#CC8B65', '#2C7A63', '#6FBF9C', '#E6B98F', '#C4583F', '#E3DCD2'];

export function burst(opts = {}) {
  confetti({ particleCount: 120, spread: 80, startVelocity: 45, origin: { y: 0.6 }, colors: COLORS, zIndex: 9999, ...opts });
}

export function sideBurst(side = 'A') {
  confetti({ particleCount: 70, angle: side === 'A' ? 60 : 120, spread: 60, origin: { x: side === 'A' ? 0.2 : 0.8, y: 0.55 }, colors: COLORS, zIndex: 9999 });
}

/** Continuous celebration for `ms` milliseconds. Returns a stop function. */
export function celebrate(ms = 6000) {
  const end = Date.now() + ms;
  let stopped = false;
  (function frame() {
    if (stopped) return;
    confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: COLORS, zIndex: 9999 });
    confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: COLORS, zIndex: 9999 });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  return () => {
    stopped = true;
  };
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth; // restart animation
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 700);
}

export async function toggleFullscreen(el = document.documentElement) {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  } catch {
    /* not allowed */
  }
}

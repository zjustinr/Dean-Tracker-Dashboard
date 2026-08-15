import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Animates window scroll to bring `el` near the top of the viewport. Uses a
// manual window.scrollTo + setTimeout easing loop rather than native
// scrollIntoView({behavior:"smooth"}), which is a silent no-op in some
// embedded browsers (see IndividualSearch's profile-open scroll for the case
// that surfaced this). setTimeout (not requestAnimationFrame) keeps the
// animation running even while the tab is backgrounded.
export function animateScrollIntoView(el: HTMLElement, offset = 72) {
  const targetY = Math.max(0, window.scrollY + el.getBoundingClientRect().top - offset);
  const startY = window.scrollY;
  const dist = targetY - startY;
  if (Math.abs(dist) < 4) return;
  const steps = 22, stepMs = 18;
  let i = 0;
  const step = () => {
    i += 1;
    const p = Math.min(1, i / steps);
    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
    window.scrollTo(0, startY + dist * ease);
    if (p < 1) setTimeout(step, stepMs);
  };
  step();
}

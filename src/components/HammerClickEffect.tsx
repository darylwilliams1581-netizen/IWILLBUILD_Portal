/**
 * Hammer Click Effect
 * ─────────────────────────────────────────────────────────────────────────────
 * Mounted once at the app root. When hammer cursor mode is enabled, listens
 * for mousedown events and spawns a tiny hammer-swing overlay at the pointer
 * position. The overlay is pointer-events:none, self-removes after 400 ms,
 * and is suppressed in inputs/textareas/contenteditable elements.
 *
 * Respects prefers-reduced-motion — no animation spawned when the user has
 * requested reduced motion.
 *
 * The hammer SVG is a simple inline shape (hard hat + handle) — no external
 * assets, no canvas, no game engine.
 */

import { useEffect } from 'react';
import { useHammerCursor } from '@/lib/useHammerCursor';

// Tags where we suppress the effect (text-editing contexts)
const SUPPRESS_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);

function isEditingContext(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  if (SUPPRESS_TAGS.has(target.tagName)) return true;
  // contenteditable (rich text editors, document builder blocks)
  if (target.closest('[contenteditable="true"]')) return true;
  // CodeMirror / ProseMirror / Quill editors
  if (target.closest('.ProseMirror, .ql-editor, .cm-editor')) return true;
  return false;
}

// Throttle: don't spawn more than 1 effect per 80 ms (prevents rapid-fire during drag)
let lastSpawnAt = 0;
const THROTTLE_MS = 80;

function spawnHammerEffect(x: number, y: number) {
  const now = Date.now();
  if (now - lastSpawnAt < THROTTLE_MS) return;
  lastSpawnAt = now;

  // Respect prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const el = document.createElement('span');
  el.className = 'hammer-click-effect';
  el.setAttribute('aria-hidden', 'true');

  // Position: centred on the click point, offset slightly up-left so the
  // hammer head appears to strike the click target
  el.style.cssText = `
    position: fixed;
    left: ${x - 14}px;
    top: ${y - 28}px;
    width: 28px;
    height: 28px;
    pointer-events: none;
    z-index: 99999;
    transform-origin: 80% 90%;
  `;

  // Inline SVG hammer (hard hat silhouette + handle)
  el.innerHTML = `
    <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"
         width="28" height="28" aria-hidden="true">
      <!-- Handle -->
      <rect x="13" y="14" width="4" height="13" rx="2"
            fill="#92400e" transform="rotate(-10 15 20)" />
      <!-- Head body -->
      <rect x="4" y="6" width="18" height="10" rx="3" fill="#F97316" />
      <!-- Head face plate (lighter band) -->
      <rect x="4" y="12" width="18" height="3" rx="1.5" fill="#fb923c" />
      <!-- Claw notch left -->
      <path d="M4 6 L1 3 L5 6Z" fill="#ea580c" />
      <!-- Claw notch right -->
      <path d="M24 6 L27 3 L23 6Z" fill="#ea580c" />
    </svg>
  `;

  document.body.appendChild(el);

  // Trigger animation on next frame so the initial state is painted first
  requestAnimationFrame(() => {
    el.classList.add('hammer-click-effect--active');
  });

  // Remove after animation completes
  setTimeout(() => {
    el.remove();
  }, 420);
}

export default function HammerClickEffect() {
  const { enabled } = useHammerCursor();

  useEffect(() => {
    if (!enabled) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (isEditingContext(e.target)) return;
      spawnHammerEffect(e.clientX, e.clientY);
    };

    document.addEventListener('mousedown', handleMouseDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [enabled]);

  // This component renders nothing — it's a pure side-effect mount
  return null;
}

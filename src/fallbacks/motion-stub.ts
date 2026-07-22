/**
 * motion-stub.ts
 *
 * SSR stub for motion/react. The real motion library is browser-only
 * (uses DOM APIs). During SSR we replace it with a Proxy that returns
 * a plain React forwardRef component for any HTML tag, so <motion.div>,
 * <motion.span>, etc. render as their plain HTML equivalents.
 *
 * AnimatePresence just renders its children directly.
 */

import { forwardRef, createElement, Fragment } from 'react';
import type { ComponentPropsWithRef, ElementType } from 'react';

// A no-op component that renders as the given HTML tag
function makeMotionComponent(tag: ElementType) {
  const Comp = forwardRef<unknown, ComponentPropsWithRef<ElementType>>(
    ({ children, ...props }, ref) => {
      // Strip motion-specific props that would cause React warnings
      const {
        initial: _i, animate: _a, exit: _e, whileHover: _wh, whileTap: _wt,
        whileInView: _wiv, variants: _v, transition: _t, viewport: _vp,
        layout: _l, layoutId: _lid, drag: _d, dragConstraints: _dc,
        onAnimationComplete: _oac, ...rest
      } = props as Record<string, unknown>;
      return createElement(tag as string, { ...rest, ref }, children);
    }
  );
  Comp.displayName = `motion.${String(tag)}`;
  return Comp;
}

// Proxy that creates a motion component for any HTML tag on first access
const motionProxy = new Proxy({} as Record<string, ReturnType<typeof makeMotionComponent>>, {
  get(target, tag: string) {
    if (!target[tag]) {
      target[tag] = makeMotionComponent(tag);
    }
    return target[tag];
  },
});

export const motion = motionProxy;

// AnimatePresence — just render children
export function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return createElement(Fragment, null, children);
}

// Other commonly imported hooks — no-ops on the server
export const useAnimation = () => ({});
export const useMotionValue = (initial: unknown) => ({ get: () => initial, set: () => {} });
export const useTransform = () => ({ get: () => 0 });
export const useSpring = (initial: unknown) => ({ get: () => initial });
export const useInView = () => [null, false];
export const useScroll = () => ({ scrollY: { get: () => 0 }, scrollYProgress: { get: () => 0 } });
export const useReducedMotion = () => true;

export default motion;

import { useCallback, useEffect, useRef } from "react";

import { isOriginAllowed } from "../utils/postMessage";
import { resolveHoverableAnchor, type HoveredElement } from "./useImageHoverDetection";

const PENDING_EDIT_TARGET = "PENDING_EDIT_TARGET";

export type PendingEditTargetKind = "text" | "image" | "content";

export interface PendingEditTargetPayload {
  type: typeof PENDING_EDIT_TARGET;
  selector: string;
  elementKind: PendingEditTargetKind;
  clientX: number;
  clientY: number;
}

export interface PendingEditApply {
  startEditing: (el: HTMLElement) => void;
  openToolbarFor: (anchor: HoveredElement) => void;
}

function isPendingEditTargetPayload(data: unknown): data is PendingEditTargetPayload {
  if (typeof data !== "object" || data === null) return false;
  const record: Record<string, unknown> = data as Record<string, unknown>;
  const kind: unknown = record.elementKind;
  return (
    record.type === PENDING_EDIT_TARGET &&
    typeof record.selector === "string" &&
    (kind === "text" || kind === "image" || kind === "content") &&
    typeof record.clientX === "number" &&
    typeof record.clientY === "number"
  );
}

function queryTarget(selector: string): HTMLElement | null {
  try {
    const found: Element | null = document.querySelector(selector);
    return found instanceof HTMLElement ? found : null;
  } catch {
    return null;
  }
}

function resolveAnchorFromPoint(clientX: number, clientY: number): HoveredElement | null {
  if (typeof document.elementsFromPoint !== "function") return null;
  const stack: Element[] = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (!(el instanceof HTMLElement)) continue;
    const anchor: HoveredElement | null = resolveHoverableAnchor(el);
    if (anchor !== null) return anchor;
  }
  return null;
}

function applyPendingTarget(payload: PendingEditTargetPayload, apply: PendingEditApply): void {
  const fromSelector: HTMLElement | null = queryTarget(payload.selector);

  if (payload.elementKind === "text") {
    if (fromSelector !== null) {
      apply.startEditing(fromSelector);
      return;
    }
    const fallback: HoveredElement | null = resolveAnchorFromPoint(payload.clientX, payload.clientY);
    if (fallback !== null) {
      apply.startEditing(fallback.element);
    }
    return;
  }

  const fromFound: HoveredElement | null =
    fromSelector !== null ? resolveHoverableAnchor(fromSelector) : null;
  if (fromFound !== null) {
    apply.openToolbarFor(fromFound);
    return;
  }
  const fallback: HoveredElement | null = resolveAnchorFromPoint(payload.clientX, payload.clientY);
  if (fallback !== null) {
    apply.openToolbarFor(fallback);
  }
}

export function usePendingEditTarget(
  isEditModeActive: boolean,
  apply: PendingEditApply,
): void {
  const applyRef = useRef<PendingEditApply>(apply);
  applyRef.current = apply;
  const pendingRef = useRef<PendingEditTargetPayload | null>(null);

  const tryApply = useCallback((payload: PendingEditTargetPayload): void => {
    applyPendingTarget(payload, applyRef.current);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (!isOriginAllowed(event)) return;
      if (!isPendingEditTargetPayload(event.data)) return;
      if (!isEditModeActive) {
        pendingRef.current = event.data;
        return;
      }
      pendingRef.current = null;
      tryApply(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [isEditModeActive, tryApply]);

  useEffect(() => {
    if (!isEditModeActive) return;
    const pending: PendingEditTargetPayload | null = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    tryApply(pending);
  }, [isEditModeActive, tryApply]);
}

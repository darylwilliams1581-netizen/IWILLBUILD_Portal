/**
 * usePlanManager — central state for the Plan Manager module.
 * Handles drawings list, selected drawing detail, viewer state, and annotation dirty tracking.
 */
import { useState, useCallback, useRef } from 'react';
import type { Drawing, DrawingRevision, Annotation, ViewerState } from './types';

export interface DrawingDetail {
  drawing: Drawing;
  revisions: DrawingRevision[];
  jobLinks: Array<{ id: number; job_id: number; job_name: string; job_number: string; context_note?: string }>;
  auditLog: Array<{ id: number; actor_id: string; action: string; details_json: string; created_at: string }>;
}

export interface PlanManagerState {
  // List
  drawings: Drawing[];
  listLoading: boolean;
  listError: string | null;
  // Selected drawing
  selected: DrawingDetail | null;
  detailLoading: boolean;
  // Viewer
  viewer: ViewerState;
  // Annotations (keyed by pageNo)
  annotations: Map<number, Annotation[]>;
  dirtyPages: Set<number>;
  saving: boolean;
  saveError: string | null;
  // Upload
  uploading: boolean;
  uploadProgress: number;
}

const DEFAULT_VIEWER: ViewerState = {
  scale: 1.0,
  rotation: 0,
  currentPage: 1,
  totalPages: 1,
  fitWidth: true,
};

export function usePlanManager() {
  const [state, setState] = useState<PlanManagerState>({
    drawings: [],
    listLoading: false,
    listError: null,
    selected: null,
    detailLoading: false,
    viewer: DEFAULT_VIEWER,
    annotations: new Map(),
    dirtyPages: new Set(),
    saving: false,
    saveError: null,
    uploading: false,
    uploadProgress: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // ── List ──────────────────────────────────────────────────────────────────
  const loadDrawings = useCallback(async (status: 'active' | 'archived' = 'active') => {
    setState(s => ({ ...s, listLoading: true, listError: null }));
    try {
      const res = await fetch(`/api/plan-manager/drawings?status=${status}`, { credentials: 'include' });
      const data = await res.json() as { drawings?: Drawing[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setState(s => ({ ...s, drawings: data.drawings ?? [], listLoading: false }));
    } catch (err) {
      setState(s => ({ ...s, listLoading: false, listError: String(err) }));
    }
  }, []);

  // ── Detail ────────────────────────────────────────────────────────────────
  const loadDrawing = useCallback(async (id: number) => {
    setState(s => ({ ...s, detailLoading: true, annotations: new Map(), dirtyPages: new Set(), viewer: DEFAULT_VIEWER }));
    try {
      const res = await fetch(`/api/plan-manager/drawings/${id}`, { credentials: 'include' });
      const data = await res.json() as DrawingDetail & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load drawing');
      setState(s => ({
        ...s,
        selected: data,
        detailLoading: false,
        viewer: { ...DEFAULT_VIEWER, totalPages: data.drawing.page_count || 1 },
      }));
    } catch {
      setState(s => ({ ...s, detailLoading: false }));
    }
  }, []);

  const closeDrawing = useCallback(() => {
    setState(s => ({ ...s, selected: null, annotations: new Map(), dirtyPages: new Set(), viewer: DEFAULT_VIEWER }));
  }, []);

  // ── Annotations ───────────────────────────────────────────────────────────
  const loadPageAnnotations = useCallback(async (drawingId: number, pageNo: number, revisionId?: number) => {
    const qs = revisionId ? `?revisionId=${revisionId}` : '';
    try {
      const res = await fetch(`/api/plan-manager/drawings/${drawingId}/pages/${pageNo}/annotations${qs}`, { credentials: 'include' });
      const data = await res.json() as { annotations?: Array<Record<string, unknown>>; error?: string };
      if (!res.ok) return;
      const anns: Annotation[] = (data.annotations ?? []).map((a) => ({
        id: String(a.id),
        dbId: a.id as number,
        type: a.type as Annotation['type'],
        pageNo: a.page_no as number,
        geometry: JSON.parse(String(a.geometry_json ?? '{}')),
        style: JSON.parse(String(a.style_json ?? '{}')),
        label: a.label as string | undefined,
        authorId: a.author_id as string | undefined,
        createdAt: a.created_at as string | undefined,
        isLocked: Boolean(a.is_locked),
      }));
      setState(s => {
        const next = new Map(s.annotations);
        next.set(pageNo, anns);
        return { ...s, annotations: next };
      });
    } catch { /* silent */ }
  }, []);

  const setPageAnnotations = useCallback((pageNo: number, anns: Annotation[]) => {
    setState(s => {
      const next = new Map(s.annotations);
      next.set(pageNo, anns);
      const dirty = new Set(s.dirtyPages);
      dirty.add(pageNo);
      return { ...s, annotations: next, dirtyPages: dirty };
    });
  }, []);

  const saveAnnotations = useCallback(async () => {
    const { selected, annotations, dirtyPages } = stateRef.current;
    if (!selected || dirtyPages.size === 0) return;
    const revisionId = selected.drawing.current_revision_id;
    if (!revisionId) return;
    setState(s => ({ ...s, saving: true, saveError: null }));
    try {
      for (const pageNo of dirtyPages) {
        const anns = annotations.get(pageNo) ?? [];
        const payload = anns.map(a => ({
          id: a.dbId,
          type: a.type,
          geometry_json: JSON.stringify(a.geometry),
          style_json: JSON.stringify(a.style),
          label: a.label,
          page_no: a.pageNo,
        }));
        const res = await fetch(`/api/plan-manager/drawings/${selected.drawing.id}/annotations`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pageNo, revisionId, annotations: payload }),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error ?? 'Save failed');
        }
      }
      setState(s => ({ ...s, saving: false, dirtyPages: new Set() }));
    } catch (err) {
      setState(s => ({ ...s, saving: false, saveError: String(err) }));
    }
  }, []);

  // ── Viewer controls ───────────────────────────────────────────────────────
  const setPage = useCallback((page: number) => {
    setState(s => ({ ...s, viewer: { ...s.viewer, currentPage: Math.max(1, Math.min(page, s.viewer.totalPages)) } }));
  }, []);

  const setScale = useCallback((scale: number) => {
    setState(s => ({ ...s, viewer: { ...s.viewer, scale: Math.max(0.25, Math.min(4, scale)), fitWidth: false } }));
  }, []);

  const rotate = useCallback((delta: 90 | -90) => {
    setState(s => ({ ...s, viewer: { ...s.viewer, rotation: ((s.viewer.rotation + delta + 360) % 360) as 0 | 90 | 180 | 270 } }));
  }, []);

  const setFitWidth = useCallback((fit: boolean) => {
    setState(s => ({ ...s, viewer: { ...s.viewer, fitWidth: fit } }));
  }, []);

  const setTotalPages = useCallback((n: number) => {
    setState(s => ({ ...s, viewer: { ...s.viewer, totalPages: n } }));
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadPdf = useCallback(async (drawingId: number, file: File): Promise<{ url: string } | { error: string }> => {
    setState(s => ({ ...s, uploading: true, uploadProgress: 0 }));
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/plan-manager/drawings/${drawingId}/upload`, { method: 'POST', credentials: 'include', body: form });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setState(s => ({ ...s, uploading: false, uploadProgress: 100 }));
      return { url: data.url! };
    } catch (err) {
      setState(s => ({ ...s, uploading: false }));
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  // ── Revisions ─────────────────────────────────────────────────────────────
  const createRevision = useCallback(async (drawingId: number, name?: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/plan-manager/drawings/${drawingId}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return false;
      await loadDrawing(drawingId);
      return true;
    } catch { return false; }
  }, [loadDrawing]);

  const lockRevision = useCallback(async (drawingId: number, revisionId: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/plan-manager/drawings/${drawingId}/revisions/${revisionId}/finalize`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      await loadDrawing(drawingId);
      return true;
    } catch { return false; }
  }, [loadDrawing]);

  // ── Share ─────────────────────────────────────────────────────────────────
  const createShareToken = useCallback(async (drawingId: number, revisionId?: number, expiryDays = 30): Promise<{ token: string; url: string; expiresAt: string } | null> => {
    try {
      const res = await fetch('/api/plan-manager/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ drawingId, revisionId, expiryDays }),
      });
      const data = await res.json() as { token?: string; url?: string; expiresAt?: string; error?: string };
      if (!res.ok) return null;
      return { token: data.token!, url: data.url!, expiresAt: data.expiresAt! };
    } catch { return null; }
  }, []);

  return {
    state,
    loadDrawings,
    loadDrawing,
    closeDrawing,
    loadPageAnnotations,
    setPageAnnotations,
    saveAnnotations,
    setPage,
    setScale,
    rotate,
    setFitWidth,
    setTotalPages,
    uploadPdf,
    createRevision,
    lockRevision,
    createShareToken,
  };
}

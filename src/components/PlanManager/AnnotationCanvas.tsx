/**
 * AnnotationCanvas — SVG overlay rendered on top of the PDF page.
 * Handles drawing, selecting, undo, and displaying all annotation types.
 *
 * Coordinate system: the SVG viewBox matches the raw (unscaled) page dimensions.
 * Pointer events are divided by `scale` to convert from screen px → page px.
 * The SVG element itself is sized to `width × height` (scaled px) via CSS,
 * so the browser handles the scale transform — we never double-apply it.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import type React from 'react';
import type { Annotation, AnnotationGeometry, AnnotationStyle, ToolType, Point } from './types';

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

interface Props {
  pageNo: number;
  width: number;       // scaled px (CSS size of the SVG element)
  height: number;      // scaled px
  scale: number;
  annotations: Annotation[];
  activeTool: ToolType;
  activeStyle: AnnotationStyle;
  isLocked: boolean;
  onAnnotationsChange: (anns: Annotation[]) => void;
  onUndoAvailableChange?: (available: boolean) => void;
  externalUndo?: number; // increment to trigger undo from outside
}

// ── Render a single annotation ────────────────────────────────────────────────
function renderAnnotation(ann: Annotation, isSelected: boolean, onClick: (e: React.MouseEvent) => void) {
  const s = ann.style;
  const color = s.color ?? '#ef4444';
  const sw = s.strokeWidth ?? 2;
  const opacity = s.opacity ?? 1;
  const fill = s.fillColor ?? 'none';
  const fillOp = s.fillOpacity ?? 0.15;
  const g = ann.geometry;

  const baseProps = {
    key: ann.id,
    onClick,
    style: { cursor: 'pointer' } as React.CSSProperties,
    opacity,
  };

  const selectionRing: React.CSSProperties = isSelected
    ? { filter: 'drop-shadow(0 0 3px #3b82f6)' }
    : {};

  switch (ann.type) {
    case 'line':
    case 'arrow': {
      const markerId = `arrow-${ann.id}`;
      return (
        <g key={ann.id} style={selectionRing}>
          {ann.type === 'arrow' && (
            <defs>
              <marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={color} />
              </marker>
            </defs>
          )}
          <line
            {...baseProps}
            x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
            stroke={color} strokeWidth={sw}
            markerEnd={ann.type === 'arrow' ? `url(#${markerId})` : undefined}
          />
        </g>
      );
    }
    case 'rect':
      return (
        <rect
          {...baseProps}
          x={g.x} y={g.y} width={g.width} height={g.height}
          stroke={color} strokeWidth={sw}
          fill={fill === 'none' ? 'none' : fill}
          fillOpacity={fill === 'none' ? 0 : fillOp}
          style={{ ...baseProps.style, ...selectionRing }}
        />
      );
    case 'circle':
      return (
        <ellipse
          {...baseProps}
          cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry}
          stroke={color} strokeWidth={sw}
          fill={fill === 'none' ? 'none' : fill}
          fillOpacity={fill === 'none' ? 0 : fillOp}
          style={{ ...baseProps.style, ...selectionRing }}
        />
      );
    case 'freehand': {
      if (!g.points?.length) return null;
      const d = g.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      return (
        <path
          {...baseProps}
          d={d} stroke={color} strokeWidth={sw} fill="none"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ ...baseProps.style, ...selectionRing }}
        />
      );
    }
    case 'highlight': {
      return (
        <rect
          {...baseProps}
          x={g.x} y={g.y} width={g.width} height={g.height}
          fill={color} fillOpacity={0.3} stroke="none"
          style={{ ...baseProps.style, ...selectionRing }}
        />
      );
    }
    case 'text':
    case 'stamp': {
      const fontSize = s.fontSize ?? 14;
      const label = ann.label ?? (ann.type === 'stamp' ? (s.stampTemplate ?? 'STAMP') : 'Text');
      return (
        <g key={ann.id} style={{ ...selectionRing, cursor: 'pointer' }} onClick={onClick}>
          {ann.type === 'stamp' && (
            <rect
              x={(g.tx ?? 0) - 4} y={(g.ty ?? 0) - fontSize}
              width={label.length * fontSize * 0.6 + 8} height={fontSize + 8}
              fill="none" stroke={color} strokeWidth={1.5} rx={3}
            />
          )}
          <text
            x={g.tx} y={g.ty}
            fill={color} fontSize={fontSize}
            fontWeight={s.fontWeight ?? 'normal'}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {label}
          </text>
        </g>
      );
    }
    case 'dimension': {
      const midX = ((g.x1 ?? 0) + (g.x2 ?? 0)) / 2 + (g.labelOffsetX ?? 0);
      const midY = ((g.y1 ?? 0) + (g.y2 ?? 0)) / 2 + (g.labelOffsetY ?? -10);
      return (
        <g key={ann.id} style={selectionRing} onClick={onClick}>
          <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={color} strokeWidth={sw} />
          <text x={midX} y={midY} fill={color} fontSize={12} textAnchor="middle" style={{ userSelect: 'none' }}>
            {ann.label ?? ''}
          </text>
        </g>
      );
    }
    default:
      return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnnotationCanvas({
  pageNo, width, height, scale, annotations, activeTool, activeStyle, isLocked,
  onAnnotationsChange, onUndoAvailableChange, externalUndo,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState<Partial<Annotation> | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<Point[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Undo history: each entry is the full annotations array before a change
  const historyRef = useRef<Annotation[][]>([]);

  const isDrawingTool = activeTool !== 'select' && activeTool !== 'pan';

  // Unscaled page dimensions for the viewBox
  const pageW = width / scale;
  const pageH = height / scale;

  // Convert screen coords → unscaled SVG/page coords.
  //
  // We use getScreenCTM() + createSVGPoint() instead of getBoundingClientRect()
  // because getScreenCTM() accounts for the SVG's viewBox transform (which maps
  // the scaled CSS pixel space to the unscaled page coordinate space), as well as
  // any CSS transforms on ancestor elements. This means we never need to manually
  // divide by `scale` — the CTM already encodes that mapping.
  const getSvgPoint = useCallback((e: React.MouseEvent | React.PointerEvent): Point => {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      // Fallback: manual calculation if CTM is unavailable
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      };
    }
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, [scale]);

  // Push current state onto undo stack before mutating
  const pushHistory = useCallback((current: Annotation[]) => {
    historyRef.current = [...historyRef.current.slice(-49), current];
    onUndoAvailableChange?.(true);
  }, [onUndoAvailableChange]);

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    onAnnotationsChange(prev);
    onUndoAvailableChange?.(historyRef.current.length > 0);
    setSelectedId(null);
  }, [onAnnotationsChange, onUndoAvailableChange]);

  // Respond to external undo trigger (toolbar button)
  const prevExternalUndo = useRef(externalUndo ?? 0);
  useEffect(() => {
    if (externalUndo !== undefined && externalUndo !== prevExternalUndo.current) {
      prevExternalUndo.current = externalUndo;
      handleUndo();
    }
  }, [externalUndo, handleUndo]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isLocked || !isDrawingTool) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getSvgPoint(e);
    setSelectedId(null);

    if (activeTool === 'freehand') {
      setFreehandPoints([pt]);
      setDrawing({ id: uid(), type: 'freehand', pageNo, style: activeStyle, geometry: { points: [pt] } });
      return;
    }
    if (activeTool === 'text' || activeTool === 'stamp') {
      const label = activeTool === 'stamp'
        ? (activeStyle.stampTemplate ?? 'STAMP')
        : 'Text';
      const newAnn: Annotation = {
        id: uid(), type: activeTool, pageNo,
        geometry: { tx: pt.x, ty: pt.y },
        style: activeStyle, label, isDirty: true,
      };
      pushHistory(annotations);
      onAnnotationsChange([...annotations, newAnn]);
      return;
    }
    // Shape tools: initialise with zero size at click point
    setDrawing({
      id: uid(),
      type: activeTool as Annotation['type'],
      pageNo,
      style: activeStyle,
      geometry: {
        x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y,
        x: pt.x, y: pt.y, width: 0, height: 0,
        cx: pt.x, cy: pt.y, rx: 0, ry: 0,
      },
    });
  }, [isLocked, isDrawingTool, activeTool, activeStyle, pageNo, annotations, onAnnotationsChange, getSvgPoint, pushHistory]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing) return;
    const pt = getSvgPoint(e);

    if (activeTool === 'freehand') {
      const pts = [...freehandPoints, pt];
      setFreehandPoints(pts);
      setDrawing(d => d ? { ...d, geometry: { points: pts } } : null);
      return;
    }

    const g = drawing.geometry!;
    let newGeom: AnnotationGeometry = { ...g };

    if (activeTool === 'line' || activeTool === 'arrow' || activeTool === 'dimension') {
      newGeom = { ...g, x2: pt.x, y2: pt.y };
    } else if (activeTool === 'rect' || activeTool === 'highlight') {
      const x = Math.min(g.x1!, pt.x);
      const y = Math.min(g.y1!, pt.y);
      newGeom = { ...g, x, y, width: Math.abs(pt.x - g.x1!), height: Math.abs(pt.y - g.y1!) };
    } else if (activeTool === 'circle') {
      // Draw ellipse from corner to corner (bounding box style)
      const dx = pt.x - g.x1!;
      const dy = pt.y - g.y1!;
      const rx = Math.abs(dx) / 2;
      const ry = Math.abs(dy) / 2;
      const cx = g.x1! + dx / 2;
      const cy = g.y1! + dy / 2;
      newGeom = { ...g, cx, cy, rx, ry };
    }
    setDrawing(d => d ? { ...d, geometry: newGeom } : null);
  }, [drawing, activeTool, freehandPoints, getSvgPoint]);

  const handlePointerUp = useCallback(() => {
    if (!drawing) return;
    const g = drawing.geometry!;

    const tooSmall = (
      ((activeTool === 'line' || activeTool === 'arrow' || activeTool === 'dimension') &&
        Math.hypot((g.x2! - g.x1!), (g.y2! - g.y1!)) < 5) ||
      ((activeTool === 'rect' || activeTool === 'highlight') &&
        (g.width! < 5 || g.height! < 5)) ||
      (activeTool === 'circle' && (g.rx! < 3 || g.ry! < 3)) ||
      (activeTool === 'freehand' && freehandPoints.length < 3)
    );

    if (!tooSmall) {
      pushHistory(annotations);
      const newAnn: Annotation = { ...(drawing as Annotation), isDirty: true };
      onAnnotationsChange([...annotations, newAnn]);
    }
    setDrawing(null);
    setFreehandPoints([]);
  }, [drawing, activeTool, freehandPoints, annotations, onAnnotationsChange, pushHistory]);

  const handleAnnotationClick = useCallback((e: React.MouseEvent, id: string) => {
    if (activeTool === 'select') {
      e.stopPropagation();
      setSelectedId(prev => prev === id ? null : id);
    }
  }, [activeTool]);

  const deleteSelected = useCallback(() => {
    if (!selectedId || isLocked) return;
    pushHistory(annotations);
    onAnnotationsChange(annotations.filter(a => a.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, isLocked, annotations, onAnnotationsChange, pushHistory]);

  // Keyboard shortcuts: Delete/Backspace = delete selected, Ctrl+Z = undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteSelected, handleUndo, selectedId]);

  const cursor = isLocked ? 'not-allowed'
    : activeTool === 'pan' ? 'grab'
    : activeTool === 'select' ? 'default'
    : 'crosshair';

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      // viewBox uses unscaled page dimensions — browser scales the SVG to fill width×height
      viewBox={`0 0 ${pageW} ${pageH}`}
      style={{ position: 'absolute', top: 0, left: 0, cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => activeTool === 'select' && setSelectedId(null)}
    >
      {/* Saved annotations */}
      {annotations.map(ann =>
        renderAnnotation(ann, ann.id === selectedId, (e) => handleAnnotationClick(e, ann.id))
      )}
      {/* In-progress drawing preview */}
      {drawing && renderAnnotation(drawing as Annotation, false, () => {})}
    </svg>
  );
}

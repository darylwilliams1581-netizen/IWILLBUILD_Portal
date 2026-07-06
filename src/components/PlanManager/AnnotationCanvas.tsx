/**
 * AnnotationCanvas — SVG overlay rendered on top of the PDF page.
 * Handles drawing, selecting, and displaying all annotation types.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { Annotation, AnnotationGeometry, AnnotationStyle, ToolType, Point } from './types';

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

interface Props {
  pageNo: number;
  width: number;
  height: number;
  scale: number;
  annotations: Annotation[];
  activeTool: ToolType;
  activeStyle: AnnotationStyle;
  isLocked: boolean;
  onAnnotationsChange: (anns: Annotation[]) => void;
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
    style: { cursor: 'pointer' },
    opacity,
  };

  const selectionRing = isSelected ? { filter: 'drop-shadow(0 0 3px #3b82f6)' } : {};

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
  pageNo, width, height, scale, annotations, activeTool, activeStyle, isLocked, onAnnotationsChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState<Partial<Annotation> | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<Point[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isDrawingTool = activeTool !== 'select' && activeTool !== 'pan';

  const getSvgPoint = useCallback((e: React.MouseEvent | React.PointerEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }, [scale]);

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
      onAnnotationsChange([...annotations, newAnn]);
      return;
    }
    setDrawing({ id: uid(), type: activeTool as Annotation['type'], pageNo, style: activeStyle, geometry: { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, x: pt.x, y: pt.y, width: 0, height: 0, cx: pt.x, cy: pt.y, rx: 0, ry: 0 } });
  }, [isLocked, isDrawingTool, activeTool, activeStyle, pageNo, annotations, onAnnotationsChange, getSvgPoint]);

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
      const rx = Math.abs(pt.x - g.x1!) / 2;
      const ry = Math.abs(pt.y - g.y1!) / 2;
      newGeom = { ...g, cx: g.x1! + (pt.x - g.x1!) / 2, cy: g.y1! + (pt.y - g.y1!) / 2, rx, ry };
    }
    setDrawing(d => d ? { ...d, geometry: newGeom } : null);
  }, [drawing, activeTool, freehandPoints, getSvgPoint]);

  const handlePointerUp = useCallback(() => {
    if (!drawing) return;
    const g = drawing.geometry!;
    // Discard tiny accidental marks
    const tooSmall = (
      (activeTool === 'line' || activeTool === 'arrow') && Math.hypot((g.x2! - g.x1!), (g.y2! - g.y1!)) < 5 ||
      (activeTool === 'rect' || activeTool === 'highlight') && (g.width! < 5 || g.height! < 5) ||
      (activeTool === 'circle') && (g.rx! < 3 || g.ry! < 3) ||
      (activeTool === 'freehand') && freehandPoints.length < 3
    );
    if (!tooSmall) {
      const newAnn: Annotation = { ...(drawing as Annotation), isDirty: true };
      onAnnotationsChange([...annotations, newAnn]);
    }
    setDrawing(null);
    setFreehandPoints([]);
  }, [drawing, activeTool, freehandPoints, annotations, onAnnotationsChange]);

  const handleAnnotationClick = useCallback((e: React.MouseEvent, id: string) => {
    if (activeTool === 'select') {
      e.stopPropagation();
      setSelectedId(prev => prev === id ? null : id);
    }
  }, [activeTool]);

  const deleteSelected = useCallback(() => {
    if (!selectedId || isLocked) return;
    onAnnotationsChange(annotations.filter(a => a.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, isLocked, annotations, onAnnotationsChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteSelected, selectedId]);

  const cursor = isLocked ? 'not-allowed'
    : activeTool === 'pan' ? 'grab'
    : activeTool === 'select' ? 'default'
    : 'crosshair';

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width / scale} ${height / scale}`}
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
      {/* In-progress drawing */}
      {drawing && renderAnnotation(drawing as Annotation, false, () => {})}
    </svg>
  );
}

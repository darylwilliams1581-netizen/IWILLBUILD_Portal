import { ShieldCheck } from 'lucide-react';
import type { SafetyBadgeRowBlock, SafetyBadgeType } from '../types';

interface Props {
  block: SafetyBadgeRowBlock;
  columnsBlockId?: string;
  columnId?: string;
}

// ── SVG icon paths — white silhouettes matching the reference poster style ────
const BADGE_SVG: Record<SafetyBadgeType, React.ReactNode> = {
  ppe: (
    // Shield with "PPE" text
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M32 6L10 16v16c0 12.5 9.5 24.2 22 27 12.5-2.8 22-14.5 22-27V16L32 6z" fill="white"/>
      <text x="32" y="38" textAnchor="middle" fontSize="13" fontWeight="900" fontFamily="Arial,sans-serif" fill="#1a1a1a" letterSpacing="0.5">PPE</text>
    </svg>
  ),
  helmet: (
    // Hard hat silhouette
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M32 10C20 10 12 19 12 28h4v4h32v-4h4c0-9-8-18-20-18z" fill="white"/>
      <rect x="10" y="32" width="44" height="6" rx="2" fill="white"/>
      <rect x="18" y="38" width="28" height="4" rx="1" fill="white"/>
    </svg>
  ),
  footwear: (
    // Boot silhouette
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M16 14h8v22l10 4h14v6H12V30l4-4V14z" fill="white"/>
      <rect x="12" y="46" width="40" height="6" rx="2" fill="white"/>
      <path d="M24 14h16v8H24z" fill="white"/>
    </svg>
  ),
  eye_protection: (
    // Safety glasses / goggles
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Face outline */}
      <ellipse cx="32" cy="28" rx="14" ry="18" fill="white"/>
      {/* Goggles */}
      <rect x="10" y="30" width="18" height="10" rx="4" fill="#1a1a1a" stroke="white" strokeWidth="2"/>
      <rect x="36" y="30" width="18" height="10" rx="4" fill="#1a1a1a" stroke="white" strokeWidth="2"/>
      <line x1="28" y1="35" x2="36" y2="35" stroke="white" strokeWidth="2"/>
      <line x1="10" y1="35" x2="6" y2="33" stroke="white" strokeWidth="2"/>
      <line x1="54" y1="35" x2="58" y2="33" stroke="white" strokeWidth="2"/>
    </svg>
  ),
  gloves: (
    // Work glove
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M20 48V28l-4-2V18a3 3 0 016 0v8h2V14a3 3 0 016 0v12h2V16a3 3 0 016 0v10h2V20a3 3 0 016 0v28c0 4-3 8-8 8H28c-5 0-8-4-8-8z" fill="white"/>
    </svg>
  ),
  electrical_gloves: (
    // Glove with lightning bolt
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M20 48V28l-4-2V18a3 3 0 016 0v8h2V14a3 3 0 016 0v12h2V16a3 3 0 016 0v10h2V20a3 3 0 016 0v28c0 4-3 8-8 8H28c-5 0-8-4-8-8z" fill="white"/>
      <path d="M35 26l-5 9h4l-3 9 8-12h-5l4-6h-3z" fill="#1a1a1a"/>
    </svg>
  ),
  hearing: (
    // Ear muffs / headphones
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M32 14C20 14 11 23 11 35v4a7 7 0 0014 0v-8a7 7 0 00-7-7 19 19 0 0128 0 7 7 0 00-7 7v8a7 7 0 0014 0v-4c0-12-9-21-21-21z" fill="white"/>
    </svg>
  ),
  hi_vis: (
    // Hi-vis vest
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M8 14l12 8v30H8V14zM56 14l-12 8v30h12V14zM20 22h24v30H20z" fill="white"/>
      <rect x="20" y="34" width="24" height="4" fill="#1a1a1a"/>
      <rect x="20" y="42" width="24" height="4" fill="#1a1a1a"/>
      <path d="M20 22l-8-8h8M44 22l8-8h-8" fill="white"/>
    </svg>
  ),
  fall_arrest: (
    // Harness / fall arrest
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Body */}
      <ellipse cx="32" cy="18" rx="8" ry="8" fill="white"/>
      {/* Harness straps */}
      <path d="M24 26l-8 16h6l4 14h12l4-14h6l-8-16" fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M26 26l6 8 6-8" fill="none" stroke="white" strokeWidth="3"/>
      <path d="M20 42h24" stroke="white" strokeWidth="3"/>
      {/* Carabiner */}
      <circle cx="32" cy="10" r="3" stroke="white" strokeWidth="2" fill="none"/>
      <line x1="32" y1="7" x2="32" y2="4" stroke="white" strokeWidth="2"/>
    </svg>
  ),
  custom: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M32 6L10 16v16c0 12.5 9.5 24.2 22 27 12.5-2.8 22-14.5 22-27V16L32 6z" fill="white"/>
    </svg>
  ),
};

// Label text shown below / curved around the badge
const BADGE_LABELS: Record<SafetyBadgeType, { top: string; bottom: string }> = {
  ppe:               { top: 'PERSONAL',              bottom: 'PROTECTIVE EQUIPMENT' },
  helmet:            { top: 'SAFETY',                bottom: 'HELMET' },
  footwear:          { top: 'SAFETY',                bottom: 'FOOTWEAR' },
  eye_protection:    { top: 'EYE',                   bottom: 'PROTECTION' },
  gloves:            { top: 'GENERAL PURPOSE',       bottom: 'GLOVES' },
  electrical_gloves: { top: 'ELECTRICAL',            bottom: 'GLOVES' },
  hearing:           { top: 'HEARING',               bottom: 'PROTECTION' },
  hi_vis:            { top: 'HI-VIS',                bottom: 'CLOTHING' },
  fall_arrest:       { top: 'FALL ARREST',           bottom: 'HARNESS & ACCESSORIES' },
  custom:            { top: '',                      bottom: 'CUSTOM' },
};

const SIZE_MAP = {
  sm: { circle: 56,  iconPad: 14, fontSize: 6.5,  gap: 'gap-2' },
  md: { circle: 72,  iconPad: 18, fontSize: 7.5,  gap: 'gap-3' },
  lg: { circle: 92,  iconPad: 22, fontSize: 9,    gap: 'gap-4' },
};

/** Renders a single badge as a black circle with white SVG icon + red curved label text */
function BadgeCircle({
  badge,
  size,
}: {
  badge: SafetyBadgeRowBlock['badges'][number];
  size: 'sm' | 'md' | 'lg';
}) {
  const s = SIZE_MAP[size] ?? SIZE_MAP.md;
  const r = s.circle / 2;
  const cx = r;
  const cy = r;
  const labelR = r - 4; // radius for curved text path
  const fs = s.fontSize;

  // Arc paths for top and bottom curved text
  const topArcId = `top-${badge.id}`;
  const botArcId = `bot-${badge.id}`;

  // Top arc: left→right along top of circle
  const topArc = `M ${cx - labelR * 0.85} ${cy - labelR * 0.53} A ${labelR} ${labelR} 0 0 1 ${cx + labelR * 0.85} ${cy - labelR * 0.53}`;
  // Bottom arc: left→right along bottom of circle
  const botArc = `M ${cx - labelR * 0.85} ${cy + labelR * 0.53} A ${labelR} ${labelR} 0 0 0 ${cx + labelR * 0.85} ${cy + labelR * 0.53}`;

  const iconSize = s.circle - s.iconPad * 2;
  const iconOffset = s.iconPad;

  const defaultLabels = BADGE_LABELS[badge.badgeType] ?? { top: '', bottom: badge.label };
  const topLabel = defaultLabels.top;
  const botLabel = defaultLabels.bottom;

  return (
    <div className="flex flex-col items-center" style={{ gap: 4 }}>
      <svg
        width={s.circle}
        height={s.circle}
        viewBox={`0 0 ${s.circle} ${s.circle}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', flexShrink: 0 }}
      >
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={r - 1} fill="#1a1a1a" stroke="#cc0000" strokeWidth="2" />

        {/* Curved text paths */}
        <defs>
          <path id={topArcId} d={topArc} />
          <path id={botArcId} d={botArc} />
        </defs>

        {/* Top label (red, curved) */}
        {topLabel && (
          <text
            fontSize={fs}
            fontWeight="700"
            fontFamily="Arial,Helvetica,sans-serif"
            fill="#cc0000"
            letterSpacing="0.8"
          >
            <textPath href={`#${topArcId}`} startOffset="50%" textAnchor="middle">
              {topLabel}
            </textPath>
          </text>
        )}

        {/* Bottom label (red, curved) */}
        {botLabel && (
          <text
            fontSize={fs}
            fontWeight="700"
            fontFamily="Arial,Helvetica,sans-serif"
            fill="#cc0000"
            letterSpacing="0.8"
          >
            <textPath href={`#${botArcId}`} startOffset="50%" textAnchor="middle">
              {botLabel}
            </textPath>
          </text>
        )}

        {/* White icon centred in circle */}
        <foreignObject x={iconOffset} y={iconOffset} width={iconSize} height={iconSize}>
          <div
            // @ts-expect-error xmlns needed for SVG foreignObject
            xmlns="http://www.w3.org/1999/xhtml"
            style={{ width: iconSize, height: iconSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {badge.customImageUrl ? (
              <img
                src={badge.customImageUrl}
                alt={badge.label}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              BADGE_SVG[badge.badgeType] ?? BADGE_SVG.custom
            )}
          </div>
        </foreignObject>

        {/* Required indicator — red arc band at bottom */}
        {badge.required && (
          <>
            <path
              d={`M ${cx - r + 3} ${cy + r * 0.55} A ${r - 3} ${r - 3} 0 0 0 ${cx + r - 3} ${cy + r * 0.55}`}
              fill="#cc0000"
              opacity="0.9"
            />
            <text
              x={cx}
              y={cy + r * 0.72}
              textAnchor="middle"
              fontSize={fs * 0.9}
              fontWeight="800"
              fontFamily="Arial,Helvetica,sans-serif"
              fill="white"
              letterSpacing="1"
            >
              REQUIRED
            </text>
          </>
        )}
      </svg>

      {/* Plain label below for accessibility / fallback */}
      <span
        style={{
          fontSize: fs + 1,
          fontWeight: 700,
          color: '#1a1a1a',
          textAlign: 'center',
          maxWidth: s.circle,
          lineHeight: 1.2,
          fontFamily: 'Arial,Helvetica,sans-serif',
        }}
      >
        {badge.label}
      </span>
    </div>
  );
}

export default function SafetyBadgeRowView({ block }: Props) {
  const s = SIZE_MAP[block.size] ?? SIZE_MAP.md;
  const alignClass =
    block.align === 'center' ? 'justify-center'
    : block.align === 'right' ? 'justify-end'
    : 'justify-start';

  return (
    <div className={`flex flex-wrap py-2 ${s.gap} ${alignClass}`}>
      {block.badges.map((badge) => (
        <BadgeCircle key={badge.id} badge={badge} size={block.size} />
      ))}
      {block.badges.length === 0 && (
        <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
          <ShieldCheck size={14} />
          <span>No safety badges added</span>
        </div>
      )}
    </div>
  );
}

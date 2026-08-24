/**
 * PowCalendarView — Gantt-style calendar view for Program of Works.
 * Shows activities as horizontal bars across a monthly timeline.
 * Activities without dates are listed below the chart.
 */
import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { ProgressSection, ProgressActivity } from '@/lib/pow-types';

interface Props {
  sections: ProgressSection[];
  activities: ProgressActivity[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const s = d.slice(0, 10);
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

const PCT_COLORS: Record<string, string> = {
  done:    'bg-emerald-500',
  high:    'bg-primary',
  mid:     'bg-primary/70',
  low:     'bg-primary/40',
  none:    'bg-muted-foreground/30',
};

function pctColor(pct: number): string {
  if (pct === 100) return PCT_COLORS.done;
  if (pct >= 75)  return PCT_COLORS.high;
  if (pct >= 40)  return PCT_COLORS.mid;
  if (pct > 0)    return PCT_COLORS.low;
  return PCT_COLORS.none;
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function PowCalendarView({ sections, activities }: Props) {
  // Seed the view on the earliest start date, or today
  const seedDate = useMemo(() => {
    const starts = activities
      .map((a) => parseDate(a.startDate))
      .filter((d): d is Date => d !== null);
    if (starts.length === 0) return new Date();
    return starts.reduce((a, b) => (a < b ? a : b));
  }, [activities]);

  const [viewYear, setViewYear] = useState(seedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(seedDate.getMonth());
  const [hovered, setHovered] = useState<number | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun

  // Activities that have at least a start date
  const datedActivities = activities.filter((a) => a.startDate);
  const undatedActivities = activities.filter((a) => !a.startDate);

  // Section title lookup
  const sectionMap = useMemo(() => {
    const m: Record<number, string> = {};
    sections.forEach((s) => { m[s.id] = s.title; });
    return m;
  }, [sections]);

  function prevMonth() {
    const { year, month } = addMonths(viewYear, viewMonth, -1);
    setViewYear(year); setViewMonth(month);
  }
  function nextMonth() {
    const { year, month } = addMonths(viewYear, viewMonth, 1);
    setViewYear(year); setViewMonth(month);
  }
  function goToday() {
    setViewYear(today.getFullYear()); setViewMonth(today.getMonth());
  }

  // ── Gantt bar calculation ─────────────────────────────────────────────────

  function barForActivity(a: ProgressActivity): { startCol: number; span: number } | null {
    const start = parseDate(a.startDate);
    if (!start) return null;
    const end = parseDate(a.endDate) ?? start;

    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd   = new Date(viewYear, viewMonth, totalDays);

    // Clip to this month
    const clippedStart = start < monthStart ? monthStart : start;
    const clippedEnd   = end   > monthEnd   ? monthEnd   : end;

    if (clippedStart > monthEnd || clippedEnd < monthStart) return null; // outside month

    const startCol = clippedStart.getDate(); // 1-based day
    const span     = clippedEnd.getDate() - clippedStart.getDate() + 1;
    return { startCol, span };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-bold text-foreground min-w-[140px] text-center">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
        <button
          onClick={goToday}
          className="px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors"
        >
          Today
        </button>
      </div>

      {/* ── Gantt grid ── */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <div style={{ minWidth: `${totalDays * 32 + 200}px` }}>

          {/* Day header */}
          <div
            className="grid bg-muted/30 border-b border-border"
            style={{ gridTemplateColumns: `200px repeat(${totalDays}, 32px)` }}
          >
            <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-r border-border">
              Activity
            </div>
            {Array.from({ length: totalDays }, (_, i) => {
              const d = new Date(viewYear, viewMonth, i + 1);
              const isToday = d.getTime() === today.getTime();
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center justify-center py-1 border-r border-border/50 text-[9px] leading-tight
                    ${isToday ? 'bg-primary/10 font-bold text-primary' : isWeekend ? 'bg-muted/40 text-muted-foreground' : 'text-muted-foreground'}`}
                >
                  <span>{DAY_LABELS[d.getDay()]}</span>
                  <span className={`font-semibold ${isToday ? 'text-primary' : ''}`}>{i + 1}</span>
                </div>
              );
            })}
          </div>

          {/* Activity rows — grouped by section */}
          {datedActivities.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <CalendarDays size={16} className="mr-2" />
              No activities with dates to display
            </div>
          ) : (
            <>
              {/* Render sections in order, then unsectioned */}
              {[...sections.map((s) => ({ id: s.id, title: s.title })), { id: null as number | null, title: 'Unsectioned' }].map(({ id: sId, title: sTitle }) => {
                const sectionRows = datedActivities.filter((a) =>
                  sId === null ? a.sectionId == null : a.sectionId === sId
                );
                if (sectionRows.length === 0) return null;
                return (
                  <div key={sId ?? 'unsectioned'}>
                    {/* Section label row */}
                    <div
                      className="grid bg-muted/20 border-b border-border"
                      style={{ gridTemplateColumns: `200px repeat(${totalDays}, 32px)` }}
                    >
                      <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wide border-r border-border truncate">
                        {sTitle}
                      </div>
                      {Array.from({ length: totalDays }, (_, i) => {
                        const d = new Date(viewYear, viewMonth, i + 1);
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div key={i} className={`border-r border-border/30 ${isWeekend ? 'bg-muted/20' : ''}`} />
                        );
                      })}
                    </div>

                    {/* Activity rows */}
                    {sectionRows.map((a, rowIdx) => {
                      const bar = barForActivity(a);
                      const isHovered = hovered === a.id;
                      const isEven = rowIdx % 2 === 0;
                      return (
                        <div
                          key={a.id}
                          className={`grid border-b border-border/50 relative transition-colors
                            ${isEven ? 'bg-background' : 'bg-muted/10'}
                            ${isHovered ? 'bg-primary/5' : ''}`}
                          style={{ gridTemplateColumns: `200px repeat(${totalDays}, 32px)` }}
                          onMouseEnter={() => setHovered(a.id)}
                          onMouseLeave={() => setHovered(null)}
                        >
                          {/* Label cell */}
                          <div className="px-3 py-2 border-r border-border flex items-center gap-1.5 min-w-0">
                            <span className="text-xs text-foreground truncate" title={a.description}>
                              {a.description}
                            </span>
                          </div>

                          {/* Day cells + bar overlay */}
                          {Array.from({ length: totalDays }, (_, i) => {
                            const d = new Date(viewYear, viewMonth, i + 1);
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            const isToday = d.getTime() === today.getTime();
                            return (
                              <div
                                key={i}
                                className={`relative border-r border-border/30 h-9
                                  ${isWeekend ? 'bg-muted/10' : ''}
                                  ${isToday ? 'bg-primary/5' : ''}`}
                              />
                            );
                          })}

                          {/* Gantt bar — absolutely positioned over the grid */}
                          {bar && (
                            <div
                              className="absolute top-1.5 bottom-1.5 rounded-md flex items-center px-1.5 overflow-hidden group"
                              style={{
                                left:  `calc(200px + ${(bar.startCol - 1) * 32}px + 3px)`,
                                width: `calc(${bar.span * 32}px - 6px)`,
                              }}
                            >
                              {/* Background track */}
                              <div className={`absolute inset-0 rounded-md opacity-20 ${pctColor(a.percentComplete)}`} />
                              {/* Fill */}
                              <div
                                className={`absolute inset-y-0 left-0 rounded-md ${pctColor(a.percentComplete)}`}
                                style={{ width: `${a.percentComplete}%` }}
                              />
                              {/* Label */}
                              <span className="relative z-10 text-[10px] font-semibold text-white drop-shadow-sm truncate leading-none">
                                {a.percentComplete > 0 ? `${a.percentComplete}%` : ''}
                              </span>
                            </div>
                          )}

                          {/* Tooltip on hover */}
                          {isHovered && (
                            <div className="absolute left-[210px] top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs min-w-[200px] max-w-[280px] pointer-events-none">
                              <p className="font-semibold text-foreground mb-1 leading-snug">{a.description}</p>
                              {a.sectionId && sectionMap[a.sectionId] && (
                                <p className="text-muted-foreground">Section: {sectionMap[a.sectionId]}</p>
                              )}
                              <p className="text-muted-foreground">
                                {a.startDate ? fmtShort(parseDate(a.startDate)!) : '—'}
                                {' → '}
                                {a.endDate ? fmtShort(parseDate(a.endDate)!) : 'ongoing'}
                              </p>
                              <p className={`font-bold mt-0.5 ${a.percentComplete === 100 ? 'text-emerald-600' : 'text-primary'}`}>
                                {a.percentComplete}% complete
                              </p>
                              {a.progressNote && <p className="text-muted-foreground mt-1 italic">{a.progressNote}</p>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Undated activities ── */}
      {undatedActivities.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 bg-muted/20 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Activities without dates ({undatedActivities.length})
            </span>
          </div>
          <div className="divide-y divide-border">
            {undatedActivities.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-xs text-foreground flex-1 truncate">{a.description}</span>
                {a.sectionId && sectionMap[a.sectionId] && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                    {sectionMap[a.sectionId]}
                  </span>
                )}
                <span className={`text-xs font-semibold shrink-0 ${a.percentComplete === 100 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {a.percentComplete}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 flex-wrap text-[10px] text-muted-foreground">
        <span className="font-semibold">Legend:</span>
        {[
          { label: 'Complete (100%)', cls: 'bg-emerald-500' },
          { label: '75–99%',          cls: 'bg-primary' },
          { label: '40–74%',          cls: 'bg-primary/70' },
          { label: '1–39%',           cls: 'bg-primary/40' },
          { label: 'Not started',     cls: 'bg-muted-foreground/30' },
        ].map(({ label, cls }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm ${cls}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

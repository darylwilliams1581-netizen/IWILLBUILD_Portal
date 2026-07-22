// ── Seasonal skin engine ──────────────────────────────────────────────────────
// Australian-focused seasonal events. No copyrighted artwork — text only.

export interface SeasonalEvent {
  id: string;
  name: string;
  startMonth: number; // 1-based
  startDay: number;
  endMonth: number;
  endDay: number;
  priority: number;
  accentColor: string;
  secondaryColor: string;
  bannerTitle: string;
  bannerMessage: string;
  icon: string; // emoji-free: use a lucide icon name string
  themeClass: string;
}

export const SEASONAL_EVENTS: SeasonalEvent[] = [
  {
    id: 'new-year',
    name: 'New Year',
    startMonth: 1, startDay: 1,
    endMonth: 1,   endDay: 1,
    priority: 8,
    accentColor: '#7c3aed',
    secondaryColor: '#a78bfa',
    bannerTitle: 'Happy New Year',
    bannerMessage: 'Wishing the whole team a safe and successful year ahead.',
    icon: 'Sparkles',
    themeClass: 'season-new-year',
  },
  {
    id: 'australia-day',
    name: 'Australia Day',
    startMonth: 1, startDay: 26,
    endMonth: 1,   endDay: 26,
    priority: 7,
    accentColor: '#1d4ed8',
    secondaryColor: '#fbbf24',
    bannerTitle: 'Australia Day',
    bannerMessage: 'Have a great day — stay safe on site.',
    icon: 'Sun',
    themeClass: 'season-australia-day',
  },
  {
    id: 'valentines',
    name: "Valentine's Day",
    startMonth: 2, startDay: 14,
    endMonth: 2,   endDay: 14,
    priority: 3,
    accentColor: '#be185d',
    secondaryColor: '#f9a8d4',
    bannerTitle: "Happy Valentine's Day",
    bannerMessage: 'From the whole IWILLBUILD team.',
    icon: 'Heart',
    themeClass: 'season-valentines',
  },
  {
    id: 'st-patricks',
    name: "St Patrick's Day",
    startMonth: 3, startDay: 17,
    endMonth: 3,   endDay: 17,
    priority: 3,
    accentColor: '#15803d',
    secondaryColor: '#86efac',
    bannerTitle: "Happy St Patrick's Day",
    bannerMessage: 'Luck of the Irish to the whole crew today.',
    icon: 'Clover',
    themeClass: 'season-st-patricks',
  },
  {
    id: 'anzac-day',
    name: 'ANZAC Day',
    startMonth: 4, startDay: 25,
    endMonth: 4,   endDay: 25,
    priority: 9,
    accentColor: '#92400e',
    secondaryColor: '#fcd34d',
    bannerTitle: 'Lest We Forget',
    bannerMessage: 'ANZAC Day — honouring all who served.',
    icon: 'Shield',
    themeClass: 'season-anzac',
  },
  {
    id: 'eofy',
    name: 'End of Financial Year',
    startMonth: 6, startDay: 20,
    endMonth: 6,   endDay: 30,
    priority: 6,
    accentColor: '#0369a1',
    secondaryColor: '#7dd3fc',
    bannerTitle: 'EOFY — Final Push',
    bannerMessage: 'End of financial year. Make sure all jobs and invoices are up to date.',
    icon: 'TrendingUp',
    themeClass: 'season-eofy',
  },
  {
    id: 'halloween',
    name: 'Halloween',
    startMonth: 10, startDay: 31,
    endMonth: 10,   endDay: 31,
    priority: 4,
    accentColor: '#c2410c',
    secondaryColor: '#fb923c',
    bannerTitle: 'Happy Halloween',
    bannerMessage: 'Stay safe on site — and watch out for hazards.',
    icon: 'Zap',
    themeClass: 'season-halloween',
  },
  {
    id: 'christmas',
    name: 'Christmas',
    startMonth: 12, startDay: 1,
    endMonth: 12,   endDay: 26,
    priority: 10,
    accentColor: '#15803d',
    secondaryColor: '#dc2626',
    bannerTitle: 'Merry Christmas',
    bannerMessage: 'Stay safe on site and enjoy the break.',
    icon: 'Gift',
    themeClass: 'season-christmas',
  },
];

/**
 * Returns the highest-priority seasonal event active on the given date,
 * or null if none match.
 */
export function getActiveSeasonalEvent(date: Date = new Date()): SeasonalEvent | null {
  const month = date.getMonth() + 1; // 1-based
  const day = date.getDate();

  const active = SEASONAL_EVENTS.filter((ev) => {
    // Same-month range
    if (ev.startMonth === ev.endMonth) {
      return month === ev.startMonth && day >= ev.startDay && day <= ev.endDay;
    }
    // Cross-month range (e.g. Dec 1 – Dec 26 is same month, but future-proof)
    if (month === ev.startMonth) return day >= ev.startDay;
    if (month === ev.endMonth)   return day <= ev.endDay;
    return month > ev.startMonth && month < ev.endMonth;
  });

  if (active.length === 0) return null;
  return active.sort((a, b) => b.priority - a.priority)[0];
}

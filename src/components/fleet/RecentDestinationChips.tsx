import { readRecentDestinations } from '@/lib/recent-destinations';

export default function RecentDestinationChips({ companyId, userId, onSelect }: {
  companyId: number; userId: string; onSelect: (destination: string) => void;
}) {
  // Resolve against the current owner on every render; never retain another
  // account's suggestions in component state during an account switch.
  const destinations = readRecentDestinations(companyId, userId);
  if (!destinations.length) return null;
  return <div role="group" aria-label="Recent destinations" className="mt-2 mb-2">
    <p className="text-xs text-slate-500 mb-1">Recent destinations — tap to use</p>
    <div className="flex flex-wrap gap-2">
      {destinations.map(destination => <button key={destination} type="button"
        onClick={() => onSelect(destination)}
        className="max-w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-left text-sm text-violet-800 break-words whitespace-normal hover:bg-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500">
        {destination}
      </button>)}
    </div>
  </div>;
}

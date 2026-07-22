import { Activity } from 'lucide-react';

interface ActivityEvent {
  id: number;
  userId: string;
  companyId: number;
  eventType: string;
  metadataJson: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function eventBadge(type: string): string {
  if (type === 'login_success' || type === 'login') return 'bg-emerald-50 text-emerald-700';
  if (type === 'logout') return 'bg-slate-100 text-slate-600';
  if (type.includes('fail') || type.includes('block')) return 'bg-red-50 text-red-600';
  return 'bg-blue-50 text-blue-600';
}

interface Props {
  activity: ActivityEvent[];
  filterCompanyName: string | null | undefined;
  onClearFilter: () => void;
}

export default function ActivityTab({ activity, filterCompanyName, onClearFilter }: Props) {
  return (
    <div className="max-w-4xl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">Activity Log</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {filterCompanyName ? (
                <span>Filtered: <span className="font-semibold text-slate-600">{filterCompanyName}</span> · <button onClick={onClearFilter} className="text-primary hover:underline">Clear</button></span>
              ) : `${activity.length} recent events`}
            </p>
          </div>
        </div>
        {activity.length === 0 ? (
          <div className="text-center py-16">
            <Activity size={28} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-400">No activity recorded yet</p>
            <p className="text-xs text-slate-300 mt-1">Events appear after the next user login</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activity.map((e) => (
              <div key={e.id} className="px-5 py-3.5 flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full shrink-0 ${e.eventType === 'login' ? 'bg-emerald-500' : e.eventType === 'logout' ? 'bg-slate-400' : 'bg-blue-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">{e.userName ?? e.userEmail ?? e.userId}</span>
                    {e.userEmail && e.userName && <span className="text-slate-400 ml-1 text-xs">({e.userEmail})</span>}
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${eventBadge(e.eventType)}`}>{e.eventType}</span>
                <span className="text-xs text-slate-400 shrink-0 w-24 text-right">{timeAgo(e.createdAt)}</span>
                <span className="text-[11px] text-slate-300 shrink-0 hidden lg:block">
                  {new Date(e.createdAt).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

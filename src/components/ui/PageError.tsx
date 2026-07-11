/**
 * PageError — reusable error state for portal pages.
 */
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface PageErrorProps {
  message?: string;
  onRetry?: () => void;
}

export default function PageError({ message = 'Something went wrong. Please try again.', onRetry }: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle size={24} className="text-red-500" />
      </div>
      <h3 className="text-base font-bold text-slate-700 mb-1">Failed to load</h3>
      <p className="text-sm text-slate-400 max-w-xs leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      )}
    </div>
  );
}

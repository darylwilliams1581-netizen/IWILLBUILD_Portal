/**
 * PageEmpty — reusable empty-state for portal pages.
 * Shows an icon, heading, description, and optional CTA button.
 */
import type { LucideIcon } from 'lucide-react';

interface PageEmptyProps {
  icon: LucideIcon;
  heading: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function PageEmpty({ icon: Icon, heading, description, action }: PageEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon size={28} className="text-slate-400" />
      </div>
      <h3 className="text-base font-bold text-slate-700 mb-1">{heading}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-5 py-2.5 bg-primary hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

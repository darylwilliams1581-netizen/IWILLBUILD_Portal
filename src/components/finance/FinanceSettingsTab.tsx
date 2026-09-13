/**
 * FinanceSettingsTab — Finance workspace Settings section.
 * Reuses AccountingTab, CostingTab, PdfStyleTab directly — no duplication.
 * When opened from a Manage deep-link (settingsTab in the URL), the inner
 * Accounting / Costing / PDF strip is hidden so the tool is not buried.
 */
import { useState } from 'react';
import { Settings, Calculator, FileText, ChevronRight } from 'lucide-react';
import AccountingTab from '@/components/settings/AccountingTab';
import CostingTab from '@/components/settings/CostingTab';
import PdfStyleTab from '@/components/settings/PdfStyleTab';
import { usePermissions } from '@/lib/usePermissions';

type SettingsSection = 'accounting' | 'costing' | 'pdf-style';

const SECTIONS: { key: SettingsSection; label: string; icon: React.ElementType; description: string }[] = [
  { key: 'accounting', label: 'Accounting Integration', icon: Settings,    description: 'Xero, QuickBooks, invoice locking, audit rules' },
  { key: 'costing',    label: 'Costing',          icon: Calculator,  description: 'Cost guide, recipes, markup defaults' },
  { key: 'pdf-style',  label: 'PDF / Print Style', icon: FileText,   description: 'Document layout, branding, print settings' },
];

export default function FinanceSettingsTab({ settingsTab }: { settingsTab?: string }) {
  const { isAdmin, isOwner } = usePermissions();
  const initial = (settingsTab as SettingsSection | undefined) ?? 'accounting';
  const locked = SECTIONS.some(s => s.key === settingsTab);
  const [active, setActive] = useState<SettingsSection>(
    SECTIONS.some(s => s.key === initial) ? initial : 'accounting'
  );

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {!locked && (
        <div className="md:w-56 lg:w-64 shrink-0 border-b md:border-b-0 md:border-r border-border bg-muted/30 overflow-x-auto md:overflow-y-auto">
          <div className="flex md:flex-col gap-1 p-2 md:p-3 min-w-max md:min-w-0">
            {SECTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors w-full md:w-auto ${
                  active === s.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <s.icon size={15} className="shrink-0" />
                <div className="min-w-0 hidden md:block">
                  <p className="text-sm font-semibold leading-tight truncate">{s.label}</p>
                  <p className={`text-xs leading-tight mt-0.5 truncate ${active === s.key ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {s.description}
                  </p>
                </div>
                <span className="text-sm font-semibold md:hidden whitespace-nowrap">{s.label}</span>
                {active === s.key && <ChevronRight size={13} className="ml-auto shrink-0 hidden md:block" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {active === 'accounting' && <AccountingTab isAdmin={isAdmin} isOwner={isOwner} />}
        {active === 'costing'    && <CostingTab />}
        {active === 'pdf-style'  && <PdfStyleTab isAdmin={isAdmin} />}
      </div>
    </div>
  );
}

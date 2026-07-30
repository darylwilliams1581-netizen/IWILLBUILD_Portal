/**
 * CostingTab — Settings panel wrapper for Cost Guide + Recipes.
 * Builders Calc and Take-off Pad remain accessible from the /estimating page directly.
 */
import { useState } from 'react';
import { CostGuideTab, RecipesTab } from '@/pages/estimating';

type Tab = 'cost-guide' | 'recipes';

export default function CostingTab() {
  const [tab, setTab] = useState<Tab>('cost-guide');

  return (
    <div className="flex flex-col gap-0 -mx-1">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {([
          { key: 'cost-guide' as Tab, label: 'Cost Guide' },
          { key: 'recipes'    as Tab, label: 'Recipes' },
        ]).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'cost-guide' && <CostGuideTab />}
      {tab === 'recipes'    && <RecipesTab />}
    </div>
  );
}

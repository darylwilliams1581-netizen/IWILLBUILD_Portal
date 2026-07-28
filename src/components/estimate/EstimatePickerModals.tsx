import { useState, useEffect } from 'react';
import { Loader2, Calculator, BookOpen } from 'lucide-react';

export interface CostItem { id: number; description: string; unit: string | null; rate: string }
export interface RecipeLine { id?: number; description: string; quantity: string; unit: string | null; rate: string; lineOrder: number }
export interface Recipe { id: number; title: string; notes: string | null; lines: RecipeLine[] }

export function CostGuidePicker({ onInsert, onClose }: { onInsert: (item: CostItem) => void; onClose: () => void }) {
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/cost-guide', { credentials: 'include' })
      .then((r) => r.json() as Promise<{ items?: CostItem[] }>)
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items
    .filter((i) => !search || i.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.description.toLowerCase().localeCompare(b.description.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <h3 className="font-heading font-bold text-base flex items-center gap-2"><Calculator size={15} className="text-primary" />Pick from Cost Guide</h3>
          <p className="text-xs text-slate-400 mt-1">Click an item to add it as a line. Qty defaults to 1.</p>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="mt-3 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" autoFocus />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-primary" /></div>}
          {!loading && filtered.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">{search ? 'No items match your search' : 'No cost items in your guide yet'}</div>}
          {!loading && filtered.map((item) => (
            <button key={item.id} onClick={() => { onInsert(item); onClose(); }} className="w-full flex items-center justify-between px-5 py-3 hover:bg-violet-50 border-b border-slate-50 transition-colors text-left">
              <div>
                <div className="text-sm font-medium text-slate-800">{item.description}</div>
                {item.unit && <div className="text-xs text-slate-400">{item.unit}</div>}
              </div>
              <div className="text-sm font-mono font-semibold text-slate-700 shrink-0 ml-4">${parseFloat(item.rate).toFixed(2)}</div>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function RecipePicker({ onInsert, onClose }: { onInsert: (recipe: Recipe) => void; onClose: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/recipes', { credentials: 'include' })
      .then((r) => r.json() as Promise<{ recipes?: Recipe[] }>)
      .then((d) => setRecipes(d.recipes ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <h3 className="font-heading font-bold text-base flex items-center gap-2"><BookOpen size={15} className="text-primary" />Insert Recipe</h3>
          <p className="text-xs text-slate-400 mt-1">Click a recipe to insert all its lines into the estimate.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-primary" /></div>}
          {!loading && recipes.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">No recipes in your library yet</div>}
          {!loading && recipes.map((recipe) => {
            const total = recipe.lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0), 0);
            return (
              <button key={recipe.id} onClick={() => { onInsert(recipe); onClose(); }} className="w-full flex items-center justify-between px-5 py-3 hover:bg-violet-50 border-b border-slate-50 transition-colors text-left">
                <div>
                  <div className="text-sm font-medium text-slate-800">{recipe.title}</div>
                  <div className="text-xs text-slate-400">{recipe.lines.length} line{recipe.lines.length !== 1 ? 's' : ''}{recipe.notes ? ` · ${recipe.notes}` : ''}</div>
                </div>
                <div className="text-sm font-mono font-semibold text-slate-700 shrink-0 ml-4">${total.toFixed(2)}</div>
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

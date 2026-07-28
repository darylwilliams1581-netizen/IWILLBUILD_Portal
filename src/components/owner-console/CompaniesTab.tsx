import { Building2, Plus, ShieldAlert, Loader2 } from 'lucide-react';

interface Company {
  id: number;
  name: string;
  owner: string;
  totalUsers: number;
  activeUsers: number;
  createdAt: string;
  status: string;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface CompanyActionsMenuProps {
  company: Company;
  onEnterSupport: (c: Company) => Promise<void>;
  onViewUsers: (companyId: number) => void;
  onViewActivity: (companyId: number) => void;
}

function CompanyActionsMenu({ company, onEnterSupport, onViewUsers, onViewActivity }: CompanyActionsMenuProps) {
  return (
    <div className="flex items-center gap-2 justify-end">
      <button
        onClick={() => void onEnterSupport(company)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
      >
        <ShieldAlert size={11} /> Support
      </button>
      <button
        onClick={() => onViewUsers(company.id)}
        className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
      >
        Users
      </button>
      <button
        onClick={() => onViewActivity(company.id)}
        className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
      >
        Activity
      </button>
    </div>
  );
}

interface Props {
  companies: Company[];
  supportMode: { active: boolean; companyId?: number | null };
  enteringSupport: number | null;
  onEnterSupport: (c: Company) => Promise<void>;
  onViewUsers: (companyId: number) => void;
  onViewActivity: (companyId: number) => void;
  onCreateCompany: () => void;
}

export default function CompaniesTab({ companies, supportMode, onEnterSupport, onViewUsers, onViewActivity, onCreateCompany }: Props) {
  return (
    <div className="max-w-5xl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-800">All Companies</h2>
            <p className="text-xs text-slate-400 mt-0.5">{companies.length} {companies.length === 1 ? 'company' : 'companies'}</p>
          </div>
          <button
            onClick={onCreateCompany}
            className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-colors"
          >
            <Plus size={13} /> Create Company
          </button>
        </div>
        {companies.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">No companies found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Owner</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Users</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Created</th>
                  <th className="text-right px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((c) => (
                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${supportMode.active && supportMode.companyId === c.id ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                          <Building2 size={13} className="text-blue-500" />
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800">{c.name}</span>
                          {supportMode.active && supportMode.companyId === c.id && (
                            <span className="ml-2 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">ACTIVE</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{c.owner}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-slate-700">{c.totalUsers}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-green-600">{c.activeUsers}</td>
                    <td className="px-5 py-3.5 text-slate-500">{fmtDate(c.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <CompanyActionsMenu
                        company={c}
                        onEnterSupport={onEnterSupport}
                        onViewUsers={onViewUsers}
                        onViewActivity={onViewActivity}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

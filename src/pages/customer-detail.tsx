import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import {
  Users, Phone, Mail, MapPin, FileText, Building2, ChevronRight,
  Loader2, AlertCircle, ArrowLeft, Briefcase, CheckCircle2,
  Archive, User, Calendar,
} from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import PortalSidebar, { MobileMenuButton } from '@/components/PortalSidebar';
import { getStatusStyle } from '@/lib/jobs-api';
import { fetchCustomer, type Customer } from '@/lib/customers-api';
import { useTerminology } from '@/lib/useTerminology';

interface LinkedJob {
  id: number;
  job_number: string | null;
  name: string;
  status: string;
  address: string | null;
  created_at: string;
}

function DetailRow({ icon: Icon, label, value, href }: {
  icon: React.ElementType;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-muted-foreground mb-0.5">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-words">{value}</a>
        ) : (
          <p className="text-sm text-foreground break-words">{value}</p>
        )}
      </div>
    </div>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workSingular, workPlural } = useTerminology();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<LinkedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true); setError('');
    fetchCustomer(Number(id))
      .then(({ customer: c, jobs: j }) => {
        setCustomer(c);
        setJobs(j as LinkedJob[]);
      })
      .catch(() => setError('Failed to load customer.'))
      .finally(() => setLoading(false));
  }, [id]);

  const activeJobs = jobs.filter((j) => !['Completed', 'Closed', 'Archived'].includes(j.status));
  const completedJobs = jobs.filter((j) => ['Completed', 'Closed'].includes(j.status));

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{customer ? `${customer.name} — Customers` : 'Customer'} — IWILLBUILD Portal</title>
        <meta name="description" content={customer ? `View details, contact info, and linked jobs for ${customer.name}.` : 'Customer details'} />
        <link rel="canonical" href={`https://iwillbuild.com/customers/${id}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-content">
        {/* Back nav */}
        <div className="flex items-center gap-3 mb-5">
          <MobileMenuButton onClick={openMobileMenu} />
          <button
            onClick={() => navigate('/customers')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />Customers
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0" />{error}
          </div>
        )}

        {!loading && customer && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-5"
          >
            {/* Header card */}
            <div className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-black text-xl">{customer.name[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="font-heading font-black text-xl text-foreground">{customer.name}</h1>
                    {customer.status === 'archived' && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        <Archive size={10} />Archived
                      </span>
                    )}
                  </div>
                  {customer.contact_person && (
                    <p className="text-sm text-muted-foreground mt-0.5">{customer.contact_person}</p>
                  )}
                  {customer.abn && (
                    <p className="text-xs text-muted-foreground mt-1">ABN {customer.abn}</p>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-border">
                {[
                  { label: `Total ${workPlural}`, value: jobs.length, icon: Briefcase, color: 'text-slate-700' },
                  { label: `Active ${workPlural}`, value: activeJobs.length, icon: Building2, color: 'text-emerald-600' },
                  { label: 'Completed', value: completedJobs.length, icon: CheckCircle2, color: 'text-blue-600' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact details */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4">Contact Details</h2>
              <div className="flex flex-col gap-3">
                {customer.contact_person && <DetailRow icon={User} label="Contact Person" value={customer.contact_person} />}
                {customer.email && <DetailRow icon={Mail} label="Email" value={customer.email} href={`mailto:${customer.email}`} />}
                {customer.phone && <DetailRow icon={Phone} label="Phone" value={customer.phone} href={`tel:${customer.phone}`} />}
                {customer.mobile && <DetailRow icon={Phone} label="Mobile" value={customer.mobile} href={`tel:${customer.mobile}`} />}
                {customer.address && <DetailRow icon={MapPin} label="Address" value={customer.address} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`} />}
                {customer.billing_address && <DetailRow icon={FileText} label="Billing Address" value={customer.billing_address} />}
                {customer.abn && <DetailRow icon={FileText} label="ABN" value={customer.abn} />}
                {!customer.email && !customer.phone && !customer.mobile && !customer.address && (
                  <p className="text-sm text-muted-foreground italic">No contact details on file.</p>
                )}
              </div>
            </div>

            {/* Notes */}
            {customer.notes && (
              <div className="bg-white border border-border rounded-xl p-5">
                <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider mb-3">Notes</h2>
                <p className="text-sm text-foreground whitespace-pre-wrap">{customer.notes}</p>
              </div>
            )}

            {/* Linked jobs */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4">
                Linked {workPlural} ({jobs.length})
              </h2>
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No {workPlural.toLowerCase()} linked to this customer yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {jobs.map((j) => {
                    const s = getStatusStyle(j.status);
                    return (
                      <Link
                        key={j.id}
                        to={`/jobs/${j.id}`}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-orange-50/30 transition-all group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            {j.job_number && <span className="text-xs font-mono text-muted-foreground">{j.job_number}</span>}
                            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                              {j.status}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-foreground truncate">{j.name}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            {j.address && <span className="flex items-center gap-1 truncate"><MapPin size={10} />{j.address}</span>}
                            <span className="flex items-center gap-1 shrink-0">
                              <Calendar size={10} />
                              {new Date(j.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        <ChevronRight size={15} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

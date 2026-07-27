import { home } from 'virtual:content';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import {
  Briefcase, FileText, Camera, Truck, LayoutDashboard,
  ShieldCheck, Users, CheckCircle, ArrowRight,
  Star, ChevronRight, Calendar, FolderOpen, Siren,
} from 'lucide-react';
import Header from '@/layouts/parts/Header';
import Footer from '@/layouts/parts/Footer';

// ── Content fallbacks ─────────────────────────────────────────────────────────
// Guard every field consumed from virtual:content so a missing or malformed
// JSON file never causes a runtime crash during publish or SSR rendering.
const homeRows: { label: string; status: string; color: string; id?: string }[] =
  Array.isArray(home?.rows) && home.rows.length > 0
    ? home.rows
    : [
        { label: 'Riverside Apartments — Stage 2', status: 'In Progress', color: '#1263d8' },
        { label: 'Warehouse Fitout — Lot 14',       status: 'On Site',     color: '#22c55e' },
        { label: 'Office Reno — Level 3',            status: 'Quoting',     color: '#f97316' },
        { label: 'Carpark Drainage — CBD',           status: 'Closed',      color: '#64748b' },
      ];

// ── Animation variants removed — landing page is static for SSR performance ──

// ── Data ──────────────────────────────────────────────────────────────────────
const features = [
  { icon: Briefcase,   title: 'Jobs and job files',       desc: 'Create jobs, track status, add notes, tasks, costs and close them out cleanly.' },
  { icon: FileText,    title: 'Estimates and recipes',    desc: 'Build cost guides, scope lines, approve estimates and print PDF quotes for clients.' },
  { icon: FileText,    title: 'Forms and signatures',     desc: 'Reusable templates, conditional logic, photo capture, multi-signer and completed PDFs.' },
  { icon: Camera,      title: 'Photos and files',         desc: 'Upload site photos, label them, view in lightbox and attach files to the job record.' },
  { icon: Truck,       title: 'Fleet prestarts',          desc: 'Daily prestart checks, service dates, rego reminders and dashboard flags for attention.' },
  { icon: Calendar,    title: 'Scheduler',                desc: 'Gantt and table views, job timelines, crew scheduling and progress tracking.' },
  { icon: ShieldCheck, title: 'Safety and compliance',    desc: 'SWMS library, site safety plans, policies, posters and safety pack export.' },
  { icon: Siren,       title: 'Emergency Beacon',         desc: 'One-tap SOS from any job site — captures GPS location, reason and note, queues offline and alerts the team instantly.' },
  { icon: Users,       title: 'Team permissions',         desc: 'Role-based access, invite users, control what each person can see and do.' },
];

const howItWorks = [
  { n: '1', title: 'Create your company account',       desc: 'Sign up, choose a plan and set up your company profile in a few minutes.' },
  { n: '2', title: 'Add jobs, users and fleet',         desc: 'Register your active jobs, invite your team and add your vehicles and plant.' },
  { n: '3', title: 'Complete forms and upload photos',  desc: 'Field teams fill in forms, upload photos and update job progress from site.' },
  { n: '4', title: 'Track progress and close out jobs', desc: 'Monitor job status, review estimates, manage safety docs and close out cleanly.' },
];

const plans = [
  {
    id: 'solo',
    name: 'Solo',
    price: '$19',
    period: '/ month + GST',
    users: '1 user',
    popular: false,
    features: [
      '1 user',
      'Projects & job files',
      'Forms & templates',
      'Estimates',
      'Photos & files',
      'Fleet basics',
      'Safety basics',
      'Email support',
      '30-day free trial',
    ],
    cta: 'Start Solo Trial',
    ctaStyle: 'outline',
  },
  {
    id: 'team',
    name: 'Team',
    price: '$79',
    period: '/ month + GST',
    users: 'Up to 5 users',
    popular: true,
    features: [
      'Up to 5 users',
      'Projects & job files',
      'Forms & templates',
      'Estimates',
      'Photos & files',
      'Fleet & prestarts',
      'Safety library',
      'Scheduler',
      'Team permissions',
      'Priority support',
      '30-day free trial',
    ],
    cta: 'Start Team Trial',
    ctaStyle: 'primary',
  },
  {
    id: 'business',
    name: 'Business',
    price: '$149',
    period: '/ month + GST',
    users: 'Up to 10 users',
    popular: false,
    features: [
      'Up to 10 users',
      'Everything in Team',
      'Advanced permissions',
      'Safety plans & SWMS library',
      'Ledger / job cost tracking',
      'Secure file storage',
      'Owner & admin reporting',
      '30-day free trial',
    ],
    cta: 'Start Business Trial',
    ctaStyle: 'outline',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: 'pricing',
    users: 'Larger teams',
    popular: false,
    features: [
      'Custom users',
      'Setup support',
      'Template migration',
      'Advanced storage & integrations',
      'Custom onboarding',
      'Contact us to discuss',
    ],
    cta: 'Contact Us',
    ctaStyle: 'ghost',
    href: 'mailto:support@iwillbuild.com',
  },
];

// ── Desktop portal mockup ─────────────────────────────────────────────────────
function PortalMockup() {
  return (
    <div suppressHydrationWarning style={{
      backgroundColor: '#0f172a',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 32px 80px rgba(0,0,0,.55)',
      border: '1px solid rgba(255,255,255,.08)',
      width: '100%',
    }}>
      {/* Window chrome */}
      <div style={{ backgroundColor: '#1e293b', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
        <span style={{ flex: 1, backgroundColor: '#334155', borderRadius: 4, height: 16, marginLeft: 8 }} />
        <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>iwillbuild.com/home</span>
      </div>
      {/* Sidebar + content */}
      <div style={{ display: 'flex', minHeight: 300 }}>
        {/* Sidebar */}
        <div style={{ width: 48, backgroundColor: '#111827', padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {[LayoutDashboard, Briefcase, Truck, FileText, ShieldCheck].map((Icon, i) => (
            <div key={i} style={{
              width: 32, height: 32, borderRadius: 8,
              backgroundColor: i === 0 ? '#f97316' : 'transparent',
              display: 'grid', placeItems: 'center',
              color: i === 0 ? '#fff' : '#475569',
            }}>
              <Icon size={15} />
            </div>
          ))}
        </div>

        {/* Main panel */}
        <div style={{ flex: 1, padding: '14px 16px', color: '#f1f5f9', overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>Office Portal</span>
            <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>● Live</span>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginBottom: 14 }}>
            {[
              { label: 'Active Jobs', val: '12', color: '#f97316' },
              { label: 'Forms Due',   val: '4',  color: '#3b82f6' },
              { label: 'Fleet OK',    val: '8',  color: '#22c55e' },
            ].map((s) => (
              <div key={s.label} style={{
                backgroundColor: '#1e293b', borderRadius: 7, padding: '9px 10px',
                border: '1px solid #334155',
              }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Job rows */}
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Active Jobs</div>
          {homeRows.slice(0, 3).map((r) => (
            <div key={r.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: '#1e293b', borderRadius: 6, padding: '8px 10px',
              marginBottom: 5, border: '1px solid #334155',
            }}>
              <span style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{r.label}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px',
                borderRadius: 20, backgroundColor: `${r.color}22`, color: r.color,
                flexShrink: 0, marginLeft: 6,
              }}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Phone field app mockup ────────────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div suppressHydrationWarning style={{
      width: 168,
      flexShrink: 0,
      backgroundColor: '#111827',
      borderRadius: 28,
      overflow: 'hidden',
      boxShadow: '0 24px 60px rgba(0,0,0,.6), inset 0 0 0 1.5px rgba(255,255,255,.1)',
      border: '2px solid #1e293b',
      position: 'relative',
    }}>
      {/* Status bar */}
      <div style={{
        backgroundColor: '#0f172a', padding: '10px 16px 6px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>9:41</span>
        <div style={{ width: 48, height: 14, backgroundColor: '#1e293b', borderRadius: 7 }} />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#94a3b8' }}>●●●</span>
        </div>
      </div>

      {/* App header */}
      <div style={{
        backgroundColor: '#f97316', padding: '10px 14px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>IWILLBUILD</span>
        <div style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.2)', display: 'grid', placeItems: 'center' }}>
          <Users size={13} color="#fff" />
        </div>
      </div>

      {/* Home grid */}
      <div style={{ backgroundColor: '#f8fafc', padding: '12px 10px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Field App</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
          {[
            { Icon: Briefcase,   label: 'Jobs',    bg: '#eff6ff', fg: '#1263d8' },
            { Icon: Camera,      label: 'Photos',  bg: '#fff7ed', fg: '#f97316' },
            { Icon: FileText,    label: 'Forms',   bg: '#f0fdf4', fg: '#16a34a' },
            { Icon: ShieldCheck, label: 'Safety',  bg: '#fef2f2', fg: '#dc2626' },
            { Icon: Truck,       label: 'Fleet',   bg: '#f5f3ff', fg: '#7c3aed' },
            { Icon: Users,       label: 'Team',    bg: '#ecfdf5', fg: '#059669' },
            { Icon: Calendar,    label: 'Schedule',bg: '#fefce8', fg: '#ca8a04' },
            { Icon: FolderOpen,  label: 'Files',   bg: '#f0f9ff', fg: '#0284c7' },
          ].map(({ Icon, label, bg, fg }) => (
            <div key={label} style={{
              backgroundColor: '#fff', borderRadius: 10, padding: '8px 4px 6px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,.06)',
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: bg, display: 'grid', placeItems: 'center' }}>
                <Icon size={13} color={fg} />
              </div>
              <span style={{ fontSize: 7.5, fontWeight: 700, color: '#374151', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Active job card */}
        <div style={{
          marginTop: 10, backgroundColor: '#fff', borderRadius: 10, padding: '9px 10px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Current Job</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>Riverside Apartments</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 8, fontWeight: 700, backgroundColor: '#dcfce7', color: '#16a34a', borderRadius: 10, padding: '2px 6px' }}>On Site</span>
            <span style={{ fontSize: 8, color: '#94a3b8' }}>Stage 2</span>
          </div>
        </div>
      </div>

      {/* Bottom tab bar */}
      <div style={{
        backgroundColor: '#fff', borderTop: '1px solid #e2e8f0',
        display: 'flex', padding: '6px 0 10px',
      }}>
        {[
          { Icon: LayoutDashboard, label: 'Home',   active: true  },
          { Icon: Briefcase,       label: 'Jobs',   active: false },
          { Icon: Camera,          label: '',       active: false, fab: true },
          { Icon: ShieldCheck,     label: 'Safety', active: false },
          { Icon: FolderOpen,      label: 'More',   active: false },
        ].map(({ Icon, label, active, fab }, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative' }}>
            {fab ? (
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                backgroundColor: '#f97316', display: 'grid', placeItems: 'center',
                marginTop: -14, boxShadow: '0 4px 12px rgba(249,115,22,.4)',
                border: '3px solid #fff',
              }}>
                <Icon size={15} color="#fff" />
              </div>
            ) : (
              <Icon size={16} color={active ? '#f97316' : '#94a3b8'} />
            )}
            {!fab && <span style={{ fontSize: 7, fontWeight: 700, color: active ? '#f97316' : '#94a3b8' }}>{label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HomePage() {
  const site = 'https://iwillbuild.com';
  const title = 'IWILLBUILD | Construction Job Management — Jobs, Forms, Fleet, Safety & Files';
  const description =
    'IWILLBUILD manages the work — jobs, estimates, forms, photos, fleet, safety and files — in one clean construction portal. As the platform grows, accounting integrations help approved invoices flow into Xero, QuickBooks and MYOB. 30-day free trial.';
  const ogDescription =
    'Manage construction jobs, estimates, forms, photos, fleet, safety and files in one clean portal. Accounting integrations sync approved invoices to Xero, QuickBooks and MYOB.';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${site}/#website`,
        name: 'IWILLBUILD',
        url: `${site}/`,
      },
      {
        '@type': 'Organization',
        '@id': `${site}/#organization`,
        name: 'IWILLBUILD',
        url: `${site}/`,
        logo: {
          '@type': 'ImageObject',
          url: `${site}/airo-assets/images/logo/horizontal`,
        },
        sameAs: [
          `${site}/`,
        ],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${site}/#app`,
        name: 'IWILLBUILD',
        url: `${site}/`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: 'IWILLBUILD manages the work — jobs, estimates, forms, photos, fleet, safety and files — in one clean construction portal. Accounting integrations help approved invoices and contacts flow into Xero, QuickBooks and MYOB.',
        keywords: 'field service management software, trades management app, job management software Australia, fleet management for tradies, safety forms software, construction job management, SWMS, site safety, QR attendance',
        publisher: { '@id': `${site}/#organization` },
        offers: [
          {
            '@type': 'Offer',
            name: 'Solo',
            price: '19',
            priceCurrency: 'AUD',
            billingIncrement: 'P1M',
          },
          {
            '@type': 'Offer',
            name: 'Team',
            price: '79',
            priceCurrency: 'AUD',
            billingIncrement: 'P1M',
          },
          {
            '@type': 'Offer',
            name: 'Business',
            price: '149',
            priceCurrency: 'AUD',
            billingIncrement: 'P1M',
          },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': `${site}/#webpage`,
        url: `${site}/`,
        name: title,
        description,
        isPartOf: { '@id': `${site}/#website` },
        about: { '@id': `${site}/#app` },
        publisher: { '@id': `${site}/#organization` },
        datePublished: '2026-06-25',
        dateModified: '2026-07-23',
      },
    ],
  };

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${site}/`} />
        {/* Open Graph */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${site}/`} />
        <meta property="og:image" content={`${site}/airo-assets/images/pages/home/og-image`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="IWILLBUILD" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={`${site}/airo-assets/images/pages/home/og-image`} />
        {/* Structured data */}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* ── Topbar — IWILLBUILD branded header ────────────────────────────── */}
      <Header />

      <main suppressHydrationWarning>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section id="top" style={{
        background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0f2d4a 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle grid texture */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: `linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)`,
          backgroundSize: '48px 48px', pointerEvents: 'none',
        }} />

        <div style={{
          position: 'relative',
          maxWidth: 1180, margin: '0 auto',
          padding: '72px 22px 64px',
          display: 'grid',
          gap: 52,
          alignItems: 'center',
        }} className="hero-grid">

          {/* ── Left: copy ── */}
          <div>
            {/* Eyebrow */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.35)',
              borderRadius: 20, padding: '5px 14px', marginBottom: 24,
            }}>
              <Star size={13} color="#f97316" fill="#f97316" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>30-day free trial — no credit card needed</span>
            </div>

            {/* Headline — dual interface concept */}
            <h1 style={{
              fontSize: 'clamp(30px,4.4vw,54px)',
              lineHeight: 1.06, letterSpacing: '-0.04em',
              color: '#fff', margin: '0 0 10px',
              fontWeight: 900,
            }}>
              One system.{' '}
              <span style={{ color: '#f97316' }}>Two interfaces.</span>
            </h1>

            {/* Sub-headline — the split */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'stretch', gap: 0,
                borderRadius: 10, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,.1)',
              }}>
                <div style={{
                  padding: '9px 16px', backgroundColor: 'rgba(249,115,22,.18)',
                  borderRight: '1px solid rgba(255,255,255,.1)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Phone</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Field app</div>
                </div>
                <div style={{ padding: '9px 16px', backgroundColor: 'rgba(255,255,255,.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Desktop</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Office portal</div>
                </div>
              </div>
            </div>

            <p style={{
              color: '#94a3b8', fontSize: 17, lineHeight: 1.65,
              margin: '0 0 28px', maxWidth: 540,
            }}>
              Same jobs, photos, forms, safety records, invoices, incidents, users and files underneath — your crew works from site, your office stays across everything.
            </p>

            {/* CTA block */}
            <div className="hero-cta-block" style={{ marginBottom: 28 }}>
              <Link to="/signup" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: '#f97316', borderRadius: 9, color: '#fff',
                padding: '15px 26px', fontWeight: 800, fontSize: 16,
                textDecoration: 'none', boxShadow: '0 4px 18px rgba(249,115,22,.4)',
                marginBottom: 10,
              }}>
                Start 30-day free trial
                <ArrowRight size={16} />
              </Link>
              <Link to="/login" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'rgba(255,255,255,.08)', border: '1.5px solid rgba(255,255,255,.2)',
                borderRadius: 9, color: '#fff',
                padding: '14px 24px', fontWeight: 700, fontSize: 15,
                textDecoration: 'none',
              }}>
                Sign in
              </Link>
              <p style={{ color: '#64748b', fontSize: 13, margin: '10px 0 0' }}>
                No setup fee. Cancel anytime.
              </p>
            </div>
          </div>

          {/* ── Right: dual mockup — phone + desktop side by side ── */}
          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            gap: 20, position: 'relative',
          }}>
            {/* Phone — slightly raised */}
            <div style={{ position: 'relative', zIndex: 2, transform: 'translateY(-16px)' }}>
              {/* Label */}
              <div style={{
                textAlign: 'center', marginBottom: 10,
                fontSize: 11, fontWeight: 700, color: '#f97316',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                📱 Field app
              </div>
              <PhoneMockup />
            </div>

            {/* Desktop portal */}
            <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
              {/* Label */}
              <div style={{
                textAlign: 'center', marginBottom: 10,
                fontSize: 11, fontWeight: 700, color: '#94a3b8',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                🖥 Office portal
              </div>
              <PortalMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ──────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '18px 22px',
          display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
        }}>
          {[
            '✓ Australian-built',
            '✓ No lock-in contracts',
            '✓ 30-day free trial',
            '✓ Your data stays yours',
            '✓ Cancel anytime',
          ].map((t) => (
            <span key={t} style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{t}</span>
          ))}
        </div>
      </div>

      {/* ── Accounting sync strip ───────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '20px 22px',
          display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginRight: 8 }}>
            Syncs approved invoices &amp; contacts to:
          </span>
          {[
            { name: 'Xero', color: '#13B5EA', bg: '#e8f8fd' },
            { name: 'QuickBooks', color: '#2CA01C', bg: '#edf7ec' },
            { name: 'MYOB', color: '#6B21A8', bg: '#f3e8ff' },
          ].map((p) => (
            <span key={p.name} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: p.bg, border: `1px solid ${p.color}30`,
              borderRadius: 20, padding: '5px 14px',
              fontSize: 13, fontWeight: 700, color: p.color,
            }}>
              {p.name}
            </span>
          ))}
          <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>
            — your accountant stays in their platform
          </span>
        </div>
      </div>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 22px' }}>
        <div>
          <h2 style={{ fontSize: 'clamp(26px,3.5vw,40px)', letterSpacing: '-0.03em', margin: '0 0 10px', color: '#0f172a' }}>
            Construction job management software built for the field
          </h2>
          <p style={{ color: '#64748b', fontSize: 17, margin: '0 0 40px', maxWidth: 680 }}>
            Projects, estimates, forms, photos, safety, fleet, files and scheduling — in one clean portal built around the way construction work actually moves.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  style={{
                    backgroundColor: '#fff', border: '1px solid #e2e8f0',
                    borderRadius: 10, padding: '22px 20px',
                    boxShadow: '0 2px 8px rgba(15,23,42,.05)',
                  }}
                >
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    backgroundColor: '#eff6ff', color: '#1263d8',
                    display: 'grid', placeItems: 'center', marginBottom: 14,
                  }}>
                    <Icon size={20} />
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{f.title}</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how" style={{ backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 22px' }}>
          <div>
            <h2 style={{ fontSize: 'clamp(26px,3.5vw,40px)', letterSpacing: '-0.03em', margin: '0 0 10px', color: '#0f172a' }}>
              Up and running in minutes
            </h2>
            <p style={{ color: '#64748b', fontSize: 17, margin: '0 0 40px', maxWidth: 600 }}>
              No complicated setup. Start with a free trial and add your team as you go.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
              {howItWorks.map((w) => (
                <div
                  key={w.n}
                  style={{
                    backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 10, padding: '24px 20px',
                    position: 'relative',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    backgroundColor: '#f97316', color: '#fff',
                    display: 'grid', placeItems: 'center',
                    fontWeight: 900, fontSize: 16, marginBottom: 14,
                  }}>{w.n}</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{w.title}</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{w.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 22px' }}>
        <div>
          <h2 style={{ fontSize: 'clamp(26px,3.5vw,40px)', letterSpacing: '-0.03em', margin: '0 0 10px', color: '#0f172a' }}>
            Simple, honest pricing
          </h2>
          <p style={{ color: '#64748b', fontSize: 17, margin: '0 0 40px', maxWidth: 600 }}>
            All plans include a 30-day free trial. No credit card required to start.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 20, alignItems: 'start' }}>
            {plans.map((plan) => {
              const isPrimary = plan.ctaStyle === 'primary';
              const isGhost   = plan.ctaStyle === 'ghost';
              const href = plan.href ?? `/signup?plan=${plan.id}`;
              return (
                <div
                  key={plan.id}
                  style={{
                    background: isPrimary ? '#0f172a' : '#fff',
                    border: isPrimary ? '2px solid #f97316' : '1.5px solid #e2e8f0',
                    borderRadius: 12, padding: '28px 24px',
                    boxShadow: isPrimary ? '0 20px 50px rgba(15,23,42,.25)' : '0 2px 8px rgba(15,23,42,.05)',
                    position: 'relative',
                  }}
                >
                  {plan.popular && (
                    <div style={{
                      position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                      backgroundColor: '#f97316', color: '#fff',
                      fontSize: 11, fontWeight: 800, padding: '4px 14px',
                      borderRadius: 20, whiteSpace: 'nowrap',
                    }}>Most popular</div>
                  )}

                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isPrimary ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{plan.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.04em', color: isPrimary ? '#fff' : '#0f172a' }}>{plan.price}</span>
                    <span style={{ fontSize: 14, color: isPrimary ? '#94a3b8' : '#64748b' }}>{plan.period}</span>
                  </div>
                  <div style={{ fontSize: 13, color: isPrimary ? '#64748b' : '#94a3b8', marginBottom: 22 }}>{plan.users}</div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 14, color: isPrimary ? '#cbd5e1' : '#374151' }}>
                        <CheckCircle size={15} color={isPrimary ? '#f97316' : '#16a34a'} style={{ flexShrink: 0, marginTop: 1 }} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isGhost ? (
                    <a href={href} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '12px 16px', borderRadius: 8,
                      border: '1.5px solid #e2e8f0', backgroundColor: '#fff',
                      color: '#374151', fontWeight: 700, fontSize: 14,
                      textDecoration: 'none',
                    }}>
                      {plan.cta}
                      <ChevronRight size={15} />
                    </a>
                  ) : isPrimary ? (
                    <Link to={href} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '13px 16px', borderRadius: 8,
                      backgroundColor: '#f97316', color: '#fff',
                      fontWeight: 800, fontSize: 14, textDecoration: 'none',
                      boxShadow: '0 4px 14px rgba(249,115,22,.4)',
                    }}>
                      {plan.cta}
                      <ArrowRight size={15} />
                    </Link>
                  ) : (
                    <Link to={href} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '12px 16px', borderRadius: 8,
                      border: '1.5px solid #1263d8', color: '#1263d8',
                      fontWeight: 700, fontSize: 14, textDecoration: 'none',
                      background: 'transparent',
                    }}>
                      {plan.cta}
                      <ArrowRight size={15} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Why IWILLBUILD ─────────────────────────────────────────────────── */}
      <section id="why" style={{ backgroundColor: '#0f172a', borderTop: '1px solid #1e293b' }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '72px 22px',
          display: 'grid', gap: 48, alignItems: 'center',
        }} className="dazza-grid">
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.3)',
              borderRadius: 20, padding: '5px 14px', marginBottom: 20,
            }}>
              <FolderOpen size={13} color="#f97316" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>Built for construction</span>
            </div>

            <h2 style={{ fontSize: 'clamp(26px,3.5vw,40px)', letterSpacing: '-0.03em', margin: '0 0 16px', color: '#fff' }}>
              Everything in one place — no spreadsheets, no paper
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 17, lineHeight: 1.6, margin: '0 0 28px', maxWidth: 560 }}>
              IWILLBUILD brings your projects, estimates, forms, photos, safety docs, fleet and scheduling into a single clean portal. Your team works from site, your office stays across everything.
            </p>
            <div>
              <Link to="/signup" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                backgroundColor: '#f97316', borderRadius: 8, color: '#fff',
                padding: '13px 22px', fontWeight: 800, fontSize: 14,
                textDecoration: 'none',
              }}>
                Start your free 30-day trial
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>

          {/* Feature highlights */}
          <div
            style={{
              backgroundColor: '#1e293b', borderRadius: 12, padding: 20,
              border: '1px solid #334155',
              boxShadow: '0 20px 50px rgba(0,0,0,.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #334155' }}>
              <div style={{
                width: 34, height: 34, borderRadius: 8,
                background: 'linear-gradient(135deg,#1263d8,#0f8aa8)',
                display: 'grid', placeItems: 'center',
              }}>
                <LayoutDashboard size={16} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>IWILLBUILD Portal</div>
                <div style={{ fontSize: 11, color: '#22c55e' }}>● All modules active</div>
              </div>
            </div>
            {[
              { label: 'Jobs & scheduling',         value: '12 active jobs' },
              { label: 'Forms completed this week', value: '34 forms' },
              { label: 'Fleet prestarts today',     value: '8 / 8 done' },
              { label: 'Estimates pending approval',value: '3 estimates' },
              { label: 'Safety docs on file',       value: '21 SWMS' },
            ].map((row, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: i < 4 ? '1px solid #1e293b' : 'none',
                fontSize: 13,
              }}>
                <span style={{ color: '#94a3b8' }}>{row.label}</span>
                <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Site Escape Arcade — compact icon link ──────────────────────────── */}
      <section id="arcade" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1a2744 60%, #0f172a 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.05,
          backgroundImage: `linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)`,
          backgroundSize: '48px 48px', pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '48px 22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <a
            href="/site-escape.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 16,
              background: 'rgba(255,255,255,.05)',
              border: '2px solid rgba(255,212,71,0.45)',
              borderRadius: 20,
              padding: '18px 28px',
              textDecoration: 'none',
              boxShadow: '0 8px 32px rgba(0,0,0,.45), 0 0 32px rgba(249,115,22,.12)',
              transition: 'transform .15s ease, box-shadow .15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 14px 40px rgba(0,0,0,.5), 0 0 48px rgba(249,115,22,.22)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 32px rgba(0,0,0,.45), 0 0 32px rgba(249,115,22,.12)';
            }}
          >
            {/* Bobcat icon */}
            <div style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: 'linear-gradient(135deg, #1e3a5f, #0f172a)',
              border: '2px solid rgba(255,212,71,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26,
            }}>
              🚜
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>Site Escape</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  background: 'rgba(249,115,22,.2)', border: '1px solid rgba(249,115,22,.4)',
                  color: '#fb923c', borderRadius: 6, padding: '2px 7px',
                }}>ARCADE</span>
                {/* external link arrow */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </div>
              <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                Dodge workers &amp; outrun the safety officer
              </p>
            </div>
          </a>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section style={{ backgroundColor: '#fff', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 22px', textAlign: 'center' }}>
          <div>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', letterSpacing: '-0.04em', margin: '0 0 16px', color: '#0f172a' }}>
              Ready to clean up your job paperwork?
            </h2>
            <p style={{ color: '#64748b', fontSize: 17, margin: '0 0 32px' }}>
              Start your 30-day free trial today. No credit card. No setup fee. Cancel anytime.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/signup" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                backgroundColor: '#f97316', borderRadius: 9, color: '#fff',
                padding: '14px 28px', fontWeight: 800, fontSize: 15,
                textDecoration: 'none', boxShadow: '0 4px 18px rgba(249,115,22,.35)',
              }}>
                Start 30-day free trial
                <ArrowRight size={16} />
              </Link>
              <Link to="/login" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                border: '1.5px solid #e2e8f0', borderRadius: 9,
                backgroundColor: '#fff', color: '#374151',
                padding: '14px 24px', fontWeight: 700, fontSize: 15,
                textDecoration: 'none',
              }}>
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer — IWILLBUILD branded footer ────────────────────────────── */}
      <Footer />

      {/* Responsive styles */}
      <style>{`
        .hero-grid {
          grid-template-columns: minmax(0,1fr) 520px;
        }
        .dazza-grid {
          grid-template-columns: minmax(0,1fr) 420px;
        }
        @media (max-width: 960px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
          .hero-grid .phone-hide {
            display: none;
          }
        }
        @media (max-width: 900px) {
          .dazza-grid {
            grid-template-columns: 1fr !important;
          }
        }
        /* On tablet/mobile, hide the phone mockup to keep the hero clean */
        @media (max-width: 960px) {
          .hero-phone-col { display: none !important; }
        }
        /* CTA block: stacked full-width on mobile, inline row on desktop */
        .hero-cta-block {
          display: flex;
          flex-direction: column;
          max-width: 340px;
        }
        @media (min-width: 640px) {
          .hero-cta-block {
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            max-width: none;
          }
          .hero-cta-block a {
            flex: 0 0 auto;
            margin-bottom: 0 !important;
          }
          .hero-cta-block p {
            width: 100%;
            margin-top: 6px !important;
          }
        }
        @media (max-width: 480px) {
          .hero-grid a, .hero-grid button {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>

      </main>
    </>
  );
}

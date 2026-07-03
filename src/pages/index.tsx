import { home } from 'virtual:content';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import {
  Briefcase, FileText, Camera, Truck, LayoutDashboard,
  ShieldCheck, Users, CheckCircle, ArrowRight,
  Star, ChevronRight, Calendar, FolderOpen,
} from 'lucide-react';
import ContactForm from '@/components/ContactForm';

// ── Animation variants ────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
} as const;

// ── Data ──────────────────────────────────────────────────────────────────────
const features = [
  { icon: Briefcase,   title: 'Jobs and job files',       desc: 'Create jobs, track status, add notes, to-do items, costs and close them out cleanly.' },
  { icon: FileText,    title: 'Estimates and recipes',    desc: 'Build cost guides, scope lines, approve estimates and print PDF quotes for clients.' },
  { icon: FileText,    title: 'Forms and signatures',     desc: 'Reusable templates, conditional logic, photo capture, multi-signer and completed PDFs.' },
  { icon: Camera,      title: 'Photos and files',         desc: 'Upload site photos, label them, view in lightbox and attach files to the job record.' },
  { icon: Truck,       title: 'Fleet prestarts',          desc: 'Daily prestart checks, service dates, rego reminders and dashboard flags for attention.' },
  { icon: Calendar,    title: 'Scheduler',                desc: 'Gantt and table views, job timelines, crew scheduling and progress tracking.' },
  { icon: ShieldCheck, title: 'Safety and compliance',    desc: 'SWMS library, site safety plans, policies, posters and safety pack export.' },
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

// ── Portal mockup component ───────────────────────────────────────────────────
function PortalMockup() {
  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 32px 80px rgba(0,0,0,.55)',
      border: '1px solid rgba(255,255,255,.08)',
      width: '100%',
      maxWidth: 560,
    }}>
      {/* Window chrome */}
      <div style={{ background: '#1e293b', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
        <span style={{ flex: 1, background: '#334155', borderRadius: 4, height: 18, marginLeft: 8 }} />
      </div>
      {/* Sidebar + content */}
      <div style={{ display: 'flex', minHeight: 340 }}>
        {/* Sidebar */}
        <div style={{ width: 52, background: '#111827', padding: '14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {[LayoutDashboard, Briefcase, Truck, FileText, FileText].map((Icon, i) => (
            <div key={i} style={{
              width: 34, height: 34, borderRadius: 8,
              background: i === 0 ? '#1263d8' : 'transparent',
              display: 'grid', placeItems: 'center',
              color: i === 0 ? '#fff' : '#64748b',
            }}>
              <Icon size={16} />
            </div>
          ))}
        </div>

        {/* Main panel */}
        <div style={{ flex: 1, padding: '16px 18px', color: '#f1f5f9' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {home.tabs.map((t, i) => (
              <span key={t} style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 6,
                background: i === 0 ? '#1263d8' : '#1e293b',
                color: i === 0 ? '#fff' : '#94a3b8',
                border: i === 0 ? 'none' : '1px solid #334155',
              }}>{t}</span>
            ))}
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Active Jobs', val: '12' },
              { label: 'Forms Due',   val: '4'  },
              { label: 'Fleet Flags', val: '2'  },
            ].map((s) => (
              <div key={s.label} style={{
                background: '#1e293b', borderRadius: 8, padding: '10px 12px',
                border: '1px solid #334155',
              }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#f97316' }}>{s.val}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Job rows */}
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Jobs</div>
          {home.rows.map((r) => (
            <div key={r.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#1e293b', borderRadius: 7, padding: '9px 12px',
              marginBottom: 6, border: '1px solid #334155',
            }}>
              <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{r.label}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px',
                borderRadius: 20, background: `${r.color}22`, color: r.color,
              }}>{r.status}</span>
            </div>
          ))}
        </div>
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
        '@type': 'SoftwareApplication',
        '@id': `${site}/#app`,
        name: 'IWILLBUILD',
        url: `${site}/`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: 'IWILLBUILD manages the work — jobs, estimates, forms, photos, fleet, safety and files — in one clean construction portal. Accounting integrations help approved invoices and contacts flow into Xero, QuickBooks and MYOB.',
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
        datePublished: '2026-06-25',
        dateModified: '2026-06-30',
      },
    ],
  };

  return (
    <div style={{ background: '#f1f5f9', color: '#101828', fontFamily: "'Inter', Arial, Helvetica, sans-serif", margin: 0 }}>
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

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.97)',
        borderBottom: '1px solid #e2e8f0',
        backdropFilter: 'blur(14px)',
      }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto',
          padding: '0 22px', height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18,
        }}>
          <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <span style={{
              width: 38, height: 38, borderRadius: 9,
              background: 'linear-gradient(135deg,#1263d8,#0f8aa8)',
              display: 'grid', placeItems: 'center',
              color: '#fff', fontWeight: 900, fontSize: 16, flexShrink: 0,
            }}>IW</span>
            <strong style={{ fontSize: 20, letterSpacing: '-0.03em', color: '#0f172a' }}>IWILLBUILD</strong>
          </a>

          <nav className="hidden md:flex" style={{ gap: 24, alignItems: 'center', fontSize: 14, fontWeight: 600, color: '#475569' }}>
            <a href="#features" style={{ textDecoration: 'none', color: 'inherit' }} className="hover:text-[#1263d8] transition-colors">Features</a>
            <a href="#pricing"  style={{ textDecoration: 'none', color: 'inherit' }} className="hover:text-[#1263d8] transition-colors">Pricing</a>
            <a href="#how"      style={{ textDecoration: 'none', color: 'inherit' }} className="hover:text-[#1263d8] transition-colors">How it works</a>
            <Link to="/login" style={{
              padding: '8px 16px', borderRadius: 8,
              border: '1.5px solid #1263d8', color: '#1263d8',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}>Sign in</Link>
            <Link to="/signup" style={{
              padding: '8px 18px', borderRadius: 8,
              background: '#f97316', color: '#fff',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}>Start free trial</Link>
          </nav>

          {/* Mobile */}
          <div className="md:hidden" style={{ display: 'flex', gap: 8 }}>
            <Link to="/login" style={{
              padding: '8px 12px', borderRadius: 8,
              border: '1.5px solid #1263d8', color: '#1263d8',
              fontWeight: 700, fontSize: 13, textDecoration: 'none',
            }}>Sign in</Link>
            <Link to="/signup" style={{
              padding: '8px 12px', borderRadius: 8,
              background: '#f97316', color: '#fff',
              fontWeight: 700, fontSize: 13, textDecoration: 'none',
            }}>Free trial</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section id="top" style={{
        background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0f2d4a 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle grid texture */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: `linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)`,
          backgroundSize: '48px 48px',
        }} />

        <div style={{
          position: 'relative',
          maxWidth: 1180, margin: '0 auto',
          padding: '80px 22px 72px',
          display: 'grid',
          gap: 48,
          alignItems: 'center',
        }} className="hero-grid">
          {/* Left copy */}
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.35)',
              borderRadius: 20, padding: '5px 14px', marginBottom: 22,
            }}>
              <Star size={13} color="#f97316" fill="#f97316" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>30-day free trial — no credit card needed</span>
            </motion.div>

            <motion.div variants={fadeUp} style={{
              fontSize: 'clamp(32px,4.8vw,58px)',
              lineHeight: 1.04, letterSpacing: '-0.04em',
              color: '#fff', margin: '0 0 20px',
            }}>
              <h1 style={{ fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit', color: 'inherit', margin: 0 }}>
                Construction job management — jobs, forms, fleet, safety and files in one clean portal.
              </h1>
            </motion.div>

            <motion.p variants={fadeUp} style={{
              color: '#94a3b8', fontSize: 18, lineHeight: 1.6,
              margin: '0 0 32px', maxWidth: 600,
            }}>
              IWILLBUILD manages the work — jobs, estimates, forms, photos, fleet, safety and files. As the platform grows, accounting integrations help approved invoices, customers and supporting documents flow into Xero, QuickBooks and MYOB.
            </motion.p>

            <motion.div variants={fadeUp} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <Link to="/signup" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#f97316', borderRadius: 9, color: '#fff',
                padding: '14px 26px', fontWeight: 800, fontSize: 15,
                textDecoration: 'none', boxShadow: '0 4px 18px rgba(249,115,22,.4)',
              }}>
                Start 30-day free trial
                <ArrowRight size={16} />
              </Link>
              <Link to="/login" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,.08)', border: '1.5px solid rgba(255,255,255,.2)',
                borderRadius: 9, color: '#fff',
                padding: '14px 24px', fontWeight: 700, fontSize: 15,
                textDecoration: 'none',
              }}>
                Sign in
              </Link>
            </motion.div>

            <motion.p variants={fadeUp} style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
              No setup fee. Cancel anytime. View-only access keeps your records available if you cancel.
            </motion.p>
          </motion.div>

          {/* Right: portal mockup */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.25, ease: 'easeOut' as const }}
            style={{ display: 'flex', justifyContent: 'center' }}
          >
            <PortalMockup />
          </motion.div>
        </div>
      </section>

      {/* ── Trust bar ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
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
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
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
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          <motion.h2 variants={fadeUp} style={{ fontSize: 'clamp(26px,3.5vw,40px)', letterSpacing: '-0.03em', margin: '0 0 10px', color: '#0f172a' }}>
            Construction job management software built for the field
          </motion.h2>
          <motion.p variants={fadeUp} style={{ color: '#64748b', fontSize: 17, margin: '0 0 40px', maxWidth: 680 }}>
            Projects, estimates, forms, photos, safety, fleet, files and scheduling — in one clean portal built around the way construction work actually moves.
          </motion.p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  whileHover={{ y: -3, boxShadow: '0 16px 36px rgba(15,23,42,.1)' }}
                  style={{
                    background: '#fff', border: '1px solid #e2e8f0',
                    borderRadius: 10, padding: '22px 20px',
                    boxShadow: '0 2px 8px rgba(15,23,42,.05)',
                  }}
                >
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: '#eff6ff', color: '#1263d8',
                    display: 'grid', placeItems: 'center', marginBottom: 14,
                  }}>
                    <Icon size={20} />
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{f.title}</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how" style={{ background: '#fff', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 22px' }}>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} style={{ fontSize: 'clamp(26px,3.5vw,40px)', letterSpacing: '-0.03em', margin: '0 0 10px', color: '#0f172a' }}>
              Up and running in minutes
            </motion.h2>
            <motion.p variants={fadeUp} style={{ color: '#64748b', fontSize: 17, margin: '0 0 40px', maxWidth: 600 }}>
              No complicated setup. Start with a free trial and add your team as you go.
            </motion.p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
              {howItWorks.map((w) => (
                <motion.div
                  key={w.n}
                  variants={fadeUp}
                  style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 10, padding: '24px 20px',
                    position: 'relative',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: '#f97316', color: '#fff',
                    display: 'grid', placeItems: 'center',
                    fontWeight: 900, fontSize: 16, marginBottom: 14,
                  }}>{w.n}</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{w.title}</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{w.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 22px' }}>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          <motion.h2 variants={fadeUp} style={{ fontSize: 'clamp(26px,3.5vw,40px)', letterSpacing: '-0.03em', margin: '0 0 10px', color: '#0f172a' }}>
            Simple, honest pricing
          </motion.h2>
          <motion.p variants={fadeUp} style={{ color: '#64748b', fontSize: 17, margin: '0 0 40px', maxWidth: 600 }}>
            All plans include a 30-day free trial. No credit card required to start.
          </motion.p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 20, alignItems: 'start' }}>
            {plans.map((plan) => {
              const isPrimary = plan.ctaStyle === 'primary';
              const isGhost   = plan.ctaStyle === 'ghost';
              const href = plan.href ?? `/signup?plan=${plan.id}`;
              return (
                <motion.div
                  key={plan.id}
                  variants={fadeUp}
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
                      background: '#f97316', color: '#fff',
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
                      border: '1.5px solid #e2e8f0', background: '#fff',
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
                      background: '#f97316', color: '#fff',
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
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* ── Why IWILLBUILD ─────────────────────────────────────────────────── */}
      <section id="why" style={{ background: '#0f172a', borderTop: '1px solid #1e293b' }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '72px 22px',
          display: 'grid', gap: 48, alignItems: 'center',
        }} className="dazza-grid">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.div variants={fadeUp} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.3)',
              borderRadius: 20, padding: '5px 14px', marginBottom: 20,
            }}>
              <FolderOpen size={13} color="#f97316" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>Built for construction</span>
            </motion.div>

            <motion.h2 variants={fadeUp} style={{ fontSize: 'clamp(26px,3.5vw,40px)', letterSpacing: '-0.03em', margin: '0 0 16px', color: '#fff' }}>
              Everything in one place — no spreadsheets, no paper
            </motion.h2>
            <motion.p variants={fadeUp} style={{ color: '#94a3b8', fontSize: 17, lineHeight: 1.6, margin: '0 0 28px', maxWidth: 560 }}>
              IWILLBUILD brings your projects, estimates, forms, photos, safety docs, fleet and scheduling into a single clean portal. Your team works from site, your office stays across everything.
            </motion.p>
            <motion.div variants={fadeUp}>
              <Link to="/signup" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#f97316', borderRadius: 8, color: '#fff',
                padding: '13px 22px', fontWeight: 800, fontSize: 14,
                textDecoration: 'none',
              }}>
                Start your free 30-day trial
                <ArrowRight size={15} />
              </Link>
            </motion.div>
          </motion.div>

          {/* Feature highlights */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, ease: 'easeOut' as const }}
            style={{
              background: '#1e293b', borderRadius: 12, padding: 20,
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
          </motion.div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section style={{ background: '#fff', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 22px', textAlign: 'center' }}>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} style={{ fontSize: 'clamp(28px,4vw,44px)', letterSpacing: '-0.04em', margin: '0 0 16px', color: '#0f172a' }}>
              Ready to clean up your job paperwork?
            </motion.h2>
            <motion.p variants={fadeUp} style={{ color: '#64748b', fontSize: 17, margin: '0 0 32px' }}>
              Start your 30-day free trial today. No credit card. No setup fee. Cancel anytime.
            </motion.p>
            <motion.div variants={fadeUp} style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/signup" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#f97316', borderRadius: 9, color: '#fff',
                padding: '14px 28px', fontWeight: 800, fontSize: 15,
                textDecoration: 'none', boxShadow: '0 4px 18px rgba(249,115,22,.35)',
              }}>
                Start 30-day free trial
                <ArrowRight size={16} />
              </Link>
              <Link to="/login" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                border: '1.5px solid #e2e8f0', borderRadius: 9,
                background: '#fff', color: '#374151',
                padding: '14px 24px', fontWeight: 700, fontSize: 15,
                textDecoration: 'none',
              }}>
                Sign in
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#0f172a', borderTop: '1px solid #1e293b', color: '#64748b' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 22px 32px' }}>

          {/* ── Contact form + links grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 40, marginBottom: 40 }}>

            {/* Brand + contact details */}
            <div style={{ minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: 'linear-gradient(135deg,#1263d8,#0f8aa8)',
                  display: 'grid', placeItems: 'center',
                  color: '#fff', fontWeight: 900, fontSize: 14,
                }}>IW</span>
                <strong style={{ color: '#f1f5f9', fontSize: 16 }}>IWILLBUILD</strong>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 16px' }}>
                A practical portal for builders and field teams.
              </p>
              <div style={{ fontSize: 13, lineHeight: 2 }}>
                <div>
                  <a href="mailto:support@iwillbuild.com" style={{ color: '#64748b', textDecoration: 'none' }} className="hover:text-white transition-colors">
                    support@iwillbuild.com
                  </a>
                </div>
                <div>
                  <a href="tel:+61498350566" style={{ color: '#64748b', textDecoration: 'none' }} className="hover:text-white transition-colors">
                    +61 498 350 566
                  </a>
                </div>
                <div style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>ABN 89 791 350 823</div>
              </div>
            </div>

            {/* Portal links */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Portal</div>
              {[
                { label: 'Sign in',  to: '/login'  },
                { label: 'Sign up',  to: '/signup' },
                { label: 'Pricing',  href: '#pricing' },
              ].map((l) => (
                <div key={l.label} style={{ marginBottom: 8 }}>
                  {l.to ? (
                    <Link to={l.to} style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }} className="hover:text-white transition-colors">{l.label}</Link>
                  ) : (
                    <a href={l.href} style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }} className="hover:text-white transition-colors">{l.label}</a>
                  )}
                </div>
              ))}
            </div>

            {/* Legal links */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Legal</div>
              {[
                { label: 'Privacy Policy', to: '/privacy' },
                { label: 'Terms of Use',   to: '/terms'   },
              ].map((l) => (
                <div key={l.label} style={{ marginBottom: 8 }}>
                  <Link to={l.to} style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }} className="hover:text-white transition-colors">{l.label}</Link>
                </div>
              ))}
            </div>

            {/* Contact form */}
            <div style={{ minWidth: 260 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Send us a message</div>
              <ContactForm />
            </div>

          </div>

          <div style={{ borderTop: '1px solid #1e293b', paddingTop: 20, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 13 }}>© {new Date().getFullYear()} IWILLBUILD. All rights reserved.</span>
            <span style={{ fontSize: 13 }}>Australian-built construction portal.</span>
          </div>
        </div>
      </footer>

      {/* Responsive styles */}
      <style>{`
        .hero-grid {
          grid-template-columns: minmax(0,1fr) 520px;
        }
        .dazza-grid {
          grid-template-columns: minmax(0,1fr) 420px;
        }
        @media (max-width: 900px) {
          .hero-grid, .dazza-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 480px) {
          .hero-grid a, .hero-grid button {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

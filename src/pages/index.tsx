import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';

const features = [
  { icon: 'J', title: 'Jobs', desc: 'Register jobs, track status, notes, to-do items, photos, forms and approved work.' },
  { icon: '$', title: 'Estimating', desc: 'Cost guide, recipes, scope lines, approved estimate locking and PDF quote output.' },
  { icon: 'F', title: 'Forms', desc: 'Reusable templates, conditional logic, media upload, signatures and completed PDFs.' },
  { icon: 'P', title: 'Photos', desc: 'Job photo upload, labels, thumbnails and report photo album output.' },
  { icon: 'V', title: 'Fleet', desc: 'Assets, daily prestarts, service dates, rego reminders and dashboard flags.' },
  { icon: 'D', title: 'Dashboard', desc: 'Due items, active jobs, fleet attention, forms and notice board in one place.' },
  { icon: 'S', title: 'Settings', desc: 'Company profile, users, permissions, PDF branding and backup/export controls.' },
  { icon: 'A', title: 'Dazza AI', desc: 'Local assistant with update packs, file learning, NCC reference guidance and data health checks.' },
];

const workflow = [
  { n: '1', title: 'Add the job', desc: 'Create the job record, add notes, to-do items, photos and files as work starts.' },
  { n: '2', title: 'Build and approve', desc: 'Create estimate lines, print the quote, approve the estimate and lock the scope.' },
  { n: '3', title: 'Track and report', desc: 'Update progress, complete forms, upload photos and generate PDFs for the file.' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
} as const;

export default function HomePage() {
  const site = 'https://iwillbuild.com.au';
  const title = 'IWILLBUILD — Construction Portal';
  const description =
    'A practical local portal for builders and site teams. Keep the job file organised, approve estimates, track progress, complete forms, manage fleet prestarts and give Dazza AI the data it needs to help.';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${site}/#website`, name: 'IWILLBUILD', url: `${site}/` },
      {
        '@type': 'SoftwareApplication',
        '@id': `${site}/#organization`,
        name: 'IWILLBUILD',
        url: `${site}/`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description,
      },
      {
        '@type': 'WebPage',
        '@id': `${site}/#webpage`,
        url: `${site}/`,
        name: title,
        isPartOf: { '@id': `${site}/#website` },
        about: { '@id': `${site}/#organization` },
        datePublished: '2026-06-25',
        dateModified: '2026-06-25',
      },
    ],
  };

  return (
    <div style={{ background: '#eef3f9', color: '#101828', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0 }}>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${site}/`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${site}/`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* ── Topbar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(255,255,255,0.96)',
        borderBottom: '1px solid #ccd8e8',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
          {/* Brand */}
          <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
            <span style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'linear-gradient(135deg,#1263d8,#0f8aa8)',
              display: 'grid', placeItems: 'center',
              color: '#fff', fontWeight: 900, fontSize: 20,
            }}>IW</span>
            <strong style={{ fontSize: 24, letterSpacing: '-0.02em' }}>IWILLBUILD</strong>
          </a>

          {/* Nav */}
          <nav className="hidden md:flex" style={{ gap: 20, alignItems: 'center', color: '#5f6f86', fontWeight: 800, fontSize: 14 }}>
            <a href="#features" style={{ textDecoration: 'none', color: 'inherit' }} className="hover:text-[#1263d8] transition-colors">Features</a>
            <a href="#dazza" style={{ textDecoration: 'none', color: 'inherit' }} className="hover:text-[#1263d8] transition-colors">Dazza AI</a>
            <a href="#workflow" style={{ textDecoration: 'none', color: 'inherit' }} className="hover:text-[#1263d8] transition-colors">Workflow</a>
            <Link
              to="/login"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                border: 'none', borderRadius: 8,
                background: '#1263d8', color: '#fff',
                padding: '10px 18px', fontWeight: 900, fontSize: 14,
                textDecoration: 'none', cursor: 'pointer',
              }}
            >
              Launch Portal
            </Link>
          </nav>

          {/* Mobile CTA */}
          <Link
            to="/login"
            className="md:hidden"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#1263d8', color: '#fff',
              padding: '9px 14px', borderRadius: 8, fontWeight: 900, fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Launch Portal
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section id="top" style={{
        position: 'relative', minHeight: 680, overflow: 'hidden', background: '#111827',
      }}>
        <h1 className="sr-only">IWILLBUILD — Construction Portal for Jobs, Estimates, Forms, Fleet and Dazza AI</h1>
        {/* Background overlay + SVG construction scene */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `
            linear-gradient(90deg,rgba(15,23,42,.94) 0%,rgba(15,23,42,.78) 45%,rgba(15,23,42,.30) 100%),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='900' viewBox='0 0 1600 900'%3E%3Cdefs%3E%3ClinearGradient id='sky' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23e0f2fe'/%3E%3Cstop offset='1' stop-color='%2394a3b8'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1600' height='900' fill='url(%23sky)'/%3E%3Crect x='0' y='570' width='1600' height='330' fill='%23d9b48f'/%3E%3Crect x='910' y='250' width='430' height='320' fill='%23f8fafc' stroke='%2394a3b8' stroke-width='8'/%3E%3Crect x='950' y='295' width='120' height='100' fill='%23bfdbfe'/%3E%3Crect x='1105' y='295' width='120' height='100' fill='%23bfdbfe'/%3E%3Crect x='1025' y='430' width='130' height='140' fill='%2394a3b8'/%3E%3Cpath d='M870 250 L1125 90 L1380 250 Z' fill='%230f172a'/%3E%3Crect x='180' y='610' width='430' height='34' fill='%23475569'/%3E%3Crect x='235' y='545' width='210' height='65' fill='%23facc15'/%3E%3Ccircle cx='275' cy='650' r='48' fill='%23111827'/%3E%3Ccircle cx='495' cy='650' r='48' fill='%23111827'/%3E%3Cpath d='M620 570 C760 520 850 600 980 555 C1120 505 1250 535 1430 500' stroke='%231263d8' stroke-width='18' fill='none' opacity='.45'/%3E%3C/svg%3E")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }} />

        <div style={{
          position: 'relative',
          maxWidth: 1180, margin: '0 auto',
          padding: '92px 22px 70px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) 420px',
          gap: 40,
          alignItems: 'end',
          minHeight: 680,
        }} className="hero-grid">
          {/* Left: copy */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            <motion.h1
              variants={fadeUp}
              style={{ fontSize: 'clamp(36px,5vw,60px)', lineHeight: 0.98, letterSpacing: '-0.045em', color: '#fff', margin: '0 0 18px', maxWidth: 760 }}
            >
              Construction jobs, estimates, forms, photos and fleet in one clean portal.
            </motion.h1>
            <motion.p variants={fadeUp} style={{ color: '#d7e2f3', fontSize: 20, lineHeight: 1.5, margin: '0 0 28px', maxWidth: 720 }}>
              IWILLBUILD is a practical local portal for builders and site teams. Keep the job file organised, approve estimates, track progress, complete forms, manage fleet prestarts and give Dazza AI the data it needs to help.
            </motion.p>
            <motion.div variants={fadeUp} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/login" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#1263d8', border: '1px solid #1263d8',
                borderRadius: 8, color: '#fff', padding: '13px 22px',
                fontWeight: 900, fontSize: 15, textDecoration: 'none',
              }}>
                Launch IWILLBUILD
              </Link>
              <Link to="/dazza-ai" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#0f172a', border: '1px solid #0f172a',
                borderRadius: 8, color: '#fff', padding: '13px 22px',
                fontWeight: 900, fontSize: 15, textDecoration: 'none',
              }}>
                Open Dazza AI
              </Link>
            </motion.div>
          </motion.div>

          {/* Right: login card */}
          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2, ease: 'easeOut' as const }}
            style={{
              background: 'rgba(255,255,255,0.96)',
              border: '1px solid rgba(255,255,255,0.72)',
              borderRadius: 10, padding: 22,
              boxShadow: '0 18px 46px rgba(17,24,39,.12)',
              alignSelf: 'center',
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 26 }}>Portal Access</h2>
            <p style={{ color: '#5f6f86', fontSize: 15, margin: '0 0 18px' }}>
              Email and password login is enabled. Default test users can be changed in Settings.
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <Link to="/login" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#1263d8', border: '1px solid #1263d8',
                borderRadius: 8, color: '#fff', padding: '13px 16px',
                fontWeight: 900, fontSize: 15, textDecoration: 'none',
              }}>
                Go to Login
              </Link>
              <Link to="/dazza-ai" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                border: '1px solid #ccd8e8', borderRadius: 8,
                background: '#fff', color: '#101828',
                padding: '13px 16px', fontWeight: 900, fontSize: 15,
                textDecoration: 'none',
                boxShadow: '0 2px 0 rgba(15,23,42,.04)',
              }}>
                Ask Dazza
              </Link>
            </div>
          </motion.aside>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ maxWidth: 1180, margin: '0 auto', padding: '54px 22px' }}>
        <h2 style={{ fontSize: 34, letterSpacing: '-0.03em', margin: '0 0 12px' }}>Built for the job file</h2>
        <p style={{ color: '#5f6f86', fontSize: 18, margin: '0 0 26px', maxWidth: 850 }}>
          The portal is designed around the way construction work actually moves: job setup, estimate, approval, progress, forms, photos, files and closeout.
        </p>
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              whileHover={{ y: -3, boxShadow: '0 16px 32px rgba(15,23,42,.12)' }}
              style={{
                background: '#fff', border: '1px solid #ccd8e8',
                borderRadius: 8, padding: 20,
                boxShadow: '0 10px 28px rgba(15,23,42,.07)',
                cursor: 'default',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: '#eaf2ff', color: '#1263d8',
                display: 'grid', placeItems: 'center',
                fontWeight: 900, marginBottom: 14, fontSize: 18,
              }}>
                {f.icon}
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 19 }}>{f.title}</h3>
              <p style={{ margin: 0, color: '#5f6f86', lineHeight: 1.45 }}>{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Dazza AI ── */}
      <section id="dazza" style={{ background: '#fff', borderTop: '1px solid #ccd8e8', borderBottom: '1px solid #ccd8e8' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '54px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 24, alignItems: 'center' }}>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} style={{ fontSize: 34, letterSpacing: '-0.03em', margin: '0 0 12px' }}>
              Dazza AI grows with the data
            </motion.h2>
            <motion.p variants={fadeUp} style={{ color: '#5f6f86', fontSize: 18, margin: '0 0 26px', maxWidth: 850 }}>
              Dazza is young and still learning. The more useful data you put into IWILLBUILD, the smarter he becomes. He can summarise jobs, check estimates, review forms, flag data gaps and learn reference files.
            </motion.p>
            <motion.div variants={fadeUp} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/dazza-ai" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#0f172a', border: '1px solid #0f172a',
                borderRadius: 8, color: '#fff', padding: '13px 22px',
                fontWeight: 900, fontSize: 15, textDecoration: 'none',
              }}>
                Open Dazza AI
              </Link>
              <Link to="/login" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                border: '1px solid #ccd8e8', borderRadius: 8,
                background: '#fff', color: '#101828',
                padding: '13px 22px', fontWeight: 900, fontSize: 15,
                textDecoration: 'none',
                boxShadow: '0 2px 0 rgba(15,23,42,.04)',
              }}>
                Launch Portal
              </Link>
            </motion.div>
          </motion.div>

          {/* Chat preview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, ease: 'easeOut' as const }}
            style={{
              background: '#0f172a', borderRadius: 10, padding: 18,
              color: '#fff', boxShadow: '0 18px 46px rgba(17,24,39,.12)',
            }}
          >
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Dazza AI</div>
            {[
              { user: false, text: 'Hi, I am Dazza AI help bot. I am young and still learning. We will grow together.' },
              { user: true, text: 'Run a data health check.' },
              { user: false, text: 'I can check jobs, estimates, forms, fleet, users and files for missing or messy data.' },
            ].map((b, i) => (
              <div key={i} style={{
                background: b.user ? '#1263d8' : '#1e293b',
                border: '1px solid #334155',
                borderRadius: 16, padding: '13px 14px',
                margin: '10px 0', lineHeight: 1.4, fontSize: 14,
                marginLeft: b.user ? 52 : 0,
              }}>
                {b.text}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Workflow ── */}
      <section id="workflow" style={{ maxWidth: 1180, margin: '0 auto', padding: '54px 22px' }}>
        <h2 style={{ fontSize: 34, letterSpacing: '-0.03em', margin: '0 0 12px' }}>Simple launch workflow</h2>
        <p style={{ color: '#5f6f86', fontSize: 18, margin: '0 0 26px', maxWidth: 850 }}>
          Start clean, keep the records linked, and let Dazza help spot what needs attention.
        </p>
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}
        >
          {workflow.map((w) => (
            <motion.div
              key={w.n}
              variants={fadeUp}
              style={{
                background: '#fff', border: '1px solid #ccd8e8',
                borderRadius: 8, padding: 20,
                boxShadow: '0 10px 28px rgba(15,23,42,.07)',
              }}
            >
              <h3 style={{ margin: '0 0 8px', fontSize: 19 }}>{w.n}. {w.title}</h3>
              <p style={{ margin: 0, color: '#5f6f86', lineHeight: 1.45 }}>{w.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ padding: '28px 22px', borderTop: '1px solid #ccd8e8', background: '#fff', color: '#5f6f86' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <strong style={{ color: '#101828' }}>IWILLBUILD</strong>
          <span>Local clean block portal. Built for practical construction management.</span>
        </div>
      </footer>

      {/* Responsive hero grid fix */}
      <style>{`
        @media (max-width: 900px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

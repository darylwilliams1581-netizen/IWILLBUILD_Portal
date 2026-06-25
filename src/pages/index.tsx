import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import {
  Download,
  FileText,
  Check,
  Briefcase,
  Truck,
  Calculator,
  FileEdit,
  Images,
  FolderOpen,
  ShieldCheck,
  BookOpen,
  ArrowRight,
  Link2,
  Cloud,
  BotOff,
} from 'lucide-react';

const features = [
  {
    icon: Briefcase,
    title: 'Jobs & Progress',
    desc: 'Full job register, to-do lists, notes, photo linking, and live progress tracking against approved estimates.',
    color: 'bg-blue-100 text-blue-600',
  },
  {
    icon: Truck,
    title: 'Fleet & Daily Prestarts',
    desc: 'Asset register, daily prestart logging with issue flagging, service tracking, and dashboard attention items.',
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: Calculator,
    title: 'Estimating & Recipes',
    desc: 'Cost guide, reusable recipe packs, line items, markup, GST, and approved estimates that feed job progress.',
    color: 'bg-amber-100 text-amber-600',
  },
  {
    icon: FileEdit,
    title: 'Powerful Form Builder',
    desc: 'Drag-and-drop forms with conditional logic, signatures, media capture, map pickers, and role-based routing.',
    color: 'bg-violet-100 text-violet-600',
  },
  {
    icon: Images,
    title: 'Photos & Documentation',
    desc: 'Job-linked photos with labels, drag-and-drop organisation, and clean export for reports and records.',
    color: 'bg-sky-100 text-sky-600',
  },
  {
    icon: FolderOpen,
    title: 'File Register',
    desc: 'Structured file management mapped to your SharePoint/OneDrive folders with job linking and status tracking.',
    color: 'bg-teal-100 text-teal-600',
  },
];

const steps = [
  { n: '1', title: 'Download', desc: 'Get the latest Clean Blocks + Dazza files' },
  { n: '2', title: 'Open in browser', desc: 'Works on any modern browser. No install needed.' },
  { n: '3', title: 'Use on real jobs', desc: 'Track jobs, fleet, estimates and forms. Works offline.' },
  { n: '4', title: 'Teach Dazza', desc: "Load your rates and reference PDFs safely when you're ready." },
];

const problems = [
  {
    icon: Link2,
    title: 'Fragmented tools',
    desc: 'Jobs in one app, photos in another, safety forms in a third, estimating in a spreadsheet. Nothing talks to each other.',
  },
  {
    icon: Cloud,
    title: 'Cloud lock-in',
    desc: "Your critical project data lives on someone else's servers. Expensive subscriptions. No offline access when you need it most.",
  },
  {
    icon: BotOff,
    title: "AI that can't be trusted",
    desc: "Generic AI tools that hallucinate on construction details and can't safely learn your rates, processes, or documents.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
} as const;

export default function HomePage() {
  const site = 'https://iwillbuild.com.au';
  const title = 'IWILLBUILD — Practical Construction Management for Builders & Site Teams';
  const description =
    'A powerful local-first system for jobs, fleet, estimating, forms and photos — with a controlled AI assistant that learns safely from your data and documents.';

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
    <div className="bg-slate-50 text-slate-800 font-sans">
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

      {/* ── Nav ── */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-[#1263d8] to-[#0f8b8d] rounded-xl flex items-center justify-center shrink-0">
                <span className="text-white font-black text-2xl tracking-tighter">IW</span>
              </div>
              <span className="font-black text-2xl tracking-tight">IWILLBUILD</span>
            </div>

            {/* Links */}
            <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
              <a href="#features" className="hover:text-[#1263d8] transition-colors">Features</a>
              <a href="#dazza" className="hover:text-[#1263d8] transition-colors">Dazza AI</a>
              <a href="#how" className="hover:text-[#1263d8] transition-colors">How it Works</a>
              <a href="#whitepaper" className="hover:text-[#1263d8] transition-colors">White Paper</a>
            </div>

            {/* CTAs */}
            <div className="flex items-center gap-3">
              <a
                href="#download"
                className="hidden sm:inline-flex items-center px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl text-sm transition-all"
              >
                Download
              </a>
              <a
                href="#download"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#1263d8] hover:bg-[#0f4aa8] text-white font-bold rounded-2xl text-sm transition-all shadow-lg shadow-blue-500/30"
              >
                Start Free Trial
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
        <h1 className="sr-only">IWILLBUILD — Practical Construction Management for Builders & Site Teams</h1>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-1.5 mb-6 text-sm font-semibold shadow-sm">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse inline-block" />
            <span className="text-slate-600">Now in public trial · Version 95</span>
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-6">
            Construction management<br />
            that actually works<br />
            <span className="bg-gradient-to-r from-[#1263d8] to-[#0f8b8d] bg-clip-text text-transparent">
              in the field.
            </span>
          </motion.h1>

          <motion.p variants={fadeUp} className="max-w-2xl mx-auto text-xl text-slate-600 mb-10">
            A powerful local-first system for jobs, fleet, estimating, forms and photos —
            with a controlled AI assistant that learns safely from your data and documents.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#download"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-9 py-4 bg-[#1263d8] hover:bg-[#0f4aa8] text-white font-black text-lg rounded-3xl transition-all shadow-xl shadow-blue-500/40"
            >
              <Download size={20} />
              Download Free Trial
            </a>
            <a
              href="#whitepaper"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 bg-white border-2 border-slate-300 hover:bg-slate-50 font-bold text-lg rounded-3xl transition-all"
            >
              <FileText size={20} />
              Read the White Paper
            </a>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            {['Works offline', 'Saves to your OneDrive / SharePoint', 'No subscription required to try'].map((t) => (
              <div key={t} className="flex items-center gap-2">
                <Check size={14} className="text-emerald-500" />
                <span>{t}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ── Trust bar ── */}
      <div className="border-y border-slate-200 bg-white py-5">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-sm font-semibold text-slate-500 tracking-wider">BUILT BY BUILDERS, FOR BUILDERS</p>
        </div>
      </div>

      {/* ── Problem ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-black tracking-tight mb-3">The tools most contractors use are broken.</h2>
          <p className="text-lg text-slate-600 max-w-md mx-auto">Too many disconnected apps. Data trapped in the cloud. Nothing works properly offline on regional jobs.</p>
        </div>
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {problems.map((p) => (
            <motion.div key={p.title} variants={fadeUp} className="bg-white border border-slate-200 rounded-3xl p-7">
              <div className="text-red-500 mb-4">
                <p.icon size={32} />
              </div>
              <h3 className="font-bold text-xl mb-2">{p.title}</h3>
              <p className="text-slate-600">{p.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Solution ── */}
      <section id="features" className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="flex-1">
              <h2 className="text-5xl font-black tracking-tighter leading-none mb-6">
                One practical system.<br />Built for how you actually work.
              </h2>
              <p className="text-xl text-slate-600">
                IWILLBUILD is a complete construction management platform that runs locally in your browser and saves directly to your OneDrive or SharePoint.
              </p>
            </div>
            <div className="flex-1">
              <div className="bg-slate-900 text-white rounded-3xl p-8 text-sm leading-relaxed">
                <div className="font-mono text-emerald-400 text-xs tracking-[3px] mb-3">NO CLOUD LOCK-IN · WORKS OFFLINE · YOUR DATA</div>
                <p className="text-slate-300">
                  Clean Blocks gives you jobs, fleet prestarts, estimating with reusable recipes, a powerful form builder with signatures and media, photo management, and a structured file register — all in one clean interface.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-center text-4xl font-black tracking-tight mb-12">Everything you need on site and in the office</h2>
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              whileHover={{ y: -4, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
              className="bg-white border border-slate-200 rounded-3xl p-7 cursor-default transition-shadow duration-150"
            >
              <div className={`w-12 h-12 ${f.color} rounded-2xl flex items-center justify-center mb-5`}>
                <f.icon size={22} />
              </div>
              <h3 className="font-bold text-2xl mb-2">{f.title}</h3>
              <p className="text-slate-600">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Dazza AI ── */}
      <section id="dazza" className="bg-gradient-to-br from-slate-900 to-slate-950 text-white py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="flex-1"
            >
              <motion.div variants={fadeUp} className="inline-block bg-white/10 text-white text-xs font-bold tracking-[2px] px-4 py-1.5 rounded-full mb-4">
                CONTROLLED AI
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-5xl font-black tracking-tighter mb-6">
                Dazza AI.<br />Smart, but never in charge.
              </motion.h2>
              <motion.p variants={fadeUp} className="text-xl text-slate-300 mb-8">
                Dazza is your construction-aware assistant that reads your live project data and can be safely extended with new capabilities.
              </motion.p>
              <motion.div variants={stagger} className="flex flex-col gap-4">
                <motion.div variants={fadeUp} className="flex gap-4">
                  <ShieldCheck size={22} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold">Passcode protected learning</div>
                    <div className="text-slate-400 text-sm">Only you (or people you trust) can add new capabilities using the passcode gate.</div>
                  </div>
                </motion.div>
                <motion.div variants={fadeUp} className="flex gap-4">
                  <BookOpen size={22} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold">Two safe learning paths</div>
                    <div className="text-slate-400 text-sm"><strong>/update</strong> for structured rate packs & calculators · <strong>/learn</strong> for PDFs, guides, NCC docs, SWMS and policies.</div>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>

            <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl p-8 text-sm">
              <div className="font-mono text-xs text-emerald-400 tracking-widest mb-4">WHAT DAZZA CAN DO TODAY</div>
              <ul className="flex flex-col gap-3 text-slate-200">
                {[
                  'Summarise any job with estimates, todos, photos and forms',
                  'Find fleet assets needing attention or overdue rego',
                  'Help build and check estimates using your loaded rates',
                  'Review form completeness and suggest improvements',
                  'Point to the right reference documents you\'ve taught it',
                  'Run data health checks before things go wrong',
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <ArrowRight size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-center text-4xl font-black tracking-tight mb-3">Simple. Local. Yours.</h2>
        <p className="text-center text-xl text-slate-600 mb-12 max-w-md mx-auto">Get started in under 2 minutes. No account creation required.</p>
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6"
        >
          {steps.map((s) => (
            <motion.div key={s.n} variants={fadeUp} className="text-center">
              <div className="mx-auto w-14 h-14 bg-[#1263d8] text-white rounded-2xl flex items-center justify-center text-2xl font-black mb-4">
                {s.n}
              </div>
              <div className="font-bold mb-1">{s.title}</div>
              <div className="text-sm text-slate-600">{s.desc}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── White Paper ── */}
      <section id="whitepaper" className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-block bg-amber-100 text-amber-700 text-xs font-black tracking-wider px-4 py-1 rounded-full mb-4">DEEP DIVE</div>
          <h2 className="text-4xl font-black tracking-tight mb-4">Read the IWILLBUILD White Paper</h2>
          <p className="text-lg text-slate-600 max-w-lg mx-auto mb-8">
            Understand the full philosophy, architecture, and controlled AI approach behind the system.
          </p>
          <a
            href="/downloads"
            className="inline-flex items-center gap-3 px-8 py-4 bg-slate-900 hover:bg-black text-white font-bold rounded-3xl text-lg transition-all"
          >
            <Download size={20} />
            Download White Paper (PDF)
          </a>
          <p className="text-xs text-slate-500 mt-3">Also available inside the app under Help</p>
        </div>
      </section>

      {/* ── Download CTA ── */}
      <section id="download" className="max-w-4xl mx-auto px-6 py-20 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="text-5xl font-black tracking-tighter mb-4">
            Ready to try it on your next job?
          </motion.h2>
          <motion.p variants={fadeUp} className="text-xl text-slate-600 mb-10">
            Download the latest version and start using it today. No credit card. No account. Just results.
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/downloads"
              className="inline-flex items-center justify-center gap-3 px-10 py-5 bg-[#1263d8] hover:bg-[#0f4aa8] text-white font-black text-xl rounded-3xl transition-all shadow-2xl shadow-blue-500/40"
            >
              <Download size={22} />
              Download Clean Blocks v95 + Dazza
            </Link>
          </motion.div>
          <motion.p variants={fadeUp} className="mt-6 text-sm text-slate-500">
            Works on Windows, Mac, and modern browsers · Saves to your existing OneDrive/SharePoint
          </motion.p>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 text-slate-400 py-12 text-sm">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-[#1263d8] to-[#0f8b8d] rounded-xl flex items-center justify-center shrink-0">
                <span className="text-white font-black text-base tracking-tighter">IW</span>
              </div>
              <span className="text-white font-black text-xl tracking-tight">IWILLBUILD</span>
            </div>
            <p className="max-w-xs">Practical construction management for builders who want control, simplicity, and tools that actually work on site.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
            {[
              { heading: 'Product', links: ['Features', 'Dazza AI', 'White Paper', 'Roadmap'] },
              { heading: 'Resources', links: ['Getting Started', 'Help Centre', 'Community'] },
              { heading: 'Company', links: ['Built by builders', 'Contact', 'Feedback'] },
            ].map((col) => (
              <div key={col.heading}>
                <div className="font-bold text-white mb-3">{col.heading}</div>
                <div className="flex flex-col gap-1.5">
                  {col.links.map((l) => (
                    <span key={l} className="hover:text-white cursor-pointer transition-colors">{l}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 mt-12 pt-8 border-t border-white/10 text-xs flex flex-col md:flex-row justify-between gap-2">
          <div>© 2026 IWILLBUILD. Built with care in Queensland, Australia.</div>
          <div className="flex gap-5">
            <span className="hover:text-white cursor-pointer transition-colors">Privacy</span>
            <span className="hover:text-white cursor-pointer transition-colors">Terms</span>
            <span className="hover:text-white cursor-pointer transition-colors">Local-first by design</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

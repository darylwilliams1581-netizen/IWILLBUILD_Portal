import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

const LAST_UPDATED = 'June 2026';

export default function PrivacyPage() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy — IWILLBUILD</title>
        <meta name="description" content="How IWILLBUILD collects, uses and protects your data. Read our privacy policy." />
        <link rel="canonical" href="https://iwillbuild.com/privacy" />
        <meta property="og:title" content="Privacy Policy — IWILLBUILD" />
        <meta property="og:description" content="How IWILLBUILD collects, uses and protects your data." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/privacy" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>

        {/* ── Nav bar ── */}
        <header style={{ borderBottom: '1px solid #1e293b', padding: '0 24px' }}>
          <div style={{ maxWidth: 860, margin: '0 auto', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <span style={{
                width: 32, height: 32, borderRadius: 7,
                background: 'linear-gradient(135deg,#1263d8,#0f8aa8)',
                display: 'grid', placeItems: 'center',
                color: '#fff', fontWeight: 900, fontSize: 13, flexShrink: 0,
              }}>IW</span>
              <strong style={{ color: '#f1f5f9', fontSize: 15 }}>IWILLBUILD</strong>
            </Link>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', textDecoration: 'none', fontSize: 14 }}
              className="hover:text-white transition-colors">
              <ArrowLeft size={15} />
              Back to home
            </Link>
          </div>
        </header>

        {/* ── Hero ── */}
        <div style={{ borderBottom: '1px solid #1e293b', padding: '48px 24px 40px' }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1e3a5f', display: 'grid', placeItems: 'center' }}>
                <Shield size={20} color="#60a5fa" />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Privacy Policy</span>
            </div>
            <h1 style={{ fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, color: '#f1f5f9', margin: '0 0 12px', lineHeight: 1.2 }}>
              Your data, handled with care
            </h1>
            <p style={{ color: '#94a3b8', fontSize: 15, margin: 0 }}>Last updated: {LAST_UPDATED} &nbsp;·&nbsp; IWILLBUILD, Queensland, Australia</p>
          </div>
        </div>

        {/* ── Content ── */}
        <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px 80px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

            <Section title="1. Who we are">
              <p>IWILLBUILD is a construction and job management software platform operated from Queensland, Australia. We provide a portal for builders, contractors and field teams to manage jobs, estimates, forms, safety records, fleet, files and more.</p>
              <p>For privacy enquiries, contact us at <a href="mailto:support@iwillbuild.com" style={{ color: '#f97316' }}>support@iwillbuild.com</a>.</p>
            </Section>

            <Section title="2. What data we collect">
              <p>When you create an account and use IWILLBUILD, we collect:</p>
              <ul>
                <li><strong>Account details</strong> — name, email address, password (hashed), phone number, and PIN (hashed) if set.</li>
                <li><strong>Company details</strong> — business name, ABN, address, and company settings you configure.</li>
                <li><strong>Job and project data</strong> — job names, addresses, notes, status, assigned team members, dates, and related records.</li>
                <li><strong>Estimates and invoices</strong> — line items, pricing, GST, payment history, and invoice status.</li>
                <li><strong>Forms and safety records</strong> — completed forms, SWMS, site safety plans, policies, and any data entered by your team.</li>
                <li><strong>Fleet data</strong> — vehicle records, registrations, and maintenance notes you enter.</li>
                <li><strong>Files and photos</strong> — documents, images, and attachments uploaded through the portal.</li>
                <li><strong>Usage data</strong> — pages visited, actions taken, and session information used to operate and improve the service.</li>
              </ul>
            </Section>

            <Section title="3. How we use your data">
              <p>We use your data to:</p>
              <ul>
                <li>Operate and deliver the IWILLBUILD portal and its features.</li>
                <li>Provide customer support and respond to enquiries.</li>
                <li>Manage your subscription, billing, and account status.</li>
                <li>Secure your account and detect unauthorised access.</li>
                <li>Improve the platform, fix bugs, and develop new features.</li>
                <li>Send transactional emails such as password resets and account notifications.</li>
              </ul>
              <p>We do not sell your data to third parties or use it for advertising.</p>
            </Section>

            <Section title="4. File and photo storage">
              <p>Files, photos, and documents you upload through the portal are stored in secure cloud storage. Storage may be provided by Cloudflare R2 or equivalent infrastructure. Data is stored in a manner consistent with industry security standards.</p>
              <p>Your company's files are isolated and are not accessible to other companies on the platform.</p>
            </Section>

            <Section title="5. Payment data and Stripe">
              <p>Subscription payments are processed by <strong>Stripe</strong>, a third-party payment processor. IWILLBUILD does not store your full card number, CVV, or other sensitive payment details. Stripe handles payment data under their own privacy policy and PCI-DSS compliance program.</p>
              <p>We store subscription status, plan information, and Stripe customer/subscription IDs to manage your account.</p>
            </Section>

            <Section title="6. Accounting integrations">
              <p>IWILLBUILD supports optional integrations with accounting platforms such as <strong>Xero</strong>. If you connect an integration, data such as approved invoices and customer contacts may be synced to that platform under your direction.</p>
              <p>You can disconnect integrations at any time from <strong>Settings → Integrations</strong>. Disconnecting stops future syncing; data already sent to the third-party platform is governed by their privacy policy.</p>
            </Section>

            <Section title="7. Data access and permissions">
              <p>IWILLBUILD is company-scoped. Users only see data that belongs to their company and that they have permission to access based on their role (Owner, Admin, or Team Member). Owners can manage team access from the portal settings.</p>
            </Section>

            <Section title="8. Data retention and deletion">
              <p>We retain your data for as long as your account is active or as needed to provide the service. If you cancel your subscription, your data may be retained for a period to allow account recovery, after which it may be deleted.</p>
              <p>You can request correction or deletion of your personal data by contacting <a href="mailto:support@iwillbuild.com" style={{ color: '#f97316' }}>support@iwillbuild.com</a>. Deletion requests are subject to any legal or business record-keeping requirements that may apply.</p>
            </Section>

            <Section title="9. Security">
              <p>We take reasonable steps to protect your data, including encrypted connections (HTTPS), hashed passwords, rate limiting, and access controls. No system is completely secure, and we encourage you to use a strong password and keep your login details private.</p>
            </Section>

            <Section title="10. Cookies and session data">
              <p>IWILLBUILD uses session cookies to keep you logged in. We may also use minimal analytics to understand how the platform is used. We do not use third-party advertising cookies.</p>
            </Section>

            <Section title="11. Changes to this policy">
              <p>This is a general privacy statement and may be updated as the platform evolves. We will note the updated date at the top of this page. Continued use of the platform after changes constitutes acceptance of the updated policy.</p>
            </Section>

            <Section title="12. Contact">
              <p>For any privacy questions or requests, contact us at:</p>
              <p>
                <strong style={{ color: '#f1f5f9' }}>IWILLBUILD</strong><br />
                Queensland, Australia<br />
                ABN 89 791 350 823<br />
                <a href="mailto:support@iwillbuild.com" style={{ color: '#f97316' }}>support@iwillbuild.com</a>
              </p>
            </Section>

          </div>
        </main>

        {/* ── Footer ── */}
        <footer style={{ borderTop: '1px solid #1e293b', padding: '24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            <Link to="/" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13 }} className="hover:text-white transition-colors">Home</Link>
            <Link to="/privacy" style={{ color: '#f97316', textDecoration: 'none', fontSize: 13 }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13 }} className="hover:text-white transition-colors">Terms of Use</Link>
            <Link to="/login" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13 }} className="hover:text-white transition-colors">Sign In</Link>
          </div>
          <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>© {new Date().getFullYear()} IWILLBUILD · ABN 89 791 350 823 · Queensland, Australia</p>
        </footer>

      </div>
    </>
  );
}

// ── Reusable section wrapper ──────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: '0 0 14px', paddingBottom: 10, borderBottom: '1px solid #1e293b' }}>
        {title}
      </h2>
      <div style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.75, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </section>
  );
}

import { system_policy } from 'virtual:content';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from "react-router";
import { ArrowLeft, Cpu } from 'lucide-react';

const VERSION = '1.0';
const EFFECTIVE_DATE = '3 September 2026';
const LAST_UPDATED = '3 September 2026';

function PolicyFooter({ active }: { active: string }) {
  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/terms', label: 'Terms of Use' },
    { to: '/privacy', label: 'Privacy Policy' },
    { to: '/fair-use', label: 'Fair Use Policy' },
    { to: '/system-policy', label: 'System Policy' },
    { to: '/login', label: 'Sign In' },
  ];
  return (
    <footer className="border-t border-border px-6 py-6 text-center">
      <div className="flex justify-center gap-5 flex-wrap mb-3">
        {system_policy.navLinks.map(l => (
          <Link key={l.to} to={l.to}
            className={`text-sm no-underline transition-colors hover:text-foreground ${l.label === active ? 'text-primary' : 'text-muted-foreground'}`}>
            {l.label}
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground m-0">
        © {new Date().getFullYear()} IWILLBUILD · ABN 89 791 350 823 · Queensland, Australia
      </p>
    </footer>
  );
}

export default function SystemPolicyPage() {
  return (
    <>
      <Helmet>
        <title>System Policy — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD System Policy — rules governing AI-assisted tools, automated features, data handling and platform security." />
        <link rel="canonical" href="https://iwillbuild.com/system-policy" />
        <meta property="og:title" content="System Policy — IWILLBUILD" />
        <meta property="og:description" content="Rules governing AI-assisted tools, automated features, data handling and platform security on IWILLBUILD." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/system-policy" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': 'https://iwillbuild.com/system-policy#webpage',
          name: 'System Policy — IWILLBUILD',
          url: 'https://iwillbuild.com/system-policy',
          description: 'Rules governing AI-assisted tools, automated features, data handling and platform security on IWILLBUILD.',
          isPartOf: { '@id': 'https://iwillbuild.com/#website' },
          about: { '@id': 'https://iwillbuild.com/#organization' },
          dateModified: '2026-09-03',
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

        <header className="border-b border-border px-6">
          <div className="max-w-3xl mx-auto h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 no-underline">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground font-black text-sm shrink-0 bg-primary">IW</span>
              <strong className="text-foreground text-sm">IWILLBUILD</strong>
            </Link>
            <Link to="/" className="flex items-center gap-1.5 text-muted-foreground no-underline text-sm hover:text-foreground transition-colors">
              <ArrowLeft size={15} />Back to home
            </Link>
          </div>
        </header>

        <div className="border-b border-border px-6 py-12">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Cpu size={20} className="text-accent" />
              </div>
              <span className="text-xs font-bold text-accent uppercase tracking-widest">System Policy</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3 leading-tight">System Policy</h1>
            <p className="text-muted-foreground text-sm m-0">
              Version {VERSION} &nbsp;·&nbsp; Effective: {EFFECTIVE_DATE} &nbsp;·&nbsp; Last updated: {LAST_UPDATED}
            </p>
            <p className="text-muted-foreground text-xs mt-2 m-0">
              Operator: IWILLBUILD (ABN 89 791 350 823), Queensland, Australia
            </p>
          </div>
        </div>

        <main className="max-w-3xl mx-auto px-6 py-12 pb-20">
          <div className="flex flex-col gap-10">

            <Section title="1. Purpose and scope">
              <p>This System Policy governs the operation of IWILLBUILD's platform systems, including AI-assisted tools, automated features, data handling, security controls and the Image Safeguard Protocol. It supplements the <Link to="/terms" className="text-primary hover:text-primary/80">Terms of Use</Link>, <Link to="/privacy" className="text-primary hover:text-primary/80">Privacy Policy</Link> and <Link to="/fair-use" className="text-primary hover:text-primary/80">Fair Use Policy</Link>.</p>
              <p>This Policy applies to all users of the Service and to IWILLBUILD's own operation of platform systems.</p>
            </Section>

            <Section title="2. AI-assisted tools — Dazza AI and related features">
              <p>IWILLBUILD provides AI-assisted tools (including Dazza AI) to help authorised users search, draft, extract, classify, summarise and analyse information they are already authorised to access.</p>
              <p><strong className="text-foreground">What AI tools do:</strong></p>
              <ul>
                <li>Generate suggestions, summaries, drafts and analysis based on information in the user's workspace.</li>
                <li>Assist with document creation, form completion, safety record review and job management tasks.</li>
                <li>Operate within the user's existing role permissions — AI tools cannot access data the user cannot access.</li>
              </ul>
              <p><strong className="text-foreground">What AI tools do not do:</strong></p>
              <ul>
                <li>Make final decisions on safety, legal, financial, employment or compliance matters without human review.</li>
                <li>Replace professional advice from qualified lawyers, accountants, engineers or safety professionals.</li>
                <li>Guarantee accuracy, completeness or suitability of any output.</li>
                <li>Access data outside the user's authorised workspace.</li>
              </ul>
              <p><strong className="text-foreground">User obligations:</strong></p>
              <ul>
                <li>A competent person must review all AI-assisted outputs before relying on them for any consequential decision.</li>
                <li>AI-generated safety documents, SWMS and risk assessments must be reviewed and approved by a qualified person before use on any worksite.</li>
                <li>Users must not use AI tools to generate content that would breach the <Link to="/fair-use" className="text-primary hover:text-primary/80">Fair Use Policy</Link> or applicable law.</li>
              </ul>
            </Section>

            <Section title="3. Automated decisions">
              <p>IWILLBUILD does not use automated tools alone to make decisions that could significantly affect a person's legal rights or interests, including decisions about employment, credit, discipline or legal entitlements.</p>
              <p>Where the platform uses automated processes (such as subscription status checks, access controls or security rate limiting), these are operational system functions, not decisions about individual rights.</p>
              <p>From 10 December 2026, Australian privacy law requires additional disclosures where a computer program uses personal information to make, or do something substantially and directly related to making, a decision reasonably expected to significantly affect a person's rights or interests. If IWILLBUILD introduces such a use, this Policy and the Privacy Policy will be updated before that use begins.</p>
            </Section>

            <Section title="4. AI training and data use">
              <p>IWILLBUILD does not use customer job records, photos, SWMS, field data or other customer content to train public AI foundation models.</p>
              <p>Where a third-party AI provider is used to deliver a platform feature, IWILLBUILD seeks contractual terms that prevent the provider from using customer content to train its general models unless the customer has clearly agreed otherwise.</p>
              <p>Aggregated, de-identified usage data (such as feature interaction patterns) may be used to improve platform reliability and features. This data does not identify individual users or organisations.</p>
            </Section>

            <Section title="5. Image Safeguard Protocol — system operation">
              <p>The Image Safeguard Protocol is a periodic, bounded review process initiated manually by an authorised IWILLBUILD platform owner. It is not a continuous automated surveillance system.</p>
              <p><strong className="text-foreground">How it works:</strong></p>
              <ul>
                <li>A platform owner manually initiates a bounded scan of a selected set of uploaded job photos.</li>
                <li>Software analyses images to detect the apparent presence of a face and records a neutral privacy signal.</li>
                <li>Signals are reviewed by authorised IWILLBUILD support personnel before any action is taken.</li>
                <li>Temporary working copies of images are deleted after processing.</li>
              </ul>
              <p><strong className="text-foreground">What the system does not do:</strong></p>
              <ul>
                <li>Identify, name or profile any person.</li>
                <li>Determine age, ethnicity, emotion, health status, legality or appropriateness of content.</li>
                <li>Automatically delete, quarantine, report or block images based on a signal alone.</li>
                <li>Disable user accounts or block ordinary photo capture based on a signal alone.</li>
                <li>Operate continuously or without manual initiation by an authorised platform owner.</li>
              </ul>
              <p><strong className="text-foreground">Data retained:</strong> internal asset reference, company and user identifiers where reliably known, timestamps, detector version, approximate face count, outcome and review record. Records are retained only as long as reasonably needed for security, accountability, dispute handling and legal obligations.</p>
              <p>The automated signal alone is not treated as proof of any breach and does not itself trigger a report to authorities. Where review identifies a credible concern, access is limited to authorised personnel and any further action follows applicable law and internal procedures.</p>
            </Section>

            <Section title="6. Security systems">
              <p>IWILLBUILD operates the following security controls as part of normal platform operation:</p>
              <ul>
                <li><strong className="text-foreground">Authentication controls</strong> — password hashing (scrypt for new accounts), optional two-factor authentication (TOTP and SMS), backup codes, and session management with configurable expiry.</li>
                <li><strong className="text-foreground">Rate limiting</strong> — automated rate limits on login attempts, API calls and sensitive operations to reduce brute-force and abuse risk.</li>
                <li><strong className="text-foreground">Audit logging</strong> — sign-in history, key account actions and administrative operations are logged for security and accountability purposes.</li>
                <li><strong className="text-foreground">File validation</strong> — uploaded files are validated for type, size and content before storage. Magic-byte detection and upload policies are applied per namespace.</li>
                <li><strong className="text-foreground">Access isolation</strong> — each organisation's data is isolated. Users can only access data within their authorised organisation workspace and role permissions.</li>
                <li><strong className="text-foreground">Least-privilege storage</strong> — cloud storage credentials are scoped to minimum required permissions. Storage operations are routed through a single validated chokepoint.</li>
                <li><strong className="text-foreground">Encrypted transport</strong> — all web and app traffic uses HTTPS/TLS. Data at rest is protected by cloud provider encryption.</li>
              </ul>
            </Section>

            <Section title="7. Data storage and cloud infrastructure">
              <p>IWILLBUILD uses Cloudflare R2 (or equivalent cloud object storage) for file, photo and document storage. Data is stored using industry-standard security controls and is isolated per organisation.</p>
              <p>The platform is hosted on cloud infrastructure that may be located outside Australia. See the <Link to="/privacy" className="text-primary hover:text-primary/80">Privacy Policy</Link> (section 11) for overseas processing and disclosure details.</p>
              <p>IWILLBUILD does not provide a silent local storage fallback. If cloud storage credentials are unavailable or misconfigured, file operations will fail rather than silently store data in an insecure location.</p>
            </Section>

            <Section title="8. Third-party integrations and subprocessors">
              <p>The platform integrates with third-party services to deliver features. Current integrations include:</p>
              <ul>
                <li><strong className="text-foreground">Stripe</strong> — payment processing (PCI-DSS compliant; IWILLBUILD does not store card numbers or CVV).</li>
                <li><strong className="text-foreground">Twilio</strong> — SMS delivery for two-factor authentication and notifications.</li>
                <li><strong className="text-foreground">Xero / QuickBooks</strong> — accounting integration (enabled by authorised user; data synced at user direction).</li>
                <li><strong className="text-foreground">Google Maps</strong> — mapping and location features (enabled by authorised user).</li>
                <li><strong className="text-foreground">OpenAI</strong> — AI-assisted features (customer content is not used to train general models under our terms with the provider).</li>
                <li><strong className="text-foreground">Cloudflare</strong> — cloud storage, CDN and security infrastructure.</li>
              </ul>
              <p>Each integration is activated only when enabled by an authorised user or as required to operate the Service. Third-party terms and privacy policies apply to their services.</p>
            </Section>

            <Section title="9. Platform availability and maintenance">
              <p>IWILLBUILD aims to provide a reliable, available Service but does not guarantee uninterrupted operation. Planned maintenance, security patching, infrastructure updates and third-party outages may affect availability.</p>
              <p>Where planned maintenance will cause significant downtime, we will provide reasonable advance notice where practicable. Emergency security work may require immediate action without prior notice.</p>
            </Section>

            <Section title="10. Incident response">
              <p>IWILLBUILD maintains procedures for detecting, assessing and responding to security and privacy incidents. In the event of a suspected breach:</p>
              <ul>
                <li>We will assess the nature, scope and likely impact of the incident.</li>
                <li>Where a breach is likely to cause serious harm and notification is legally required, we will notify affected users and the relevant regulator (OAIC in Australia; Office of the Privacy Commissioner in New Zealand).</li>
                <li>We will take reasonable steps to contain and remediate the incident.</li>
                <li>We will document the incident and our response for accountability purposes.</li>
              </ul>
              <p>To report a suspected security vulnerability or incident, contact <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a> immediately.</p>
            </Section>

            <Section title="11. Apple App Store and Google Play compliance">
              <p>The IWILLBUILD iOS and Android applications are distributed through the Apple App Store and Google Play Store respectively. Use of these applications is also subject to the applicable app store terms of service.</p>
              <p>The applications request device permissions (camera, location, notifications, file access) only where required for specific features. Permission requests are explained in context before being requested. Users may manage or revoke permissions through their device settings at any time.</p>
              <p>The applications do not collect data beyond what is described in this Policy and the <Link to="/privacy" className="text-primary hover:text-primary/80">Privacy Policy</Link>. Data collected through the applications is handled consistently with data collected through the web portal.</p>
            </Section>

            <Section title="12. Changes to this Policy">
              <p>We may update this Policy when the Service, law, providers or security practices change. We will identify the version and effective date at the top of this page. Material changes will be communicated by email or in-product notice where appropriate.</p>
            </Section>

            <Section title="13. Contact">
              <p>
                <strong className="text-foreground">IWILLBUILD</strong><br />
                Queensland, Australia<br />
                ABN 89 791 350 823<br />
                <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a><br />
                <a href="https://www.iwillbuild.com" className="text-primary hover:text-primary/80">www.iwillbuild.com</a>
              </p>
            </Section>

          </div>
        </main>

        <PolicyFooter active="System Policy" />
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-foreground mb-3 pb-2.5 border-b border-border">
        {title}
      </h2>
      <div className="text-muted-foreground text-sm leading-relaxed flex flex-col gap-2.5">
        {children}
      </div>
    </section>
  );
}

import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from "react-router";
import { ArrowLeft, Scale } from 'lucide-react';

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
        {fair_use.navLinks.map(l => (
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

export default function FairUsePage() {
  return (
    <>
      <Helmet>
        <title>Fair Use Policy — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD Fair Use Policy — acceptable use standards for the construction and job-management platform." />
        <link rel="canonical" href="https://iwillbuild.com/fair-use" />
        <meta property="og:title" content="Fair Use Policy — IWILLBUILD" />
        <meta property="og:description" content="Acceptable use standards for the IWILLBUILD construction and job-management platform." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/fair-use" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': 'https://iwillbuild.com/fair-use#webpage',
          name: 'Fair Use Policy — IWILLBUILD',
          url: 'https://iwillbuild.com/fair-use',
          description: 'Acceptable use standards for the IWILLBUILD construction and job-management platform.',
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
              <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Scale size={20} className="text-secondary" />
              </div>
              <span className="text-xs font-bold text-secondary uppercase tracking-widest">Fair Use Policy</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3 leading-tight">Fair Use Policy</h1>
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

            <Section title="1. Purpose">
              <p>This Fair Use Policy sets out the standards IWILLBUILD expects of all users when using the Service. It supplements the <Link to="/terms" className="text-primary hover:text-primary/80">Terms of Use</Link> and should be read alongside the <Link to="/privacy" className="text-primary hover:text-primary/80">Privacy Policy</Link> and <Link to="/system-policy" className="text-primary hover:text-primary/80">System Policy</Link>.</p>
              <p>IWILLBUILD is a professional platform for construction organisations. We expect all users to act lawfully, honestly and with respect for others.</p>
            </Section>

            <Section title="2. Permitted use">
              <p>The Service is provided for legitimate construction, trade, and field-management business purposes, including:</p>
              <ul>
                <li>managing jobs, projects, sites, crews and schedules;</li>
                <li>creating, storing and sharing estimates, invoices, purchase orders and financial records;</li>
                <li>completing and storing safety documents, SWMS, risk assessments, pre-starts and incident records;</li>
                <li>capturing, uploading and sharing job-related photos, plans and documents;</li>
                <li>managing fleet, plant and assets;</li>
                <li>coordinating team communication and task management; and</li>
                <li>using AI-assisted tools to support authorised work tasks.</li>
              </ul>
            </Section>

            <Section title="3. Prohibited content">
              <p>You must not upload, create, store, transmit or share through the Service:</p>
              <ul>
                <li><strong className="text-foreground">Child sexual abuse material (CSAM)</strong> — any image, video or content that sexually exploits or abuses a child. This is a zero-tolerance rule. IWILLBUILD will report any detected CSAM to the Australian Federal Police and relevant authorities without notice.</li>
                <li><strong className="text-foreground">Non-consensual intimate images</strong> — images or videos of a person in a sexual or intimate context without their clear and informed consent (sometimes called "revenge porn" or image-based abuse).</li>
                <li><strong className="text-foreground">Unlawful content</strong> — content that is illegal under Australian, New Zealand or other applicable law, including content that incites violence, hatred or discrimination.</li>
                <li><strong className="text-foreground">Fraudulent records</strong> — falsified safety documents, forged signatures, fabricated incident records, or any records intended to deceive a regulator, insurer, client or other party.</li>
                <li><strong className="text-foreground">Malicious software</strong> — viruses, ransomware, spyware, trojans or any code designed to damage, disrupt or gain unauthorised access to systems.</li>
                <li><strong className="text-foreground">Unauthorised personal information</strong> — personal information about another person collected or used without a lawful basis, including surveillance images, tracking data or health information collected without authority.</li>
                <li><strong className="text-foreground">Intellectual property infringement</strong> — content that infringes copyright, trademarks, patents, trade secrets or other intellectual property rights.</li>
              </ul>
            </Section>

            <Section title="4. Responsible use of photos and images">
              <p>Photos are a core part of the Service. You must:</p>
              <ul>
                <li>capture and upload photos only for legitimate work-related purposes;</li>
                <li>ensure people shown in photos have been appropriately informed where required by law;</li>
                <li>not use the camera or photo features to surveil, harass or record people without authority;</li>
                <li>check recipients and context before sharing or emailing images; and</li>
                <li>comply with any sharing acknowledgement shown before images are emailed or shared.</li>
              </ul>
              <p>The IWILLBUILD Image Safeguard Protocol may periodically review uploaded job photos for privacy signals. See the <Link to="/privacy" className="text-primary hover:text-primary/80">Privacy Policy</Link> for full details.</p>
            </Section>

            <Section title="5. Account and access integrity">
              <p>You must:</p>
              <ul>
                <li>use only your own account and not share login credentials with others;</li>
                <li>not attempt to access another organisation's workspace or data without authorisation;</li>
                <li>not create accounts for the purpose of circumventing a suspension or ban;</li>
                <li>not impersonate another person, organisation or IWILLBUILD staff; and</li>
                <li>promptly report suspected unauthorised access to <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a>.</li>
              </ul>
            </Section>

            <Section title="6. Platform integrity">
              <p>You must not:</p>
              <ul>
                <li>attempt to probe, scan or test the vulnerability of the Service without written permission;</li>
                <li>attempt to bypass, disable or circumvent authentication, access controls or security features;</li>
                <li>use automated tools to scrape, harvest or extract data from the Service at scale;</li>
                <li>interfere with the availability or performance of the Service for other users; or</li>
                <li>resell, sublicense or provide access to the Service to third parties without a written agreement with IWILLBUILD.</li>
              </ul>
            </Section>

            <Section title="7. Workplace and professional standards">
              <p>IWILLBUILD is used in professional construction environments. You must:</p>
              <ul>
                <li>use the Service in a manner consistent with your workplace obligations and applicable laws;</li>
                <li>not use the Service to harass, bully, threaten or discriminate against colleagues, clients or other users;</li>
                <li>ensure safety documents, SWMS and risk assessments are reviewed and approved by a competent person before use on any worksite; and</li>
                <li>not misrepresent qualifications, licences, approvals or safety sign-offs.</li>
              </ul>
            </Section>

            <Section title="8. Data accuracy and record integrity">
              <p>You are responsible for the accuracy of data you enter into the Service. You must not:</p>
              <ul>
                <li>enter false or misleading job records, safety records, timesheets or financial data;</li>
                <li>forge or falsify signatures, approvals or acknowledgements; or</li>
                <li>manipulate records to conceal incidents, non-compliance or safety failures.</li>
              </ul>
            </Section>

            <Section title="9. Consequences of breach">
              <p>A breach of this Fair Use Policy may result in:</p>
              <ul>
                <li>a warning and request to remove or correct the offending content;</li>
                <li>temporary suspension of access to affected features or the account;</li>
                <li>permanent termination of the account;</li>
                <li>preservation of records and disclosure to relevant authorities where required or permitted by law; and</li>
                <li>civil or criminal liability under applicable law.</li>
              </ul>
              <p>Where urgent action is required to protect the safety of a person or the integrity of the platform, IWILLBUILD may act without prior notice. In other cases, we will give notice and a reasonable opportunity to respond before taking action.</p>
            </Section>

            <Section title="10. Reporting concerns">
              <p>If you become aware of content or conduct that may breach this Policy, please report it promptly to <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a>. We take all reports seriously and will investigate appropriately.</p>
              <p>Reports made in good faith will not result in adverse action against the reporter.</p>
            </Section>

            <Section title="11. Changes to this Policy">
              <p>We may update this Policy from time to time. We will identify the version and effective date at the top of this page. Material changes will be communicated by email or in-product notice where appropriate.</p>
            </Section>

            <Section title="12. Contact">
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

        <PolicyFooter active="Fair Use Policy" />
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

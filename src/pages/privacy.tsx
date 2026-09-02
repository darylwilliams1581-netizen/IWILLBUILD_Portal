import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from "react-router";
import { ArrowLeft, Shield } from 'lucide-react';

const VERSION = '2.0';
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
        {privacy.navLinks.map(l => (
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

export default function PrivacyPage() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy — IWILLBUILD</title>
        <meta name="description" content="How IWILLBUILD collects, uses, discloses and protects your personal information. Version 2.0 — effective 3 September 2026." />
        <link rel="canonical" href="https://iwillbuild.com/privacy" />
        <meta property="og:title" content="Privacy Policy — IWILLBUILD" />
        <meta property="og:description" content="How IWILLBUILD collects, uses, discloses and protects your personal information." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/privacy" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': 'https://iwillbuild.com/privacy#webpage',
          name: 'Privacy Policy — IWILLBUILD',
          url: 'https://iwillbuild.com/privacy',
          description: 'How IWILLBUILD collects, uses, discloses and protects your personal information.',
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
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield size={20} className="text-primary" />
              </div>
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Privacy Policy</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3 leading-tight">Your data, handled with care</h1>
            <p className="text-muted-foreground text-sm m-0">
              Version {VERSION} &nbsp;·&nbsp; Effective: {EFFECTIVE_DATE} &nbsp;·&nbsp; Last updated: {LAST_UPDATED}
            </p>
            <p className="text-muted-foreground text-xs mt-2 m-0">
              Operator: IWILLBUILD (ABN 89 791 350 823), Queensland, Australia &nbsp;·&nbsp; Jurisdiction: Queensland, Australia; New Zealand provisions apply where relevant
            </p>
          </div>
        </div>

        <main className="max-w-3xl mx-auto px-6 py-12 pb-20">
          <div className="flex flex-col gap-10">

            <Section title="1. Who we are">
              <p>IWILLBUILD (ABN 89 791 350 823) is a construction and job-management software platform operated from Queensland, Australia (<strong className="text-foreground">we</strong>, <strong className="text-foreground">us</strong> or <strong className="text-foreground">our</strong>). This Policy explains how we collect, hold, use and disclose personal information when you use the IWILLBUILD website, web portal, progressive web app, iOS or Android application, and related services (together, the <strong className="text-foreground">Service</strong>).</p>
              <p>We aim to follow the Australian Privacy Principles in the <em>Privacy Act 1988</em> (Cth) and, for New Zealand users where applicable, the information privacy principles in the <em>Privacy Act 2020</em> (NZ).</p>
              <p>The <Link to="/terms" className="text-primary hover:text-primary/80">Terms of Use</Link> form the service contract. This Privacy Policy is a notice about information handling. Acknowledging this Policy does not waive privacy rights or create consent where the law requires a different lawful basis or express permission.</p>
            </Section>

            <Section title="2. Scope and roles">
              <p>This Policy covers account holders, organisation administrators, invited workers, people whose details appear in customer records, website visitors and people who contact us.</p>
              <p>Where you use IWILLBUILD through an employer, builder, principal or contractor, that organisation usually controls why business records are created and who may access them. IWILLBUILD processes those records to provide and secure the Service. The organisation's own privacy policy may also apply.</p>
              <p>Third-party sites and applications linked from the Service have their own privacy practices.</p>
            </Section>

            <Section title="3. Personal information we collect and hold">
              <ul>
                <li><strong className="text-foreground">Account and organisation information</strong> — name, email, phone, role, permissions, login and security records, organisation name, ABN or NZBN, address, branding, subscription and billing records.</li>
                <li><strong className="text-foreground">Job and operations information</strong> — job names, site addresses, contacts, crew assignments, schedules, notes, forms, timesheets, estimates, invoices, SWMS, pre-starts, incident records, signatures and acknowledgements.</li>
                <li><strong className="text-foreground">Photos, videos, files and documents</strong> — camera captures, uploads, watermarks, plan documents, attachments and connected-drive files where an authorised user enables an integration.</li>
                <li><strong className="text-foreground">Fleet and location information</strong> — vehicle and plant records, maintenance, map positions, approximate location and precise GPS where a user enables a location-dependent feature.</li>
                <li><strong className="text-foreground">Technical and usage information</strong> — IP address, device and browser type, operating system, app version, cookies, session data, sign-in history, audit logs, actions, diagnostics and crash reports.</li>
                <li><strong className="text-foreground">Support and safeguard information</strong> — enquiries, support communications, scan-run metadata, approximate face-count signals, review status, reviewer identity and factual review notes.</li>
              </ul>
            </Section>

            <Section title="4. Sensitive information and information about other people">
              <p>IWILLBUILD is not a health service and does not seek sensitive information for unrelated purposes. Construction safety and incident records may nevertheless contain injury details, health information, signatures or images of people. Customers should enter such information only where reasonably necessary and lawfully authorised.</p>
              <p>The Image Safeguard Protocol is not intended to perform biometric identification or verification and does not create face templates to identify a person. A photograph and the fact that a face may appear can still be personal information and are handled accordingly.</p>
              <p>If you provide another person's information, including a worker, client, supplier or person shown in a photo, you must have a lawful reason and provide any notice or obtain any permission required by law.</p>
            </Section>

            <Section title="5. How we collect information">
              <ul>
                <li>directly from you when you register, use a feature, upload content, enable a device permission or contact us;</li>
                <li>from the organisation or administrator that invites you or enters information about a job, worker, client or supplier;</li>
                <li>automatically from the website, apps, security systems and diagnostic tools;</li>
                <li>from integrations that an authorised user connects; and</li>
                <li>from service providers that process payments, deliver messages, host infrastructure or support the Service.</li>
              </ul>
              <p>For New Zealand users, where information is collected from someone other than the individual, we and the relevant organisation will take reasonable steps to provide the notification required by IPP 3A unless an exception applies.</p>
            </Section>

            <Section title="6. Why we use personal information">
              <ul>
                <li>create, administer and secure accounts and organisation workspaces;</li>
                <li>provide jobs, forms, safety records, photos, fleet, scheduling, estimating, invoicing and connected services;</li>
                <li>apply authorised watermarks and maintain audit histories;</li>
                <li>provide support, investigate faults and communicate about the Service;</li>
                <li>process subscriptions and maintain financial records;</li>
                <li>detect and respond to misuse, fraud, security incidents and privacy risks;</li>
                <li>operate AI-assisted features requested by authorised users;</li>
                <li>improve reliability and features using aggregated or de-identified information where practical; and</li>
                <li>comply with law and establish, exercise or defend legal rights.</li>
              </ul>
              <p>We do not sell personal information or use customer job records for third-party advertising.</p>
            </Section>

            <Section title="7. The IWILLBUILD Image Safeguard Protocol">
              <p>Job photos stored in the Service may be selected for a periodic, bounded safeguard review initiated manually by an authorised IWILLBUILD platform owner. The present safeguard may use software to detect the apparent presence of a face and record a neutral privacy signal for possible human review.</p>
              <p>The purpose is to support privacy awareness, acceptable use and responsible investigation. It is not continuous surveillance and we do not promise that every image is assessed.</p>
              <ul>
                <li>The software does not identify a person or create an identity profile.</li>
                <li>It does not determine age, ethnicity, emotion, health, legality, appropriateness or criminal conduct.</li>
                <li>A signal may be wrong. Authorised support personnel must review context before taking any action.</li>
                <li>The scan does not automatically delete, quarantine or report an image, disable a user, or block ordinary capture.</li>
                <li>A separate acknowledgement may appear immediately before images are emailed or shared.</li>
              </ul>
              <p>For a scan we may process the image temporarily, its internal asset reference, company and responsible-user identifiers where reliably known, timestamps, detector version, approximate face count, outcome and review record. Temporary working copies are deleted after processing. We retain safeguard records only as long as reasonably needed for security, accountability, dispute handling and legal obligations.</p>
              <p>Where review identifies a credible concern, access is limited to authorised personnel. We may preserve records or disclose information where required or permitted by law, but the automated signal alone is not treated as proof and does not itself trigger a report to authorities.</p>
            </Section>

            <Section title="8. AI-assisted tools and automated decisions">
              <p>Dazza AI and similar tools may help authorised users search, draft, extract, classify or summarise information. They operate within platform permissions and their output requires human review.</p>
              <p>We do not use automated tools alone to hire, fire, discipline, approve credit, determine legal rights or make another decision that could significantly affect a person's rights or interests.</p>
              <p>From 10 December 2026, additional Australian privacy-policy disclosures apply where a computer program uses personal information to make, or do something substantially and directly related to making, a decision reasonably expected to significantly affect a person's rights or interests. If IWILLBUILD introduces such a use, we will update this Policy and provide the required information before relying on it.</p>
              <p>We do not use customer job photos, SWMS or field records to train public foundation models. Where a third-party AI provider delivers a feature, we seek terms that prevent it from using customer content to train its general models unless the customer has clearly agreed otherwise.</p>
            </Section>

            <Section title="9. Cookies, analytics and communications">
              <p>We use cookies and similar technologies for login, preferences, security and service measurement. Blocking essential cookies may prevent login or other functions. We do not currently use customer records for advertising profiles.</p>
              <p>We may send service, security, billing and outage messages while an account is active. Promotional messages are sent only where permitted and include an unsubscribe method.</p>
            </Section>

            <Section title="10. Who we disclose information to">
              <p>We disclose personal information only as reasonably necessary to provide the Service, at an authorised user's direction, or as required or permitted by law. Recipients may include:</p>
              <ul>
                <li>authorised users and administrators within the relevant organisation;</li>
                <li>hosting, cloud-storage, email, notification, diagnostics, support and security providers;</li>
                <li>Stripe or another payment processor;</li>
                <li>Xero, QuickBooks, Microsoft, Google, mapping, telematics or other integrations enabled by an authorised user;</li>
                <li>AI subprocessors used to deliver a requested feature under appropriate restrictions;</li>
                <li>professional advisers, insurers, auditors and prospective business purchasers subject to confidentiality; and</li>
                <li>courts, regulators, police or other authorities where disclosure is required or permitted by law.</li>
              </ul>
              <p>We do not disclose personal information to unrelated third parties for their advertising.</p>
            </Section>

            <Section title="11. Overseas processing and disclosure">
              <p>Some providers may store or access information outside Australia or New Zealand, including in the United States and other locations used by major cloud, accounting, mapping, app-store and AI providers. The exact locations can change with provider infrastructure and the features a customer enables.</p>
              <p>For Australian information, we take reasonable steps required by APP 8 where it applies. For New Zealand information, we assess IPP 12 and seek comparable safeguards, use an eligible processing arrangement, or obtain informed authorisation where required. Measures may include provider due diligence, contractual protections, encryption, access restrictions and data minimisation.</p>
            </Section>

            <Section title="12. How we protect information">
              <ul>
                <li>encrypted connections for web and app traffic;</li>
                <li>password and PIN hashing rather than plain-text storage;</li>
                <li>role-based and organisation-isolated access controls;</li>
                <li>restricted administrative and support access;</li>
                <li>session controls, rate limits, audit and sign-in records;</li>
                <li>upload validation and bounded handling of untrusted files;</li>
                <li>least-privilege access to cloud storage;</li>
                <li>security review, patching, testing and incident procedures; and</li>
                <li>backups and recovery measures appropriate to the Service and business risk.</li>
              </ul>
              <p>No online service is completely secure. Users should use strong unique credentials, secure their devices and promptly report suspected unauthorised access to <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a>.</p>
            </Section>

            <Section title="13. Data quality, access and correction">
              <p>Users can generally update their own profile. Organisation records are managed by authorised organisation users. You may request access to or correction of personal information we hold by emailing <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a>. We will verify identity and respond within a reasonable period and any applicable statutory timeframe.</p>
              <p>Access may be limited where the law permits, including where disclosure would unreasonably affect another person's privacy. If we refuse a request, we will explain the reason unless prohibited from doing so.</p>
            </Section>

            <Section title="14. Retention, deletion and organisation records">
              <p>We retain personal information for as long as reasonably needed to provide and secure the Service, meet contractual and legal obligations, resolve disputes and maintain appropriate audit records.</p>
              <p>Construction, safety, financial and insurance records may need to be retained for years. Each subscribing organisation is responsible for selecting lawful retention periods for its records. After cancellation, we may provide a reasonable export or recovery period before deletion or de-identification, subject to legal holds, financial records, security evidence and backup cycles.</p>
              <p>When information is no longer required, we take reasonable steps to delete or permanently de-identify it.</p>
            </Section>

            <Section title="15. Children">
              <p>The Service is designed for construction organisations and is not directed to children. We do not knowingly allow a child under 16 to create an independent account. An organisation may hold lawful work, safety or contact records concerning a young worker or another child, but it must use appropriate authority, notice, permissions and safeguards.</p>
              <p>If you believe information about a child has been included inappropriately, contact us promptly so the organisation and IWILLBUILD can assess and restrict or remove it where appropriate.</p>
            </Section>

            <Section title="16. Data breaches">
              <p>We maintain procedures for assessing and responding to suspected privacy and security incidents. Where a breach is likely to cause serious harm and notification is legally required, we will notify affected people and the relevant regulator, including the OAIC in Australia or the Office of the Privacy Commissioner in New Zealand. New Zealand notifications are made as soon as practicable; regulator guidance identifies 72 hours as the expected timeframe for serious breaches.</p>
            </Section>

            <Section title="17. Complaints">
              <ol>
                <li>Contact <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a> with the issue and the outcome you seek. We will investigate and respond within 30 days.</li>
                <li>If you are in Australia and remain dissatisfied, you may contact the <strong className="text-foreground">Office of the Australian Information Commissioner (OAIC)</strong> at <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">www.oaic.gov.au</a> or 1300 363 992.</li>
                <li>If you are in New Zealand and remain dissatisfied, you may contact the <strong className="text-foreground">Office of the Privacy Commissioner</strong> at <a href="https://www.privacy.org.nz" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">www.privacy.org.nz</a> or 0800 803 909.</li>
              </ol>
            </Section>

            <Section title="18. Changes to this Policy">
              <p>We may update this Policy when the Service, law or providers change. We will identify the version and effective date at the top of this page. Material changes will be notified by email or in-product notice where appropriate, and renewed acknowledgement will be requested where the nature of the change makes that appropriate.</p>
            </Section>

            <Section title="19. Contact">
              <p>
                <strong className="text-foreground">IWILLBUILD</strong><br />
                Queensland, Australia<br />
                ABN 89 791 350 823<br />
                <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a><br />
                <a href="https://www.iwillbuild.com" className="text-primary hover:text-primary/80">www.iwillbuild.com</a>
              </p>
              <p>We may need to verify identity before discussing or releasing personal information.</p>
            </Section>

          </div>
        </main>

        <PolicyFooter active="Privacy Policy" />
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

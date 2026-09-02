import { terms } from 'virtual:content';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from "react-router";
import { ArrowLeft, FileText } from 'lucide-react';

const VERSION = '2.0';
const EFFECTIVE_DATE = '3 September 2026';
const LAST_UPDATED = '3 September 2026';

function PolicyFooter({ active }: { active: string }) {
  const links = [
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
        {terms.links.map(l => (
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

export default function TermsPage() {
  return (
    <>
      <Helmet>
        <title>Terms of Use — IWILLBUILD</title>
        <meta name="description" content="Terms of Use for the IWILLBUILD construction and job-management platform. Version 2.0 — effective 3 September 2026." />
        <link rel="canonical" href="https://iwillbuild.com/terms" />
        <meta property="og:title" content="Terms of Use — IWILLBUILD" />
        <meta property="og:description" content="Terms of Use for the IWILLBUILD construction and job-management platform." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/terms" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': 'https://iwillbuild.com/terms#webpage',
          name: 'Terms of Use — IWILLBUILD',
          url: 'https://iwillbuild.com/terms',
          description: 'Terms of Use for the IWILLBUILD construction and job-management platform.',
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
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <FileText size={20} className="text-accent" />
              </div>
              <span className="text-xs font-bold text-accent uppercase tracking-widest">Terms of Use</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3 leading-tight">Terms of Use</h1>
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

            <Section title="1. About IWILLBUILD and these Terms">
              <p>IWILLBUILD is a construction and job-management software platform operated from Queensland, Australia. It provides tools for jobs, estimates, forms, safety records, fleet, files, photos, invoices, scheduling, team coordination, and related assistance.</p>
              <p>These Terms apply to the IWILLBUILD website, web portal, progressive web app, iOS and Android applications, and related services (together, the <strong className="text-foreground">Service</strong>). References to <strong className="text-foreground">you</strong> include an organisation that subscribes to the Service and each person authorised to use its account.</p>
              <p>By creating an account, accepting these Terms in the Service, or continuing to use the Service after being given notice of a material update, you agree to these Terms. The <Link to="/privacy" className="text-primary hover:text-primary/80">Privacy Policy</Link> explains how personal information is handled and is incorporated by reference for that purpose.</p>
            </Section>

            <Section title="2. Eligibility and authority">
              <p>You must be legally able to enter into these Terms. If you accept them for a company or other organisation, you represent that you are authorised to bind that organisation. Invited workers who are under 18 may use the Service only where their organisation lawfully permits and appropriately supervises that use.</p>
            </Section>

            <Section title="3. Accounts and security">
              <ul>
                <li>Provide accurate registration and contact information and keep it current.</li>
                <li>Keep passwords, PINs, devices and recovery methods secure; do not share individual accounts.</li>
                <li>Use role permissions appropriately and promptly remove access for people who no longer require it.</li>
                <li>Notify <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a> promptly if you suspect unauthorised access or misuse.</li>
                <li>You are responsible for activity performed through your account except to the extent it results from IWILLBUILD's breach of these Terms or failure to use reasonable security safeguards.</li>
              </ul>
            </Section>

            <Section title="4. Organisation data, permissions and responsibility">
              <p>The subscribing organisation controls the business records entered into its workspace. As between IWILLBUILD and the organisation, the organisation retains ownership of its content.</p>
              <p>You grant IWILLBUILD a limited, non-exclusive licence to host, copy, process, transmit and display that content only as reasonably necessary to provide, secure, support and improve the Service, comply with lawful obligations, and exercise rights under these Terms.</p>
              <p>You are responsible for the accuracy, legality and appropriateness of content you or your users enter, including job records, addresses, contacts, safety records, signatures, photos, files, estimates and invoices. If you provide another person's information, you must have a lawful reason and provide any notice or obtain any permission required by applicable privacy law.</p>
            </Section>

            <Section title="5. Acceptable use">
              <p>You must not use the Service to:</p>
              <ul>
                <li>upload, create, store or share content that is unlawful, fraudulent, exploitative, abusive, threatening or seriously harmful;</li>
                <li>upload or distribute child sexual abuse material, intimate images without consent, or content that unlawfully invades another person's privacy;</li>
                <li>infringe intellectual property, confidentiality, privacy or other rights;</li>
                <li>attempt to access another account or organisation without authority;</li>
                <li>introduce malware, evade security controls, probe the Service without written permission, or interfere with availability;</li>
                <li>misrepresent identity, authority, qualifications, approvals or records;</li>
                <li>resell, sublicense, scrape or systematically extract the Service or its data except under a written agreement; or</li>
                <li>use AI-assisted features or generated material to make high-impact decisions about another person without lawful authority, appropriate notice and competent human review.</li>
              </ul>
              <p>See also the <Link to="/fair-use" className="text-primary hover:text-primary/80">Fair Use Policy</Link> for detailed platform usage standards and the <Link to="/system-policy" className="text-primary hover:text-primary/80">System Policy</Link> for AI and automated tool rules.</p>
            </Section>

            <Section title="6. Photos, sharing and the IWILLBUILD Image Safeguard Protocol">
              <p>You must have a lawful and work-related reason to capture, upload and share photos. Before emailing or sharing images, you must check the recipients, job context and whether people shown have been appropriately informed or authorised.</p>
              <p>Uploaded job photos may be included in periodic, bounded Image Safeguard reviews initiated by an authorised IWILLBUILD platform owner. The present safeguard may detect the apparent presence of a face as a privacy signal and recommend limited human review by authorised support personnel.</p>
              <ul>
                <li>The safeguard does not identify people, determine age, determine whether content is legal or appropriate, or prove misconduct.</li>
                <li>It may produce false positives or false negatives and does not replace your own review and legal obligations.</li>
                <li>IWILLBUILD does not promise that every image will be scanned or reviewed.</li>
                <li>Ordinary uploads are not automatically blocked merely because a face may be present.</li>
                <li>A sharing acknowledgement may be shown before images are emailed or shared.</li>
              </ul>
              <p>Where a person reasonably believes content may breach these Terms or the law, IWILLBUILD may preserve relevant records, restrict access, seek information, suspend affected functions or accounts, and make a disclosure where required or permitted by law. Where appropriate and lawful, we will give notice and a reasonable opportunity to respond.</p>
            </Section>

            <Section title="7. AI-assisted features">
              <p>Dazza AI and other AI-assisted tools may help search, draft, extract, classify or summarise information that a user is already authorised to access. Outputs are suggestions and may be incomplete or incorrect.</p>
              <p>You must have a competent person review AI-assisted outputs before relying on them for safety, legal, financial, employment, compliance or contractual decisions. IWILLBUILD does not use AI outputs as a substitute for professional advice or required sign-off.</p>
              <p>See the <Link to="/system-policy" className="text-primary hover:text-primary/80">System Policy</Link> for full AI and automated decision rules.</p>
            </Section>

            <Section title="8. Safety documents and professional advice">
              <p>Templates, SWMS, risk assessments, permits, calculations and safety materials are starting points only. They must be reviewed, adapted and approved by a competent person for the actual work, site, jurisdiction and hazards.</p>
              <p>The Service does not replace legal, accounting, engineering, safety, tax, building-code or other professional advice. You are solely responsible for compliance with all applicable laws, codes and regulations.</p>
            </Section>

            <Section title="9. Subscriptions, trials and billing">
              <ul>
                <li>Plan inclusions, prices and billing intervals are shown before purchase. Prices exclude GST unless stated otherwise.</li>
                <li>A stated trial may be cancelled before it ends. If payment details are required for a trial, the checkout clearly states when paid billing begins.</li>
                <li>Subscriptions renew for the displayed billing interval until cancelled. Cancellation takes effect at the end of the paid interval unless the law or checkout terms require otherwise.</li>
                <li>We may change pricing or plan inclusions on reasonable advance notice. If a change materially disadvantages you, you may cancel before it takes effect without an additional cancellation penalty.</li>
                <li>Overdue accounts may be restricted after reasonable notice, subject to any rights that cannot lawfully be excluded.</li>
              </ul>
            </Section>

            <Section title="10. Third-party services and integrations">
              <p>The Service may connect to Stripe, Xero, QuickBooks, Microsoft, Google, Cloudflare and other providers. A connection occurs only when enabled by an authorised user or as required to operate the Service. Third-party terms and privacy policies apply to their services, and data already transferred to them may remain subject to their retention rules after disconnection.</p>
              <p>Payments are processed by Stripe, Inc. under its own terms and PCI-DSS compliance program. IWILLBUILD does not store full card numbers or CVV values.</p>
            </Section>

            <Section title="11. Availability, changes and support">
              <p>We aim to provide a reliable Service but do not guarantee uninterrupted or error-free operation. Maintenance, network failures, third-party outages, emergencies and security work may affect availability.</p>
              <p>We may improve, replace or retire features. For a material change that significantly reduces a paid core feature, we will provide reasonable notice where practicable and an appropriate transition, export or cancellation option.</p>
            </Section>

            <Section title="12. Suspension and termination">
              <p>You may cancel as described in the Service. We may suspend or terminate access where reasonably necessary to address a serious security risk, unlawful use, material breach, non-payment, harm to another person, or legal requirement.</p>
              <p>Except where urgent action or law prevents it, we will give notice describing the reason and a reasonable opportunity to remedy the issue. We will limit a suspension to the affected account, feature or content where reasonably possible.</p>
              <p>After termination, data access and deletion are handled under the <Link to="/privacy" className="text-primary hover:text-primary/80">Privacy Policy</Link>, the plan terms and applicable retention obligations. Organisations should export records they are legally required to retain before access ends.</p>
            </Section>

            <Section title="13. Intellectual property">
              <p>IWILLBUILD and its licensors own the Service, software, branding, system designs and platform materials, excluding customer content. These Terms grant only the limited right to use the Service during an authorised subscription. Feedback may be used to improve the Service without identifying you or disclosing your confidential information.</p>
            </Section>

            <Section title="14. Confidentiality">
              <p>Each party must protect confidential information received from the other and use it only for the Service or another agreed purpose. This obligation does not apply to information that is public without breach, independently developed, lawfully received from another source, or required to be disclosed by law.</p>
            </Section>

            <Section title="15. Consumer guarantees, warranties and liability">
              <p>Nothing in these Terms excludes, restricts or modifies any right, guarantee, condition, warranty or remedy that cannot lawfully be excluded, including rights that may apply under the <em>Australian Consumer Law</em> (Schedule 2 to the <em>Competition and Consumer Act 2010</em> (Cth)) or applicable New Zealand consumer law.</p>
              <p>Subject to those non-excludable rights, the Service is provided with reasonable care and skill but is not warranted to be uninterrupted, error-free or suitable for every particular project or compliance requirement.</p>
              <p>To the extent permitted by law, neither party is liable to the other for indirect or consequential loss that was not reasonably foreseeable at the time of entering these Terms.</p>
            </Section>

            <Section title="16. Indemnity">
              <p>To the extent permitted by law, an organisation is responsible for reasonable third-party claims and direct losses caused by its unlawful content, unauthorised use, or material breach of these Terms. This responsibility is reduced to the extent IWILLBUILD caused or contributed to the loss. IWILLBUILD must take reasonable steps to mitigate loss and allow the organisation to participate in the defence of a claim.</p>
            </Section>

            <Section title="17. Children">
              <p>The Service is designed for construction organisations and is not directed to children. We do not knowingly allow a child under 16 to create an independent account. An organisation may hold lawful work, safety or contact records concerning a young worker, but it must use appropriate authority, notice, permissions and safeguards.</p>
              <p>If you believe information about a child has been included inappropriately, contact us promptly so the organisation and IWILLBUILD can assess and restrict or remove it where appropriate.</p>
            </Section>

            <Section title="18. Changes to these Terms">
              <p>We may update these Terms for legal, security, operational or product reasons. We will identify the version and effective date at the top of this page. For a material change, we will give reasonable advance notice and request renewed acceptance where appropriate. A change will not retrospectively remove accrued rights or impose a new charge without the notice and cancellation rights described above.</p>
            </Section>

            <Section title="19. Disputes and governing law">
              <p>Before starting court proceedings, each party should try in good faith to resolve a dispute by contacting <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-primary/80">support@iwillbuild.com</a> and allowing a reasonable response period, except where urgent relief is required.</p>
              <p>These Terms are governed by the laws of Queensland, Australia. Courts with jurisdiction in Queensland may hear disputes, subject to any mandatory consumer or small-business rights that allow proceedings elsewhere.</p>
            </Section>

            <Section title="20. Contact">
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

        <PolicyFooter active="Terms of Use" />
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

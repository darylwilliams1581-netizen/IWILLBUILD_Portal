import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from "react-router";
import { ArrowLeft, FileText } from 'lucide-react';
const LAST_UPDATED = 'June 2026';
export default function TermsPage() {
  return <>
      <Helmet>
        <title>Terms of Use — IWIllBUILD</title>
        <meta name="description" content="Terms of use for the IWIllBUILD fleet and construction management portal. Read before using the platform." />
        <link rel="canonical" href="https://iwillbuild.com/terms" />
        <meta property="og:title" content="Terms of Use — IWIllBUILD" />
        <meta property="og:description" content="Terms of use for the IWIllBUILD construction management portal." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/terms" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': 'https://iwillbuild.com/terms#webpage',
          name: 'Terms of Use — IWIllBUILD',
          url: 'https://iwillbuild.com/terms',
          description: 'Terms of use for the IWIllBUILD fleet and construction management portal.',
          isPartOf: {
            '@id': 'https://iwillbuild.com/#website'
          },
          about: {
            '@id': 'https://iwillbuild.com/#organization'
          }
        })}</script>
      </Helmet>

      <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>

        {/* ── Nav bar ── */}
        <header style={{
        borderBottom: '1px solid #1e293b',
        padding: '0 24px'
      }}>
          <div style={{
          maxWidth: 860,
          margin: '0 auto',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
            <Link to="/" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none'
          }}>
              <span style={{
              width: 32,
              height: 32,
              borderRadius: 7,
              background: 'linear-gradient(135deg,#1263d8,#0f8aa8)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 900,
              fontSize: 13,
              flexShrink: 0
            }}>IW</span>
              <strong style={{
              color: '#f1f5f9',
              fontSize: 15
            }}>IWIllBUILD</strong>
            </Link>
            <Link to="/" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#94a3b8',
            textDecoration: 'none',
            fontSize: 14
          }} className="hover:text-white transition-colors">
              <ArrowLeft size={15} />
              Back to home
            </Link>
          </div>
        </header>

        {/* ── Hero ── */}
        <div style={{
        borderBottom: '1px solid #1e293b',
        padding: '48px 24px 40px'
      }}>
          <div style={{
          maxWidth: 860,
          margin: '0 auto'
        }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 14
          }}>
              <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: '#1e2d1a',
              display: 'grid',
              placeItems: 'center'
            }}>
                <FileText size={20} color="#4ade80" />
              </div>
              <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#4ade80',
              textTransform: 'uppercase',
              letterSpacing: '0.08em'
            }}>Terms of Use</span>
            </div>
            <h1 style={{
            fontSize: 'clamp(26px,4vw,38px)',
            fontWeight: 800,
            color: '#f1f5f9',
            margin: '0 0 12px',
            lineHeight: 1.2
          }}>
              Terms of Use
            </h1>
            <p style={{
            color: '#94a3b8',
            fontSize: 15,
            margin: 0
          }}>Last updated: {LAST_UPDATED} &nbsp;·&nbsp; IWIllBUILD, Queensland, Australia</p>
          </div>
        </div>

        {/* ── Content ── */}
        <main style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '48px 24px 80px'
      }}>
          <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 40
        }}>

            <Section title="1. About IWIllBUILD">
              <p>IWIllBUILD is a construction and job management software platform. It provides tools for managing jobs, estimates, forms, safety documents, fleet, files, invoices, and team coordination. By creating an account or using the platform, you agree to these terms.</p>
              <p>For questions, contact us at <a href="mailto:support@iwillbuild.com" style={{
                color: '#7c3aed'
              }}>support@iwillbuild.com</a>.</p>
            </Section>

            <Section title="2. Account security">
              <p>You are responsible for keeping your login credentials — including your password and PIN — secure and confidential. Do not share your account with others. You are responsible for all activity that occurs under your account.</p>
              <p>If you believe your account has been compromised, contact us immediately at <a href="mailto:support@iwillbuild.com" style={{
                color: '#7c3aed'
              }}>support@iwillbuild.com</a>.</p>
            </Section>

            <Section title="3. Your data and content">
              <p>You are responsible for the accuracy, completeness, and legality of all data you enter into IWIllBUILD, including:</p>
              <ul>
                <li>Job details, addresses, and notes</li>
                <li>Estimates, pricing, and invoice information</li>
                <li>Forms, checklists, and field data submitted by your team</li>
                <li>Safety documents, SWMS, and site safety plans</li>
                <li>Files, photos, and documents uploaded to the platform</li>
                <li>Fleet records and maintenance data</li>
              </ul>
              <p>IWIllBUILD stores and processes this data on your behalf but does not verify its accuracy.</p>
            </Section>

            <Section title="4. Not a substitute for professional advice">
              <p>IWIllBUILD is a software tool. It does not replace professional, legal, safety, accounting, or compliance advice. You should always consult qualified professionals for matters relating to:</p>
              <ul>
                <li>Workplace health and safety obligations</li>
                <li>Legal and contractual requirements</li>
                <li>Accounting, tax, and financial compliance</li>
                <li>Building codes, permits, and regulations</li>
              </ul>
            </Section>

            <Section title="5. System AI tools">
              <p>IWIllBUILD includes internal AI-assisted tools available to platform administrators. These tools provide AI-generated analysis and assistance to help with tasks such as data review, health checks, and generating suggestions. AI outputs are provided as a starting point only and must be reviewed and verified by a competent person before use.</p>
              <p>IWIllBUILD does not warrant the accuracy, completeness, or suitability of any AI-generated output. You are responsible for any decisions made based on AI-assisted responses.</p>
            </Section>

            <Section title="6. Safety documents and SWMS">
              <p>Safety templates, SWMS (Safe Work Method Statements), site safety plans, and other safety-related documents available in IWIllBUILD are provided as starting points and examples only.</p>
              <p>All safety documents must be reviewed, customised, and approved by the responsible person or business before use on any worksite. IWIllBUILD does not accept responsibility for safety outcomes arising from the use of documents generated through the platform without appropriate review and sign-off.</p>
            </Section>

            <Section title="7. Subscriptions and billing">
              <p>Access to IWIllBUILD is provided on a subscription basis. Subscription plans, pricing, and billing are managed through <strong>Stripe</strong>. By subscribing, you agree to the applicable plan pricing at the time of purchase.</p>
              <p>IWIllBUILD may update pricing and plan features over time. Where material changes are made, we will provide reasonable notice.</p>
            </Section>

            <Section title="8. Trial and account status">
              <p>New accounts receive a 30-day free trial. After the trial period, a paid subscription is required to continue full access. Accounts that are cancelled, expired, or past due may be placed in a view-only or restricted state. Data may be retained for a period after cancellation to allow account recovery.</p>
            </Section>

            <Section title="9. Acceptable use">
              <p>You agree not to use IWIllBUILD to:</p>
              <ul>
                <li>Upload or share unlawful, harmful, or fraudulent content</li>
                <li>Attempt to gain unauthorised access to the platform or other accounts</li>
                <li>Interfere with the operation of the platform or its infrastructure</li>
                <li>Resell or sublicense access to the platform without written permission</li>
              </ul>
            </Section>

            <Section title="10. Platform changes">
              <p>IWIllBUILD may update, modify, or discontinue features at any time. We aim to provide reasonable notice of significant changes. Continued use of the platform after changes constitutes acceptance of the updated terms.</p>
            </Section>

            <Section title="11. Limitation of liability">
              <p>To the extent permitted by law, IWIllBUILD is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential loss arising from your use of the platform, including loss of data, revenue, or business opportunity.</p>
            </Section>

            <Section title="12. Governing law">
              <p>These terms are governed by the laws of Queensland, Australia. Any disputes will be subject to the jurisdiction of the courts of Queensland.</p>
            </Section>

            <Section title="13. Contact">
              <p>For questions about these terms, contact us at:</p>
              <p>
                <strong style={{
                color: '#f1f5f9'
              }}>IWIllBUILD</strong><br />
                Queensland, Australia<br />
                ABN 89 791 350 823<br />
                <a href="mailto:support@iwillbuild.com" style={{
                color: '#7c3aed'
              }}>support@iwillbuild.com</a>
              </p>
            </Section>

          </div>
        </main>

        {/* ── Footer ── */}
        <footer style={{
        borderTop: '1px solid #1e293b',
        padding: '24px',
        textAlign: 'center'
      }}>
          <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          flexWrap: 'wrap',
          marginBottom: 12
        }}>
            <Link to="/" style={{
            color: '#64748b',
            textDecoration: 'none',
            fontSize: 13
          }} className="hover:text-white transition-colors">Home</Link>
            <Link to="/privacy" style={{
            color: '#64748b',
            textDecoration: 'none',
            fontSize: 13
          }} className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms" style={{
            color: '#7c3aed',
            textDecoration: 'none',
            fontSize: 13
          }}>Terms of Use</Link>
            <Link to="/login" style={{
            color: '#64748b',
            textDecoration: 'none',
            fontSize: 13
          }} className="hover:text-white transition-colors">Sign In</Link>
          </div>
          <p style={{
          color: '#475569',
          fontSize: 12,
          margin: 0
        }}>© {new Date().getFullYear()} IWIllBUILD · ABN 89 791 350 823 · Queensland, Australia</p>
        </footer>

      </div>
    </>;
}

// ── Reusable section wrapper ──────────────────────────────────────────────────
function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return <section>
      <h2 style={{
      fontSize: 18,
      fontWeight: 700,
      color: '#f1f5f9',
      margin: '0 0 14px',
      paddingBottom: 10,
      borderBottom: '1px solid #1e293b'
    }}>
        {title}
      </h2>
      <div style={{
      color: '#94a3b8',
      fontSize: 15,
      lineHeight: 1.75,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}>
        {children}
      </div>
    </section>;
}

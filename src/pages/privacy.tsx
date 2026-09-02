import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from "react-router";
import { ArrowLeft, Shield } from 'lucide-react';
const LAST_UPDATED = '13 July 2026';
export default function PrivacyPage() {
  return <>
      <Helmet>
        <title>Privacy Policy — IWIIlBUILD</title>
        <meta name="description" content="How IWIIlBUILD collects, uses, discloses and protects your personal information. Read our Privacy Policy for the fleet and construction management portal." />
        <link rel="canonical" href="https://iwillbuild.com/privacy" />
        <meta property="og:title" content="Privacy Policy — IWIIlBUILD" />
        <meta property="og:description" content="How IWIIlBUILD collects, uses, discloses and protects your personal information." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/privacy" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': 'https://iwillbuild.com/privacy#webpage',
          name: 'Privacy Policy — IWIIlBUILD',
          url: 'https://iwillbuild.com/privacy',
          description: 'How IWIIlBUILD collects, uses, discloses and protects your personal information.',
          isPartOf: {
            '@id': 'https://iwillbuild.com/#website'
          },
          about: {
            '@id': 'https://iwillbuild.com/#organization'
          },
          dateModified: '2026-07-13'
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
            }}>IWIIlBUILD</strong>
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
              backgroundColor: '#1e3a5f',
              display: 'grid',
              placeItems: 'center'
            }}>
                <Shield size={20} color="#60a5fa" />
              </div>
              <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#60a5fa',
              textTransform: 'uppercase',
              letterSpacing: '0.08em'
            }}>Privacy Policy</span>
            </div>
            <h1 style={{
            fontSize: 'clamp(26px,4vw,38px)',
            fontWeight: 800,
            color: '#f1f5f9',
            margin: '0 0 12px',
            lineHeight: 1.2
          }}>
              Your data, handled with care
            </h1>
            <p style={{
            color: '#94a3b8',
            fontSize: 15,
            margin: 0
          }}>
              Last updated: {LAST_UPDATED}&nbsp;·&nbsp;IWIIlBUILD, Queensland, Australia
            </p>
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

            <Section title="1. About this policy">
              <p>
                IWIIlBUILD (ABN 89 791 350 823) is a construction and job management software platform operated from Queensland, Australia (<strong style={{
                color: '#f1f5f9'
              }}>"we"</strong>, <strong style={{
                color: '#f1f5f9'
              }}>"us"</strong>, <strong style={{
                color: '#f1f5f9'
              }}>"our"</strong>).
              </p>
              <p>
                This Privacy Policy explains how we collect, hold, use and disclose personal information in accordance with the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs). It applies to all users of the IWIIlBUILD portal, website, and related services (collectively, the <strong style={{
                color: '#f1f5f9'
              }}>"Service"</strong>).
              </p>
              <p>
                By using the Service you consent to the collection, use and disclosure of your personal information as described in this policy. If you do not agree, please do not use the Service.
              </p>
            </Section>

            <Section title="2. What personal information we collect">
              <p>We collect personal information that is reasonably necessary to provide the Service. This includes:</p>
              <ul>
                <li><strong>Identity and account data</strong> — full name, email address, hashed password, phone number, and hashed PIN (if set).</li>
                <li><strong>Company and business data</strong> — business name, ABN, address, and configuration settings you enter.</li>
                <li><strong>Job and project data</strong> — job names, site addresses, notes, status, assigned team members, and related records you create.</li>
                <li><strong>Financial data</strong> — estimates, invoice line items, pricing, GST amounts, and payment history you record in the portal.</li>
                <li><strong>Safety and compliance records</strong> — completed forms, SWMS, site safety plans, and any data entered by your team.</li>
                <li><strong>Fleet and asset data</strong> — vehicle records, registrations, maintenance notes, and asset bookings you enter.</li>
                <li><strong>Files, photos and documents</strong> — attachments uploaded through the portal.</li>
                <li><strong>Technical and usage data</strong> — IP address, browser type, pages visited, actions taken, and session information collected automatically when you use the Service.</li>
              </ul>
              <p>
                We collect personal information directly from you when you register, use the Service, or contact us. We may also collect information from your employer or the company account administrator who invited you to the platform.
              </p>
              <p>
                Where it is lawful and practicable to do so, you may use the Service without identifying yourself (for example, when browsing public pages). However, most features require you to create an account.
              </p>
            </Section>

            <Section title="3. How we use your personal information">
              <p>We use personal information to:</p>
              <ul>
                <li>Provide, operate and maintain the Service and its features.</li>
                <li>Create and manage your account and company workspace.</li>
                <li>Process subscription payments and manage billing.</li>
                <li>Provide customer support and respond to enquiries.</li>
                <li>Send transactional communications — password resets, account notifications, and service updates.</li>
                <li>Detect, investigate and prevent fraud, security incidents, and unauthorised access.</li>
                <li>Comply with legal obligations, including tax and record-keeping requirements.</li>
                <li>Improve the platform, fix bugs, and develop new features (using aggregated or de-identified data where possible).</li>
              </ul>
              <p>
                We will not use your personal information for direct marketing without your consent. We do not sell your personal information to third parties or use it for advertising purposes.
              </p>
            </Section>

            <Section title="4. Disclosure of personal information">
              <p>We may disclose your personal information to:</p>
              <ul>
                <li><strong>Service providers</strong> — third-party vendors who assist us in operating the Service, including cloud hosting providers, database infrastructure, email delivery services, and payment processors. These providers are contractually required to handle your information securely and only for the purposes we specify.</li>
                <li><strong>Payment processor (Stripe)</strong> — subscription payments are processed by Stripe, Inc. IWIIlBUILD does not store your full card number or CVV. Stripe handles payment data under its own privacy policy and PCI-DSS compliance program. See <a href="https://stripe.com/au/privacy" target="_blank" rel="noopener noreferrer" style={{
                  color: '#7c3aed'
                }}>stripe.com/au/privacy</a>.</li>
                <li><strong>Accounting integrations (e.g. Xero)</strong> — if you choose to connect a third-party accounting platform, data such as approved invoices and customer contacts may be synced to that platform at your direction. You can disconnect integrations at any time from <strong>Settings → Integrations</strong>. Data already transmitted to a third-party platform is governed by that platform's privacy policy.</li>
                <li><strong>Your company administrator</strong> — account owners and administrators within your company workspace can access data created by team members in accordance with their role permissions.</li>
                <li><strong>Legal and regulatory authorities</strong> — where required by law, court order, or to protect the rights, property, or safety of IWIIlBUILD, our users, or the public.</li>
                <li><strong>Business transfers</strong> — in the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify affected users before personal information is transferred and becomes subject to a different privacy policy.</li>
              </ul>
              <p>We do not otherwise disclose your personal information to third parties without your consent.</p>
            </Section>

            <Section title="5. Overseas disclosure">
              <p>
                Some of our service providers are located or store data outside Australia, including in the United States and the European Union. Where we disclose personal information to overseas recipients, we take reasonable steps to ensure those recipients handle your information in a manner consistent with the APPs, including through contractual data processing agreements.
              </p>
              <p>
                By using the Service, you acknowledge that your information may be transferred to and processed in countries outside Australia. If you do not consent to this, please contact us before using the Service.
              </p>
            </Section>

            <Section title="6. File and photo storage">
              <p>
                Files, photos, and documents you upload are stored in secure cloud storage (currently Cloudflare R2 or equivalent infrastructure). Your company's files are isolated and are not accessible to other companies on the platform. Data is stored using industry-standard security controls.
              </p>
            </Section>

            <Section title="7. Data quality and accuracy">
              <p>
                We take reasonable steps to ensure the personal information we hold is accurate, up to date, complete, and relevant. You can update your account details at any time from your profile settings. If you believe information we hold about you is inaccurate or out of date, please contact us using the details in section 12.
              </p>
            </Section>

            <Section title="8. Security">
              <p>
                We take reasonable steps to protect personal information from misuse, interference, loss, and unauthorised access, modification, or disclosure. Our security measures include:
              </p>
              <ul>
                <li>Encrypted connections (HTTPS/TLS) for all data in transit.</li>
                <li>Hashed storage of passwords and PINs (never stored in plain text).</li>
                <li>Role-based access controls limiting data access to authorised users.</li>
                <li>Rate limiting and session management to reduce unauthorised access risk.</li>
                <li>Regular review of security practices as the platform evolves.</li>
              </ul>
              <p>
                No system is completely secure. We encourage you to use a strong, unique password and to keep your login credentials private. If you suspect unauthorised access to your account, contact us immediately at <a href="mailto:support@iwillbuild.com" style={{
                color: '#7c3aed'
              }}>support@iwillbuild.com</a>.
              </p>
            </Section>

            <Section title="9. Cookies and tracking">
              <p>
                We use session cookies to keep you logged in while using the portal. These are strictly necessary for the Service to function and are not used for advertising.
              </p>
              <p>
                We may collect limited technical usage data (such as page views and feature interactions) to understand how the platform is used and to improve it. This data is aggregated and does not identify you individually. We do not use third-party advertising cookies or tracking pixels.
              </p>
            </Section>

            <Section title="10. Data retention and destruction">
              <p>
                We retain personal information for as long as your account is active or as necessary to provide the Service, comply with legal obligations, resolve disputes, and enforce our agreements.
              </p>
              <p>
                If you cancel your subscription, your data will be retained for a reasonable period (typically 90 days) to allow account recovery. After that period, your data may be deleted or de-identified, subject to any legal or regulatory record-keeping requirements that apply to your business records.
              </p>
              <p>
                When personal information is no longer required, we take reasonable steps to destroy or permanently de-identify it.
              </p>
            </Section>

            <Section title="11. Your rights — access, correction and complaints">
              <p>Under the Privacy Act 1988 (Cth) and the APPs, you have the right to:</p>
              <ul>
                <li><strong>Access</strong> the personal information we hold about you.</li>
                <li><strong>Correct</strong> personal information that is inaccurate, out of date, incomplete, irrelevant, or misleading.</li>
                <li><strong>Complain</strong> about how we have handled your personal information.</li>
              </ul>
              <p>
                To exercise any of these rights, contact us at <a href="mailto:support@iwillbuild.com" style={{
                color: '#7c3aed'
              }}>support@iwillbuild.com</a>. We will respond to access and correction requests within 30 days. In some circumstances we may be unable to provide access (for example, where doing so would unreasonably impact the privacy of another individual), and we will explain why.
              </p>
              <p>
                If you are not satisfied with our response to a privacy complaint, you may lodge a complaint with the <strong style={{
                color: '#f1f5f9'
              }}>Office of the Australian Information Commissioner (OAIC)</strong>:
              </p>
              <ul>
                <li>Website: <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" style={{
                  color: '#7c3aed'
                }}>www.oaic.gov.au</a></li>
                <li>Phone: 1300 363 992</li>
                <li>Post: GPO Box 5218, Sydney NSW 2001</li>
              </ul>
            </Section>

            <Section title="12. Changes to this policy">
              <p>
                We may update this Privacy Policy from time to time to reflect changes to our practices, the Service, or applicable law. When we make material changes, we will update the "Last updated" date at the top of this page and, where appropriate, notify users by email or in-app notice.
              </p>
              <p>
                Continued use of the Service after the updated policy is posted constitutes your acceptance of the changes. We encourage you to review this policy periodically.
              </p>
            </Section>

            <Section title="13. Contact us">
              <p>For any privacy questions, access or correction requests, or complaints, please contact us:</p>
              <p>
                <strong style={{
                color: '#f1f5f9'
              }}>IWIIlBUILD</strong><br />
                Queensland, Australia<br />
                ABN 89 791 350 823<br />
                <a href="mailto:support@iwillbuild.com" style={{
                color: '#7c3aed'
              }}>support@iwillbuild.com</a>
              </p>
              <p>We aim to respond to all privacy enquiries within 5 business days.</p>
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
            color: '#7c3aed',
            textDecoration: 'none',
            fontSize: 13
          }}>Privacy Policy</Link>
            <Link to="/terms" style={{
            color: '#64748b',
            textDecoration: 'none',
            fontSize: 13
          }} className="hover:text-white transition-colors">Terms of Use</Link>
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
        }}>© {new Date().getFullYear()} IWIIlBUILD · ABN 89 791 350 823 · Queensland, Australia</p>
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

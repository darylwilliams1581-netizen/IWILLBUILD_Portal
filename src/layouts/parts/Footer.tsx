import { Link } from "react-router";
/**
 * IWILLBUILD marketing footer
 * Three-column layout: brand + tagline | modules | company links
 * Bottom bar: copyright + legal links
 */
export default function Footer() {
  const year = new Date().getFullYear();
  return <footer style={{
    backgroundColor: '#0f172a',
    color: '#94a3b8',
    fontFamily: "'Inter', Arial, sans-serif"
  }}>
      {/* ── Main columns ── */}
      <div style={{
      maxWidth: 1180,
      margin: '0 auto',
      padding: '56px 22px 40px',
      display: 'grid',
      gap: 40
    }} className="footer-grid">
        {/* Brand */}
        <div>
          <Link to="/" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          marginBottom: 14
        }}>
            <span style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'linear-gradient(135deg,#1263d8,#0f8aa8)',
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontWeight: 900,
            fontSize: 13
          }}>
              IW
            </span>
            <strong style={{
            fontSize: 17,
            letterSpacing: '-0.03em',
            color: '#f1f5f9',
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
              IWILLBUILD
            </strong>
          </Link>
          <p style={{
          fontSize: 13,
          lineHeight: 1.65,
          maxWidth: 260,
          color: '#64748b'
        }}>
            Construction job management — jobs, estimates, forms, fleet, safety and files in one clean portal.
          </p>
          <p style={{
          fontSize: 12,
          marginTop: 16,
          color: '#475569'
        }}>
            Built for Australian construction teams.
          </p>
        </div>

        {/* Modules */}
        <div>
          <p style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#475569',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 14
        }}>
            Modules
          </p>
          <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
            {[{
            href: '/studio/jobs',
            label: 'Jobs'
          }, {
            href: '/studio/estimates',
            label: 'Estimating'
          }, {
            href: '/studio/fleet',
            label: 'Fleet'
          }, {
            href: '/studio/accounts',
            label: 'Accounts'
          }, {
            href: '/studio',
            label: 'Studio'
          }, {
            href: '/scheduler',
            label: 'Scheduler'
          }].map(item => <li key={item.href}>
                <Link to={item.href} style={{
              fontSize: 13,
              color: '#64748b',
              textDecoration: 'none',
              transition: 'color 0.15s'
            }} className="hover:text-white">
                  {item.label}
                </Link>
              </li>)}
          </ul>
        </div>

        {/* Company */}
        <div>
          <p style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#475569',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 14
        }}>
            Company
          </p>
          <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
            {[{
            href: '/#pricing',
            label: 'Pricing'
          }, {
            href: '/#how',
            label: 'How it works'
          }, {
            href: '/login',
            label: 'Sign in'
          }, {
            href: '/signup',
            label: 'Start free trial'
          }, {
            href: '/privacy',
            label: 'Privacy policy'
          }, {
            href: '/terms',
            label: 'Terms of service'
          }].map(item => <li key={item.href}>
                <Link to={item.href} style={{
              fontSize: 13,
              color: '#64748b',
              textDecoration: 'none',
              transition: 'color 0.15s'
            }} className="hover:text-white">
                  {item.label}
                </Link>
              </li>)}
          </ul>
        </div>

        {/* Support */}
        <div>
          <p style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#475569',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 14
        }}>
            Support
          </p>
          <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
            <li>
              <a href="mailto:support@iwillbuild.com" style={{
              fontSize: 13,
              color: '#64748b',
              textDecoration: 'none'
            }} className="hover:text-white">
                support@iwillbuild.com
              </a>
            </li>
            <li style={{
            fontSize: 13,
            color: '#475569'
          }}>
              Mon–Fri, 8am–6pm AEST
            </li>
            <li style={{
            marginTop: 8
          }}>
              <Link to="/signup" style={{
              display: 'inline-block',
              padding: '9px 18px',
              borderRadius: 8,
              backgroundColor: '#7c3aed',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none'
            }} className="hover:opacity-90">
                Start free trial
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
      borderTop: '1px solid #1e293b'
    }}>
        <div style={{
        maxWidth: 1180,
        margin: '0 auto',
        padding: '16px 22px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
      }}>
          <p style={{
          fontSize: 12,
          color: '#334155',
          margin: 0
        }}>
            © {year} IWILLBUILD. All rights reserved. ABN available on request.
          </p>
          <div style={{
          display: 'flex',
          gap: 20
        }}>
            <Link to="/privacy" style={{
            fontSize: 12,
            color: '#334155',
            textDecoration: 'none'
          }} className="hover:text-slate-300">
              Privacy
            </Link>
            <Link to="/terms" style={{
            fontSize: 12,
            color: '#334155',
            textDecoration: 'none'
          }} className="hover:text-slate-300">
              Terms
            </Link>
            <a href="mailto:support@iwillbuild.com" style={{
            fontSize: 12,
            color: '#334155',
            textDecoration: 'none'
          }} className="hover:text-slate-300">
              Contact
            </a>
          </div>
        </div>
      </div>

      {/* ── Responsive grid styles ── */}
      <style>{`
        .footer-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .footer-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .footer-grid {
            grid-template-columns: 2fr 1fr 1fr 1fr;
          }
        }
      `}</style>
    </footer>;
}

import { Link } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { CheckCircle2, ChevronRight, Users, User, Zap, Crown, ArrowLeft } from 'lucide-react';
import { isNative } from '@/lib/capacitor-plugins';

// ── Plan data ─────────────────────────────────────────────────────────────────

const PLANS = [{
  id: 'solo',
  name: 'Solo',
  price: '$19',
  period: '/mo',
  description: 'Perfect for sole traders',
  icon: User,
  iconBg: 'bg-slate-700',
  highlight: false,
  features: ['1 user', 'Jobs, estimates & invoices', 'Fleet & GPS tracking', 'Safety forms & SWMS', 'File storage']
}, {
  id: 'team',
  name: 'Team',
  price: '$79',
  period: '/mo',
  description: 'Up to 10 team members',
  icon: Users,
  iconBg: 'bg-violet-600',
  highlight: true,
  badge: 'Most Popular',
  features: ['Up to 10 users', 'Everything in Solo', 'Team scheduling', 'Incident register', 'Risk register & permits']
}, {
  id: 'business',
  name: 'Business',
  price: '$149',
  period: '/mo',
  description: 'Growing construction businesses',
  icon: Zap,
  iconBg: 'bg-amber-600',
  highlight: false,
  features: ['Up to 25 users', 'Everything in Team', 'Xero & QuickBooks sync', 'Advanced reporting', 'Priority support']
}, {
  id: 'enterprise',
  name: 'Enterprise',
  price: 'Custom',
  period: '',
  description: 'Unlimited users + dedicated support',
  icon: Crown,
  iconBg: 'bg-yellow-600',
  highlight: false,
  features: ['Unlimited users', 'Everything in Business', 'Custom integrations', 'Dedicated account manager', 'SLA guarantee']
}];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SubscribePage() {
  const native = isNative();
  return <>
      <Helmet>
        <title>Subscribe — IWILLBUILD</title>
        <meta name="description" content="Choose a plan and start your 30-day free trial of IWILLBUILD construction management software." />
        <link rel="canonical" href="https://iwillbuild.com/subscribe" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="min-h-screen bg-gray-950 text-white flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10" style={{
        paddingTop: native ? 'max(env(safe-area-inset-top), 16px)' : undefined
      }}>
          <Link to="/login" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors" aria-label="Back to sign in">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <span className="text-white font-black text-xs">IW</span>
            </div>
            <span className="font-bold text-white text-sm">IWILLBUILD</span>
          </div>
        </div>

        {/* Hero */}
        <div className="px-5 pt-8 pb-6 text-center">
          <h1 className="text-2xl font-black text-white leading-tight">
            Start your free trial
          </h1>
          <p className="text-sm text-white/50 mt-2 leading-relaxed">
            30 days free. No credit card required.
            <br />
            Cancel any time.
          </p>
        </div>

        {/* Plans */}
        <div className="flex-1 px-4 pb-8 space-y-3">
          {PLANS.map(plan => {
          const PlanIcon = plan.icon;
          return <div key={plan.id} className={['rounded-2xl border p-4 relative', plan.highlight ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'].join(' ')}>
                {/* Popular badge */}
                {'badge' in plan && plan.badge && <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">
                      {plan.badge}
                    </span>
                  </div>}

                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl ${plan.iconBg} flex items-center justify-center shrink-0`}>
                    <PlanIcon size={20} className="text-white" />
                  </div>

                  {/* Name + price */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1">
                      <span className="text-white font-black text-lg">{plan.name}</span>
                      <span className="text-white/40 text-xs ml-auto">
                        <span className="text-white font-bold text-base">{plan.price}</span>
                        {plan.period}
                      </span>
                    </div>
                    <p className="text-white/40 text-xs mt-0.5">{plan.description}</p>
                  </div>
                </div>

                {/* Features */}
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map(f => <li key={f} className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                      <span className="text-white/60 text-xs">{f}</span>
                    </li>)}
                </ul>

                {/* CTA */}
                <Link to={`/signup?plan=${plan.id}`} className={['mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-all', plan.highlight ? 'bg-primary text-white hover:bg-primary/90' : 'bg-white/10 text-white hover:bg-white/20'].join(' ')}>
                  Start free trial
                  <ChevronRight size={15} />
                </Link>
              </div>;
        })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 text-center space-y-3" style={{
        paddingBottom: native ? 'max(env(safe-area-inset-bottom), 32px)' : undefined
      }}>
          <p className="text-white/30 text-xs">
            All plans include a 30-day free trial. No credit card required.
          </p>
          <p className="text-white/30 text-xs">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>;
}

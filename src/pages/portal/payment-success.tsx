import { useSearchParams, Link } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
export default function PortalPaymentSuccessPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? sessionStorage.getItem('portalToken') ?? '';
  return <>
      <Helmet>
        <title>Payment Successful — Client Portal</title>
        <meta name="description" content="Your payment has been received. Thank you for using the IWILLBUILD client portal." />
        <link rel="canonical" href="https://iwillbuild.com/portal/payment-success" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div initial={{
        opacity: 0,
        scale: 0.95
      }} animate={{
        opacity: 1,
        scale: 1
      }} className="bg-white rounded-2xl border border-slate-200 shadow-lg p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-2">Payment received</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Thank you — your payment has been processed successfully. You'll receive a confirmation shortly.
          </p>
          <Link to={`/portal/dashboard?token=${token}`} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-bold hover:bg-violet-700 transition-colors">
            <ArrowLeft size={14} /> Back to portal
          </Link>
        </motion.div>
      </div>
    </>;
}

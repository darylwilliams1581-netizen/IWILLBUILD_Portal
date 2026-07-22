import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ChevronLeft } from 'lucide-react';
import TakeoffPad from '@/components/estimating/TakeoffPad';

export default function TakeoffPadPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>Take-off Pad — IWILLBUILD</title>
        <meta name="description" content="Voice and manual quantity take-off pad for construction estimating." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/takeoff-pad" />
      </Helmet>
      <h1 className="sr-only">Take-off Pad</h1>

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-4 shrink-0" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-gray-400 text-xs font-medium leading-tight">Estimating</p>
            <p className="text-gray-900 font-bold text-xl leading-tight">Take-off Pad</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl w-full mx-auto">
          <TakeoffPad />
        </div>
      </div>
    </div>
  );
}

/**
 * /studio/forms — Standalone Forms page
 * Wraps the existing FormsPage component with its own route shell.
 */
import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { FormsPage } from '@/pages/forms';

export default function StudioFormsPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Helmet>
        <title>Forms — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD form templates — build and complete field forms." />
        <link rel="canonical" href="https://iwillbuild.com/studio/forms" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Header */}
      <header className="sticky top-0 z-30 h-12 bg-white border-b border-border flex items-center px-4 shrink-0 gap-2 safe-top">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Back to Home"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Home</span>
        </button>
        <span className="text-gray-300">|</span>
        <ClipboardList size={17} className="text-primary shrink-0" />
        <h1 className="font-heading font-bold text-base truncate flex-1">Forms</h1>
      </header>

      {/* Forms content — has its own header/tabs internally */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <FormsPage />
      </div>
    </div>
  );
}

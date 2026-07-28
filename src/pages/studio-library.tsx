/**
 * /studio/library — Standalone Library page
 * Toggle between Documents library and Forms library.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, BookOpen, Layers, ClipboardList } from 'lucide-react';
import { LibraryPage as LibraryContent } from '@/pages/library';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';

type LibTab = 'documents' | 'forms';

export default function StudioLibraryPage() {
  const navigate = useNavigate();
  const [libTab, setLibTab] = useState<LibTab>('documents');

  return (
    <div className="flex flex-col flex-1 min-h-0 md:pt-[152px]">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Library — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD content library — browse and install document and form templates." />
        <link rel="canonical" href="https://iwillbuild.com/studio/library" />
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
        <BookOpen size={17} className="text-primary shrink-0" />
        <h1 className="font-heading font-bold text-base truncate flex-1">Library</h1>
      </header>

      {/* Toggle tabs — Documents / Forms */}
      <div className="flex border-b border-slate-200 bg-white px-6 gap-1 shrink-0">
        {([
          { key: 'documents' as LibTab, label: 'Documents', icon: Layers },
          { key: 'forms'     as LibTab, label: 'Forms',     icon: ClipboardList },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setLibTab(key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              libTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Content — LibraryContent handles both types via its own filter UI */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <LibraryContent initialTypeFilter={libTab === 'documents' ? 'document' : 'form'} />
      </div>
    </div>
  );
}

import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { goBack } from '@/lib/navigation';

/** Same back arrow on every Manage (Administration) page. Goes to Manage. */
export default function ManageBackButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => goBack(navigate, '/home?page=3')}
      className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 text-slate-800 hover:bg-slate-100 active:bg-slate-200"
      aria-label="Back"
    >
      <ArrowLeft size={20} />
    </button>
  );
}

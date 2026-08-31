/**
 * PhaseIndicator — shows current Dazza phase (reading / planning / applying / etc.)
 */
import { Loader2, CheckCircle2, AlertCircle, Eye, Cpu, Zap, Search } from 'lucide-react';
import type { AssistantPhase } from './types';

const PHASE_CONFIG: Record<AssistantPhase, { icon: React.ReactNode; color: string; label: string }> = {
  idle:       { icon: null, color: '', label: '' },
  reading:    { icon: <Search size={12} />, color: 'text-sky-600', label: 'Reading' },
  planning:   { icon: <Cpu size={12} />, color: 'text-violet-600', label: 'Planning' },
  applying:   { icon: <Zap size={12} />, color: 'text-amber-600', label: 'Applying' },
  validating: { icon: <Eye size={12} />, color: 'text-blue-600', label: 'Validating' },
  complete:   { icon: <CheckCircle2 size={12} />, color: 'text-emerald-600', label: 'Complete' },
  failed:     { icon: <AlertCircle size={12} />, color: 'text-red-600', label: 'Failed' },
};

interface Props {
  phase: AssistantPhase;
  label: string;
}

export default function PhaseIndicator({ phase, label }: Props) {
  if (phase === 'idle') return null;

  const config = PHASE_CONFIG[phase];
  const isSpinning = phase === 'reading' || phase === 'planning' || phase === 'applying' || phase === 'validating';

  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${config.color}`}>
      {isSpinning ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        config.icon
      )}
      <span>{label || config.label}</span>
    </div>
  );
}

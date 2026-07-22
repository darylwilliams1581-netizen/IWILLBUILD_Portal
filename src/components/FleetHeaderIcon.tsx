/**
 * FleetHeaderIcon
 * A quick-access Truck icon shown in every page header.
 * Tapping it navigates directly to /fleet.
 * Highlights when already on a fleet route.
 */
import { Truck } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function FleetHeaderIcon() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFleet = location.pathname.startsWith('/fleet');

  return (
    <button
      onClick={() => navigate('/fleet')}
      title="Fleet"
      aria-label="Go to Fleet"
      className={`
        flex items-center justify-center w-9 h-9 rounded-lg transition-colors
        ${isFleet
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'}
      `}
    >
      <Truck size={18} />
    </button>
  );
}

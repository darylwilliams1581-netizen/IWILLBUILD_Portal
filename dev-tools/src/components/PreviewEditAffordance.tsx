import { type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { MousePointerClick } from 'lucide-react';

import { injectTooltipStyles } from './tooltipStyles';
import { t } from '../utils/translations';

injectTooltipStyles();

const GAP_ABOVE_POINTER_PX = 10;
const VIEWPORT_MARGIN_PX = 8;
const DEV_TOOLS_ROOT_ID = 'airo-dev-tools-injected';

export interface PreviewEditAffordanceProps {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getPortalTarget(): HTMLElement {
  return document.getElementById(DEV_TOOLS_ROOT_ID) ?? document.body;
}

export function PreviewEditAffordance(props: PreviewEditAffordanceProps): ReactElement | null {
  const { x, y } = props;
  if (typeof document === 'undefined') return null;

  const left: number = clamp(x, VIEWPORT_MARGIN_PX, window.innerWidth - VIEWPORT_MARGIN_PX);
  const top: number = clamp(y - GAP_ABOVE_POINTER_PX, VIEWPORT_MARGIN_PX, window.innerHeight - VIEWPORT_MARGIN_PX);

  const positionStyle: CSSProperties = {
    left,
    top,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  };

  return createPortal(
    <div
      className="airo-tooltip-bubble"
      data-testid="preview-edit-affordance"
      role="status"
      style={positionStyle}
    >
      <MousePointerClick width={16} height={16} aria-hidden="true" strokeWidth={2} />
      <span>{t('devtools_double_click_to_edit', 'Double Click to Edit')}</span>
      <span aria-hidden="true" className="airo-tooltip-arrow" />
    </div>,
    getPortalTarget(),
  );
}

import { AlertTriangle, Info, CheckCircle, ShieldAlert, Shield, AlertOctagon } from 'lucide-react';
import { useDocumentStore } from '../useDocumentStore';
import type { BannerBlock, BannerVariant } from '../types';

interface Props {
  block: BannerBlock;
  columnsBlockId?: string;
  columnId?: string;
}

const VARIANT_STYLES: Record<BannerVariant, { bg: string; border: string; icon: React.ElementType; iconColor: string }> = {
  info:    { bg: 'bg-blue-50',   border: 'border-blue-300',  icon: Info,         iconColor: 'text-blue-500' },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-300', icon: AlertTriangle, iconColor: 'text-amber-500' },
  danger:  { bg: 'bg-red-50',    border: 'border-red-300',   icon: AlertOctagon,  iconColor: 'text-red-500' },
  success: { bg: 'bg-green-50',  border: 'border-green-300', icon: CheckCircle,   iconColor: 'text-green-500' },
  safety:  { bg: 'bg-orange-50', border: 'border-orange-300', icon: Shield,       iconColor: 'text-orange-500' },
  custom:  { bg: 'bg-slate-50',  border: 'border-slate-300', icon: ShieldAlert,   iconColor: 'text-slate-500' },
};

const SIZE_MAP = {
  compact:  { padding: 'px-3 py-2', titleSize: 'text-sm', bodySize: 'text-xs', iconSize: 16 },
  standard: { padding: 'px-4 py-3', titleSize: 'text-base', bodySize: 'text-sm', iconSize: 20 },
  large:    { padding: 'px-5 py-4', titleSize: 'text-lg', bodySize: 'text-base', iconSize: 24 },
};

export default function BannerBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();

  const update = (patch: Partial<BannerBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  const variantStyle = VARIANT_STYLES[block.variant] ?? VARIANT_STYLES.info;
  const sizeStyle = SIZE_MAP[block.size] ?? SIZE_MAP.standard;
  const Icon = variantStyle.icon;

  const bgStyle: React.CSSProperties = block.customBgColor
    ? { backgroundColor: block.customBgColor }
    : {};
  const borderStyle: React.CSSProperties = block.customBorderColor
    ? { borderColor: block.customBorderColor }
    : {};

  return (
    <div
      className={`my-1 rounded-lg border-l-4 ${variantStyle.bg} ${variantStyle.border} ${sizeStyle.padding} ${block.align === 'center' ? 'text-center' : ''}`}
      style={{ ...bgStyle, ...borderStyle }}
    >
      <div className={`flex items-start gap-3 ${block.align === 'center' ? 'justify-center' : ''}`}>
        <Icon size={sizeStyle.iconSize} className={`${variantStyle.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          {mode === 'edit' ? (
            <>
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => update({ title: e.currentTarget.textContent ?? '' })}
                className={`${sizeStyle.titleSize} font-bold text-slate-800 outline-none cursor-text`}
                dangerouslySetInnerHTML={{ __html: block.title }}
              />
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => update({ body: e.currentTarget.textContent ?? '' })}
                className={`${sizeStyle.bodySize} text-slate-600 mt-0.5 outline-none cursor-text`}
                dangerouslySetInnerHTML={{ __html: block.body }}
              />
            </>
          ) : (
            <>
              {block.title && <p className={`${sizeStyle.titleSize} font-bold text-slate-800`}>{block.title}</p>}
              {block.body && <p className={`${sizeStyle.bodySize} text-slate-600 mt-0.5`}>{block.body}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

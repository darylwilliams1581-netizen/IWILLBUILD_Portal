import { useDocumentStore } from '../useDocumentStore';

export default function PageBreakBlockView() {
  const { mode } = useDocumentStore();
  if (mode !== 'edit') {
    return <div className="studio-page-break" style={{ pageBreakAfter: 'always', breakAfter: 'page' }} />;
  }
  return (
    <div className="py-2 flex items-center gap-2">
      <div className="flex-1 border-t-2 border-dashed border-slate-300" />
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-2">Page Break</span>
      <div className="flex-1 border-t-2 border-dashed border-slate-300" />
    </div>
  );
}

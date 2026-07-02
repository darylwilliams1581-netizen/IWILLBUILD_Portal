import { PenLine, Camera, MapPin, Upload, Star, SlidersHorizontal } from 'lucide-react';
import type { FieldBlock } from '../types';

interface Props {
  block: FieldBlock;
}

export default function FieldBlockView({ block }: Props) {
  const labelEl = (
    <label className="block text-xs font-semibold text-slate-700 mb-1">
      {block.label}
      {block.required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );

  const helpEl = block.helpText ? (
    <p className="text-[10px] text-slate-400 mt-0.5">{block.helpText}</p>
  ) : null;

  const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60';

  switch (block.fieldType) {
    case 'short_text':
      return (
        <div className="my-2">
          {labelEl}
          <input type="text" placeholder={block.placeholder ?? ''} defaultValue={block.defaultValue ?? ''} className={inputClass} />
          {helpEl}
        </div>
      );

    case 'long_text':
      return (
        <div className="my-2">
          {labelEl}
          <textarea rows={3} placeholder={block.placeholder ?? ''} defaultValue={block.defaultValue ?? ''} className={`${inputClass} resize-y`} />
          {helpEl}
        </div>
      );

    case 'rich_text_response':
      return (
        <div className="my-2">
          {labelEl}
          <div className="border border-slate-200 rounded-lg p-3 min-h-[80px] text-sm text-slate-400 bg-white">
            Rich text response area
          </div>
          {helpEl}
        </div>
      );

    case 'number':
      return (
        <div className="my-2">
          {labelEl}
          <input type="number" placeholder={block.placeholder ?? ''} defaultValue={block.defaultValue ?? ''} className={inputClass} />
          {helpEl}
        </div>
      );

    case 'date':
      return (
        <div className="my-2">
          {labelEl}
          <input type="date" className={inputClass} />
          {helpEl}
        </div>
      );

    case 'datetime':
      return (
        <div className="my-2">
          {labelEl}
          <input type="datetime-local" className={inputClass} />
          {helpEl}
        </div>
      );

    case 'yes_no':
      return (
        <div className="my-2">
          {labelEl}
          <div className="flex gap-2">
            {['Yes', 'No'].map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name={block.id} value={opt} className="accent-primary" />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
          {helpEl}
        </div>
      );

    case 'checkbox':
      return (
        <div className="my-2 flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 accent-primary" />
          <div>
            <span className="text-sm text-slate-700">{block.label}</span>
            {block.required && <span className="text-red-500 ml-1 text-xs">*</span>}
            {helpEl}
          </div>
        </div>
      );

    case 'single_choice':
      return (
        <div className="my-2">
          {labelEl}
          <div className="flex flex-col gap-1.5">
            {(block.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name={block.id} value={opt} className="accent-primary" />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
          {helpEl}
        </div>
      );

    case 'multi_select':
      return (
        <div className="my-2">
          {labelEl}
          <div className="flex flex-col gap-1.5">
            {(block.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" value={opt} className="accent-primary" />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
          {helpEl}
        </div>
      );

    case 'rating':
      return (
        <div className="my-2">
          {labelEl}
          <div className="flex gap-1">
            {[1,2,3,4,5].map((n) => (
              <Star key={n} size={20} className="text-slate-300 cursor-pointer hover:text-amber-400 transition-colors" />
            ))}
          </div>
          {helpEl}
        </div>
      );

    case 'linear_scale':
      return (
        <div className="my-2">
          {labelEl}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">1</span>
            <input type="range" min={1} max={10} className="flex-1 accent-primary" />
            <span className="text-xs text-slate-400">10</span>
          </div>
          {helpEl}
        </div>
      );

    case 'signature':
      return (
        <div className="my-2">
          {labelEl}
          <div className="border-2 border-dashed border-slate-200 rounded-lg h-20 flex items-center justify-center gap-2 text-slate-400 bg-slate-50">
            <PenLine size={16} />
            <span className="text-xs">Signature area</span>
          </div>
          {helpEl}
        </div>
      );

    case 'photo':
      return (
        <div className="my-2">
          {labelEl}
          <div className="border-2 border-dashed border-slate-200 rounded-lg h-20 flex items-center justify-center gap-2 text-slate-400 bg-slate-50">
            <Camera size={16} />
            <span className="text-xs">Photo / media upload</span>
          </div>
          {helpEl}
        </div>
      );

    case 'file_upload':
      return (
        <div className="my-2">
          {labelEl}
          <div className="border-2 border-dashed border-slate-200 rounded-lg h-16 flex items-center justify-center gap-2 text-slate-400 bg-slate-50">
            <Upload size={16} />
            <span className="text-xs">File upload</span>
          </div>
          {helpEl}
        </div>
      );

    case 'location':
      return (
        <div className="my-2">
          {labelEl}
          <div className="border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2 text-slate-400 bg-slate-50">
            <MapPin size={14} />
            <span className="text-xs">GPS location capture</span>
          </div>
          {helpEl}
        </div>
      );

    default:
      return (
        <div className="my-2">
          {labelEl}
          <input type="text" className={inputClass} />
          {helpEl}
        </div>
      );
  }
}

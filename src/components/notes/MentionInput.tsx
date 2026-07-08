/**
 * MentionInput
 * ─────────────────────────────────────────────────────────────────────────────
 * Textarea with @mention autocomplete.
 * Triggers a dropdown when the user types "@" followed by characters.
 * Selecting a suggestion inserts the full name token.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { AtSign } from 'lucide-react';

export interface MentionMember {
  userId: string;
  name: string;
  role?: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  members: MentionMember[];
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
}

export default function MentionInput({ value, onChange, members, placeholder, minRows = 3, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const filtered = mentionQuery
    ? members.filter((m) => m.name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 8)
    : members.slice(0, 8);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    onChange(val);

    // Detect @mention trigger
    const textBefore = val.slice(0, cursor);
    const atIdx = textBefore.lastIndexOf('@');
    if (atIdx !== -1) {
      const fragment = textBefore.slice(atIdx + 1);
      // Only trigger if no space in fragment (single word / start of name)
      if (!fragment.includes(' ') || fragment.length < 20) {
        setMentionStart(atIdx);
        setMentionQuery(fragment);
        setDropdownOpen(true);
        setActiveIdx(0);
        return;
      }
    }
    setDropdownOpen(false);
    setMentionStart(null);
  }, [onChange]);

  const insertMention = useCallback((member: MentionMember) => {
    if (mentionStart === null) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + 1 + mentionQuery.length);
    const inserted = `@${member.name} `;
    const newVal = before + inserted + after;
    onChange(newVal);
    setDropdownOpen(false);
    setMentionStart(null);
    // Restore focus + cursor
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const pos = before.length + inserted.length;
        el.setSelectionRange(pos, pos);
      }
    }, 0);
  }, [value, mentionStart, mentionQuery, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!dropdownOpen || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filtered[activeIdx]) {
        e.preventDefault();
        insertMention(filtered[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  }, [dropdownOpen, filtered, activeIdx, insertMention]);

  // Close dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder ?? 'Add a note… use @name to tag someone'}
        rows={minRows}
        className="w-full resize-none bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors overflow-hidden disabled:opacity-50"
        style={{ minHeight: `${minRows * 1.6}rem` }}
      />

      {/* @mention hint */}
      {!value && (
        <div className="absolute right-3 bottom-2.5 flex items-center gap-1 pointer-events-none">
          <AtSign size={11} className="text-slate-300" />
          <span className="text-[10px] text-slate-300">mention</span>
        </div>
      )}

      {/* Dropdown */}
      {dropdownOpen && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
        >
          {filtered.map((m, i) => (
            <button
              key={m.userId}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                i === activeIdx ? 'bg-primary/10 text-primary' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center uppercase">
                {m.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{m.name}</p>
                {m.role && <p className="text-[10px] text-slate-400 capitalize">{m.role}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

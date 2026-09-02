with open('src/pages/profile.tsx', 'r') as f:
    content = f.read()

# 1. Add import
old_import = "import { useMe } from '@/lib/usePermissions';"
new_import = "import { useMe } from '@/lib/usePermissions';\nimport { useUploadQueue } from '@/hooks/useUploadQueue';"
if old_import in content:
    content = content.replace(old_import, new_import, 1)
    print('import added OK')
else:
    print('ERROR: import not found')

# 2. Replace old attachment state + fileInputRef with hook
old_state = """  // ── Attachments ───────────────────────────────────────────────────────────
  const [attachments,    setAttachments]    = useState<Attachment[]>([]);
  const [uploading,      setUploading]      = useState(false);
  const [uploadError,    setUploadError]    = useState('');
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);"""

new_state = """  // ── Attachments ───────────────────────────────────────────────────────────
  const [attachments,    setAttachments]    = useState<Attachment[]>([]);
  const [uploadError,    setUploadError]    = useState('');
  const [deletingId,     setDeletingId]     = useState<string | null>(null);

  const attachQ = useUploadQueue({
    endpoint: '/api/me/profile-attachments',
    fieldName: 'file',
    accept: '*/*',
    multiple: false,
    onSuccess: (results) => {
      const resp = results[0]?.response as { attachments?: Attachment[] } | undefined;
      if (resp?.attachments) setAttachments(resp.attachments);
    },
    onError: (_id, msg) => setUploadError(msg),
    validate: () => {
      if (attachments.length >= 5) return 'Maximum 5 attachments allowed.';
      return null;
    },
  });
  const uploading = attachQ.isUploading;
  const fileInputRef = attachQ.inputRef;"""

if old_state in content:
    content = content.replace(old_state, new_state, 1)
    print('state replaced OK')
else:
    print('ERROR: state block not found')

# 3. Remove old handleFileUpload function
old_fn = """  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (attachments.length >= 5) { setUploadError('Maximum 5 attachments allowed.'); return; }
    setUploadError(''); setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/me/profile-attachments', { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json() as { ok?: boolean; attachments?: Attachment[]; error?: string };
      if (!res.ok) { setUploadError(data.error ?? 'Upload failed.'); }
      else { setAttachments(data.attachments ?? []); }
    } catch { setUploadError('Network error.'); } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }"""
if old_fn in content:
    content = content.replace(old_fn, '', 1)
    print('handleFileUpload removed OK')
else:
    print('ERROR: handleFileUpload not found')

# 4. Fix the input onChange
old_input = '<input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />'
new_input = '<input ref={fileInputRef} type="file" className="hidden" onChange={attachQ.handleInputChange} />'
if old_input in content:
    content = content.replace(old_input, new_input, 1)
    print('input onChange fixed OK')
else:
    print('ERROR: input onChange not found')

# 5. Clean up useRef import if no longer needed
import re
ref_usages = [m.start() for m in re.finditer(r'\buseRef\b', content)]
if len(ref_usages) <= 1:
    content = re.sub(r',\s*useRef\b', '', content)
    content = re.sub(r'\buseRef\s*,\s*', '', content)
    print('useRef import cleaned')
else:
    print(f'useRef still used {len(ref_usages)} times — keeping import')

with open('src/pages/profile.tsx', 'w') as f:
    f.write(content)
print('Done')

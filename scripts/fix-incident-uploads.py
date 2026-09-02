with open('src/pages/incident-detail.tsx', 'r') as f:
    content = f.read()

# 1. Add import
old_import = "import MobileOverflowMenu from '@/components/MobileOverflowMenu';"
new_import = "import MobileOverflowMenu from '@/components/MobileOverflowMenu';\nimport { useUploadQueue } from '@/hooks/useUploadQueue';"
if old_import in content:
    content = content.replace(old_import, new_import, 1)
    print('import added OK')
else:
    print('ERROR: import marker not found')

# 2. Remove old state declarations for uploadingFiles and fileInputRef
old_state = "  const [uploadingFiles, setUploadingFiles] = useState(false);\n"
if old_state in content:
    content = content.replace(old_state, '', 1)
    print('uploadingFiles state removed OK')
else:
    print('ERROR: uploadingFiles state not found')

old_ref = "  const fileInputRef = useRef<HTMLInputElement>(null);\n"
# There may be multiple useRef lines; only remove the one near uploadingFiles
# Find it by context
old_ref_ctx = "  const [attachments, setAttachments] = useState<Attachment[]>([]);\n  const [uploadingFiles, setUploadingFiles] = useState(false);\n\n  const fileInputRef = useRef<HTMLInputElement>(null);"
new_ref_ctx = "  const [attachments, setAttachments] = useState<Attachment[]>([]);"
if old_ref_ctx in content:
    content = content.replace(old_ref_ctx, new_ref_ctx, 1)
    print('fileInputRef removed OK')
else:
    print('ERROR: fileInputRef context not found')

# 3. Replace handleUploadFiles with useUploadQueue hook init
# Insert the hook after incidentId is available — find a good anchor
old_anchor = "  const isClosed = incident?.status === 'closed';\n  const pageTitle = isNew ? 'New Incident' : `Incident #${incidentId}`;"
new_anchor = """  const isClosed = incident?.status === 'closed';
  const pageTitle = isNew ? 'New Incident' : `Incident #${incidentId}`;

  // ── Attachment upload queue ────────────────────────────────────────────────
  const attachQ = useUploadQueue({
    endpoint: incidentId ? `/api/incidents/${incidentId}/attachments` : '/api/incidents/0/attachments',
    fieldName: 'files',
    accept: 'image/*,application/pdf',
    multiple: true,
    onSuccess: (results) => {
      const resp = results[0]?.response as { attachments?: Attachment[] } | undefined;
      if (resp?.attachments) setAttachments(prev => [...prev, ...resp.attachments!.filter(a => a.id)]);
    },
  });
  const uploadingFiles = attachQ.isUploading;
  const fileInputRef = attachQ.inputRef;"""

if old_anchor in content:
    content = content.replace(old_anchor, new_anchor, 1)
    print('hook init added OK')
else:
    print('ERROR: anchor not found')

# 4. Remove old handleUploadFiles function
old_fn = """  async function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0 || !incidentId) return;
    setUploadingFiles(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) fd.append('files', files[i]);
      const r = await fetch(`/api/incidents/${incidentId}/attachments`, { method: 'POST', body: fd });
      if (r.ok) {
        const d = await r.json() as { attachments: Attachment[] };
        setAttachments(prev => [...prev, ...d.attachments.filter(a => a.id)]);
      }
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }"""
if old_fn in content:
    content = content.replace(old_fn, '', 1)
    print('handleUploadFiles removed OK')
else:
    print('ERROR: handleUploadFiles not found')

# 5. Fix the input onChange in the JSX
old_input = '<input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => handleUploadFiles(e.target.files)} />'
new_input = '<input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={attachQ.handleInputChange} />'
if old_input in content:
    content = content.replace(old_input, new_input, 1)
    print('input onChange fixed OK')
else:
    print('ERROR: input onChange not found')

with open('src/pages/incident-detail.tsx', 'w') as f:
    f.write(content)
print('Done')

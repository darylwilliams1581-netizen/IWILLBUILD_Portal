import { useCallback, useEffect, useState } from 'react';
import { Camera, Copy, Images, Link2, Loader2, Mail, MessageSquare, Trash2 } from 'lucide-react';
import { useIosMediaPicker } from '@/hooks/useIosMediaPicker';
import { IosMediaInputs, IosPermissionBanner } from '@/components/IosMediaInputs';
import PermissionExplainerModal from '@/components/PermissionExplainerModal';

export interface HazardPhase2Entry {
  id: number;
  photo_path: string | null;
  task_id: number | null;
  task_status: string | null;
  task_assigned_user_id: string | null;
  task_assigned_name: string | null;
}

interface TeamMember { userId: string; name: string; role?: string | null }
interface PublicComment {
  id: number;
  commenter_name: string;
  comment: string;
  action_taken: string;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

export default function HazardPhase2Controls({
  entry,
  onUpdated,
}: {
  entry: HazardPhase2Entry;
  onUpdated: (updated: Record<string, unknown>) => void;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/team/members', { credentials: 'include' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Could not load team')))
      .then((body: { members?: TeamMember[] }) => setMembers(body.members ?? []))
      .catch(() => setMembers([]));
    fetch(`/api/risk-register/${entry.id}/public-comments`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : { comments: [] })
      .then((body: { comments?: PublicComment[] }) => setComments(body.comments ?? []))
      .catch(() => setComments([]));
  }, [entry.id]);

  useEffect(() => {
    if (!entry.photo_path) {
      setPhotoUrl(null);
      return;
    }
    fetch(`/api/risk-register/${entry.id}/photo-url`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Photo unavailable')))
      .then((body: { photo_url?: string }) => setPhotoUrl(body.photo_url ?? null))
      .catch(() => setPhotoUrl(null));
  }, [entry.id, entry.photo_path]);

  useEffect(() => () => {
    if (localPhotoUrl) URL.revokeObjectURL(localPhotoUrl);
  }, [localPhotoUrl]);

  const uploadPhoto = useCallback(async (file: File) => {
    setError('');
    setUploading(true);
    const preview = URL.createObjectURL(file);
    setLocalPhotoUrl(previous => {
      if (previous) URL.revokeObjectURL(previous);
      return preview;
    });
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`/api/risk-register/${entry.id}/photo`, { method: 'POST', body: form, credentials: 'include' });
      const body = await response.json().catch(() => ({})) as { error?: string; photo_url?: string };
      if (!response.ok) throw new Error(body.error || 'Photo upload failed');
      setPhotoUrl(body.photo_url ?? preview);
      onUpdated({ photo_path: 'stored' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  }, [entry.id, onUpdated]);

  const picker = useIosMediaPicker(
    file => { void uploadPhoto(file); },
    files => { if (files[0]) void uploadPhoto(files[0]); },
  );

  async function assign(userId: string) {
    setAssigning(true);
    setError('');
    try {
      const response = await fetch(`/api/risk-register/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ assigned_user_id: userId || null }),
      });
      const body = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Assignment failed');
      onUpdated(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  }

  async function removePhoto() {
    setUploading(true);
    try {
      const response = await fetch(`/api/risk-register/${entry.id}/photo`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('Could not remove photo');
      setPhotoUrl(null);
      setLocalPhotoUrl(null);
      onUpdated({ photo_path: null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove photo');
    } finally {
      setUploading(false);
    }
  }

  async function createShareLink() {
    setSharing(true);
    setError('');
    try {
      const response = await fetch(`/api/risk-register/${entry.id}/share-token`, { method: 'POST', credentials: 'include' });
      const body = await response.json().catch(() => ({})) as { error?: string; path?: string };
      if (!response.ok || !body.path) throw new Error(body.error || 'Could not create link');
      setShareUrl(`https://iwillbuild.com${body.path}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create link');
    } finally {
      setSharing(false);
    }
  }

  async function revokeShareLink() {
    setSharing(true);
    try {
      const response = await fetch(`/api/risk-register/${entry.id}/share-token`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('Could not revoke link');
      setShareUrl('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not revoke link');
    } finally {
      setSharing(false);
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
  }

  const visiblePhoto = localPhotoUrl || photoUrl;
  return <div className="space-y-4 border-t border-slate-100 pt-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-600">Assigned team member</label>
        <select value={entry.task_assigned_user_id ?? ''} disabled={assigning} onChange={event => void assign(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50">
          <option value="">Unassigned</option>
          {members.map(member => <option key={member.userId} value={member.userId}>{member.name}{member.role ? ` — ${member.role}` : ''}</option>)}
        </select>
        {entry.task_id && <p className="mt-1 text-xs text-slate-400">Linked task: {entry.task_status?.replace('_', ' ') || 'open'}</p>}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600">Hazard photo</p>
          {visiblePhoto && <button type="button" disabled={uploading} onClick={() => void removePhoto()} className="flex items-center gap-1 text-xs text-red-600"><Trash2 size={12} /> Remove</button>}
        </div>
        {visiblePhoto && <img src={visiblePhoto} alt="Hazard" className="mb-2 max-h-64 w-full rounded-xl border border-slate-200 object-cover" />}
        <IosMediaInputs picker={picker as Parameters<typeof IosMediaInputs>[0]['picker']} accept="image/*" />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={uploading || picker.checkingPermission} onClick={() => void picker.openCamera()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Camera
          </button>
          <button type="button" disabled={uploading || picker.checkingPermission} onClick={() => void picker.openLibrary({ maxSelections: 1 })} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">
            <Images size={14} /> Photo Library
          </button>
        </div>
        {picker.permissionDenied && <div className="mt-2"><IosPermissionBanner type={picker.permissionDenied} /></div>}
      </div>

      <div className="rounded-xl bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div><p className="text-xs font-semibold text-slate-700">External response link</p><p className="text-xs text-slate-400">Share this hazard for a comment or closure.</p></div>
          {!shareUrl && <button type="button" disabled={sharing} onClick={() => void createShareLink()} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Link2 size={13} /> Create</button>}
        </div>
        {shareUrl && <div className="mt-3 space-y-2">
            <input readOnly value={shareUrl} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600" />
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => void copyShareLink()} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold"><Copy size={12} /> Copy</button>
              <a href={`sms:?&body=${encodeURIComponent(shareUrl)}`} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold"><MessageSquare size={12} /> SMS</a>
              <a href={`mailto:?subject=${encodeURIComponent('Hazard action required')}&body=${encodeURIComponent(shareUrl)}`} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold"><Mail size={12} /> Email</a>
            </div>
            <button type="button" disabled={sharing} onClick={() => void revokeShareLink()} className="text-xs font-medium text-red-600">Revoke this link</button>
          </div>}
      </div>

      {comments.length > 0 && <div>
          <p className="mb-2 text-xs font-semibold text-slate-600">External responses</p>
          <div className="space-y-2">
            {comments.map(item => <div key={item.id} className="rounded-xl border border-slate-100 bg-white p-3">
                <div className="flex justify-between gap-2 text-xs"><span className="font-semibold text-slate-700">{item.commenter_name}</span><span className="text-slate-400">{new Date(item.created_at).toLocaleDateString('en-AU')}</span></div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.comment}</p>
                {item.action_taken === 'close' && <p className="mt-1 text-xs font-semibold text-emerald-600">Closed the hazard</p>}
              </div>)}
          </div>
        </div>}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {picker.explainer && <PermissionExplainerModal open={true} type={picker.explainer.type} denied={picker.explainer.denied} onNotNow={picker.explainer.onNotNow} onEnable={picker.explainer.onEnable} />}
    </div>;
}

/**
 * useDazzaBuilderChat — core hook for the Dazza Builder Assistant.
 * Manages SSE streaming, conversation state, proposed changes, and apply/undo.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { nanoid } from 'nanoid';
import type {
  BuilderContext,
  BuilderOperation,
  ChatMessage,
  ProposedChange,
  AssistantPhase,
  AssistantVersion,
} from './types';

interface UseDazzaBuilderChatOptions {
  builderContext: BuilderContext;
  /** Called after a successful apply so the builder can reload */
  onApplied?: (versionId: string, versionNumber: number) => void;
}

export function useDazzaBuilderChat({ builderContext, onApplied }: UseDazzaBuilderChatOptions) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<AssistantPhase>('idle');
  const [phaseLabel, setPhaseLabel] = useState('');
  const [pendingChange, setPendingChange] = useState<ProposedChange | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [versions, setVersions] = useState<AssistantVersion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const conversationIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  // Guards against double-send (button click + Enter on same frame)
  const sendingRef = useRef(false);
  // Guards against double-apply (button click + keyboard on same frame)
  const applyingRef = useRef(false);

  // Load version history when template changes
  useEffect(() => {
    if (!builderContext.templateId) { setVersions([]); return; }
    fetch(
      `/api/dazza/builder/versions?templateId=${builderContext.templateId}&builderType=${builderContext.builderType}&limit=10`,
      { credentials: 'include' },
    )
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.versions) setVersions(data.versions); })
      .catch(() => {});
  }, [builderContext.templateId, builderContext.builderType]);

  // ── Stale-context guard ────────────────────────────────────────────────────
  // When the target template changes (e.g. user navigates from builder back to
  // the list page, or opens a different template), clear any pending proposal
  // and reset the conversation ID so old proposal cards can't be applied against
  // the wrong template.  Messages are intentionally kept so the user can read
  // the conversation history — only the actionable pending change is cleared.
  const prevTemplateIdRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    // undefined = first render, skip
    if (prevTemplateIdRef.current === undefined) {
      prevTemplateIdRef.current = builderContext.templateId;
      return;
    }
    if (prevTemplateIdRef.current !== builderContext.templateId) {
      prevTemplateIdRef.current = builderContext.templateId;
      // Abort any in-flight stream
      abortRef.current?.abort();
      // Clear actionable state — stale proposals must not be applied
      setPendingChange(null);
      setPhase('idle');
      setPhaseLabel('');
      setError(null);
      // Reset conversation ID so the next message starts a fresh context
      conversationIdRef.current = null;
      // Strip proposedChange from all existing messages so stale Apply cards
      // disappear — the ProposedChangeCard would block them anyway via
      // getApplyBlockReason, but removing them is cleaner UX.
      setMessages(prev =>
        prev.map(m => m.proposedChange ? { ...m, proposedChange: undefined } : m),
      );
    }
  }, [builderContext.templateId]);

  const sendMessage = useCallback(async (text: string, attachmentIds?: string[]) => {
    if (!text.trim() || phase === 'reading' || phase === 'planning' || phase === 'applying') return;
    // Prevent double-send from simultaneous button click + Enter keydown
    if (sendingRef.current) return;
    sendingRef.current = true;

    setError(null);
    setPendingChange(null);

    const userMsg: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
    };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsgId = nanoid();
    streamingMsgIdRef.current = assistantMsgId;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    setPhase('reading');
    setPhaseLabel('Reading context…');

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const resp = await fetch('/api/dazza/builder/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abort.signal,
        body: JSON.stringify({
          message: text.trim(),
          conversationId: conversationIdRef.current,
          builderContext,
          attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(errData.error ?? `HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(data); } catch { continue; }

          switch (event.type) {
            case 'token': {
              const token = String(event.content ?? '');
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: m.content + token } : m,
              ));
              break;
            }
            case 'status':
              setPhase(event.phase as AssistantPhase ?? 'planning');
              setPhaseLabel(String(event.label ?? ''));
              break;
            case 'tool_call':
              if (event.status === 'running') {
                setPhase('planning');
                setPhaseLabel(String(event.name ?? ''));
              }
              break;
            case 'proposed_change': {
              const change = event.change as ProposedChange;
              setPendingChange(change);
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, proposedChange: change } : m,
              ));
              break;
            }
            case 'done': {
              conversationIdRef.current = String(event.conversationId ?? conversationIdRef.current ?? '');
              setPhase('complete');
              setPhaseLabel('Done');
              setTimeout(() => { setPhase('idle'); setPhaseLabel(''); }, 2000);
              break;
            }
            case 'error': {
              const errMsg = String(event.message ?? 'Unknown error');
              setError(errMsg);
              setPhase('failed');
              setPhaseLabel(errMsg);
              setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
              break;
            }
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setPhase('idle');
        setPhaseLabel('');
        setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase('failed');
        setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
      }
    } finally {
      abortRef.current = null;
      streamingMsgIdRef.current = null;
      sendingRef.current = false;
    }
  }, [phase, builderContext]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const applyChange = useCallback(async (change: ProposedChange) => {
    if (isApplying) return;
    // Prevent double-apply from simultaneous button click + keyboard activation
    if (applyingRef.current) return;
    applyingRef.current = true;

    // ── Resolve the authoritative template ID ────────────────────────────────
    // Use canonicalTemplateId (from the URL route param) as the ground truth
    // when the Zustand store hasn't populated yet (templateId still null on
    // first render). This prevents a null templateId being sent to the server
    // when the user clicks Apply before the store's loadTemplate has run.
    const effectiveTemplateId =
      builderContext.templateId ??
      builderContext.canonicalTemplateId ??
      null;

    // ── Pre-flight validation ────────────────────────────────────────────────
    // Reject if the proposal was stamped for a different builder type.
    if (change.targetBuilderType !== builderContext.builderType) {
      setError(`Cannot apply: proposal targets "${change.targetBuilderType}" but current builder is "${builderContext.builderType}".`);
      setPhase('failed');
      applyingRef.current = false;
      return;
    }

    // Reject if the proposal targets a specific template that no longer matches
    // the currently open template (e.g. user navigated away between propose and apply).
    // Compare against effectiveTemplateId so a null store ID doesn't falsely block.
    if (
      change.targetTemplateId !== null &&
      change.targetTemplateId !== undefined &&
      change.targetTemplateId !== effectiveTemplateId
    ) {
      setError(
        `Cannot apply: proposal targets template #${change.targetTemplateId} but ` +
        `the currently open template is ${effectiveTemplateId === null ? 'none' : `#${effectiveTemplateId}`}. ` +
        'Please re-run the request on the correct template.',
      );
      setPhase('failed');
      applyingRef.current = false;
      return;
    }

    // Reject if no template is open AND the first op is not createNewTemplate.
    if (
      change.targetTemplateId === null &&
      change.operations[0]?.op !== 'createNewTemplate'
    ) {
      setError('Cannot apply: no template is open and the proposal does not include a createNewTemplate operation. Open or create a template first.');
      setPhase('failed');
      applyingRef.current = false;
      return;
    }

    setIsApplying(true);
    setPhase('applying');
    setPhaseLabel('Applying changes…');
    setError(null);

    try {
      const resp = await fetch('/api/dazza/builder/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          // Use effectiveTemplateId — never null when a real template is open
          templateId: effectiveTemplateId,
          builderType: builderContext.builderType,
          operations: change.operations,
          instructionSummary: change.summary,
          conversationId: change.conversationId,
        }),
      });

      const data = await resp.json() as {
        ok: boolean;
        error?: string;
        code?: string;
        versionId?: string;
        versionNumber?: number;
        newTemplateId?: number;
        newTemplateName?: string;
      };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? `Apply failed (${resp.status})`);
      }

      setPendingChange(null);
      setPhase('complete');

      // If a new template was created, navigate to it.
      if (data.newTemplateId) {
        const label = data.newTemplateName ? `"${data.newTemplateName}"` : 'new template';
        setPhaseLabel(`Created ${label} — opening…`);
        onApplied?.(data.versionId ?? '', data.versionNumber ?? 1);
        setTimeout(() => {
          navigate(`/studio/builder/${data.newTemplateId}`);
        }, 800);
        return;
      }

      setPhaseLabel(`Version ${data.versionNumber} saved`);

      // Update version list
      setVersions(prev => [{
        id: data.versionId ?? '',
        versionNumber: data.versionNumber ?? 1,
        instructionSummary: change.summary,
        operationsCount: change.operations.length,
        validationResult: 'valid',
        createdAt: new Date().toISOString(),
      }, ...prev]);

      onApplied?.(data.versionId ?? '', data.versionNumber ?? 1);
      setTimeout(() => { setPhase('idle'); setPhaseLabel(''); }, 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Only show the "no longer exists" friendly message for a confirmed
      // TEMPLATE_NOT_FOUND (404) error from the server.  Any other failure
      // (validation error, 400, network error) shows the raw server message
      // so the user can see what actually went wrong.
      const isTemplateGone =
        msg.includes('TEMPLATE_NOT_FOUND') ||
        (msg.includes('does not exist') && msg.includes('deleted'));
      const friendlyMsg = isTemplateGone
        ? 'The template this proposal was created for no longer exists. Please re-run your request on the currently open template.'
        : msg;
      setError(friendlyMsg);
      setPhase('failed');
      setPhaseLabel(friendlyMsg);
      // Clear the stale proposal so the user can try again cleanly
      setPendingChange(null);
      setMessages(prev => prev.map(m =>
        m.proposedChange ? { ...m, proposedChange: undefined } : m,
      ));
    } finally {
      setIsApplying(false);
      applyingRef.current = false;
    }
  }, [builderContext.templateId, builderContext.canonicalTemplateId, builderContext.builderType, isApplying, onApplied, navigate]);

  const undoChange = useCallback(() => {
    setPendingChange(null);
    setMessages(prev => prev.map(m =>
      m.proposedChange ? { ...m, proposedChange: undefined } : m,
    ));
  }, []);

  const restoreVersion = useCallback(async (versionId: string) => {
    setIsApplying(true);
    setPhase('applying');
    setPhaseLabel('Restoring version…');
    setError(null);

    try {
      const resp = await fetch('/api/dazza/builder/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ versionId }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error ?? 'Restore failed');

      setPhase('complete');
      setPhaseLabel(`Restored to version ${data.newVersionNumber}`);
      onApplied?.(data.newVersionId, data.newVersionNumber);
      setTimeout(() => { setPhase('idle'); setPhaseLabel(''); }, 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase('failed');
    } finally {
      setIsApplying(false);
    }
  }, [onApplied]);

  const clearConversation = useCallback(() => {
    conversationIdRef.current = null;
    setMessages([]);
    setPendingChange(null);
    setPhase('idle');
    setPhaseLabel('');
    setError(null);
  }, []);

  return {
    messages,
    phase,
    phaseLabel,
    pendingChange,
    isApplying,
    versions,
    error,
    conversationId: conversationIdRef.current,
    sendMessage,
    stopStreaming,
    applyChange,
    undoChange,
    restoreVersion,
    clearConversation,
  };
}

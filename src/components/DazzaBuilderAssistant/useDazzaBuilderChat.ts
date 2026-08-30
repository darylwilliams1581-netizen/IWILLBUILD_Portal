/**
 * useDazzaBuilderChat — core hook for the Dazza Builder Assistant.
 * Manages SSE streaming, conversation state, proposed changes, and apply/undo.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
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

  const sendMessage = useCallback(async (text: string, attachmentIds?: string[]) => {
    if (!text.trim() || phase === 'reading' || phase === 'planning' || phase === 'applying') return;

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
    }
  }, [phase, builderContext]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const applyChange = useCallback(async (change: ProposedChange) => {
    if (!builderContext.templateId || isApplying) return;
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
          templateId: builderContext.templateId,
          builderType: builderContext.builderType,
          operations: change.operations,
          instructionSummary: change.summary,
          conversationId: change.conversationId,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? `Apply failed (${resp.status})`);
      }

      setPendingChange(null);
      setPhase('complete');
      setPhaseLabel(`Version ${data.versionNumber} saved`);

      // Update version list
      setVersions(prev => [{
        id: data.versionId,
        versionNumber: data.versionNumber,
        instructionSummary: change.summary,
        operationsCount: change.operations.length,
        validationResult: 'valid',
        createdAt: new Date().toISOString(),
      }, ...prev]);

      onApplied?.(data.versionId, data.versionNumber);
      setTimeout(() => { setPhase('idle'); setPhaseLabel(''); }, 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase('failed');
      setPhaseLabel(msg);
    } finally {
      setIsApplying(false);
    }
  }, [builderContext.templateId, builderContext.builderType, isApplying, onApplied]);

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

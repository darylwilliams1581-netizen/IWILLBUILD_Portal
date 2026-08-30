/**
 * dazza-builder/conversation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Conversation persistence and history management for the Dazza Builder
 * Assistant.  Reuses the dazza_v3_conversations table.
 *
 * DESIGN NOTES
 * ─────────────
 * Only user and assistant *text* turns are persisted.  Tool-call exchanges
 * (assistant message with tool_calls + one or more tool result messages) are
 * entirely in-memory within a single request's tool loop and are never written
 * to the DB.  This keeps the persisted history clean and avoids the OpenAI
 * "tool message must follow assistant tool_calls" constraint across requests.
 *
 * sanitiseHistory() is applied to every history array before it is sent to
 * OpenAI.  It removes orphaned tool messages (no preceding assistant
 * tool_calls) and incomplete tool-call groups (assistant tool_calls with no
 * matching tool results), and treats assistant+tool groups as indivisible
 * units when truncating.
 */
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A plain user or assistant text message as stored in the DB. */
export interface PersistedMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The full shape of a message that may appear in the in-memory messages array
 * sent to OpenAI.  Includes the richer assistant+tool_calls shape used inside
 * the tool loop.
 */
export type OAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface OAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of recent user/assistant turns to include in context. */
export const CONTEXT_RECENT_TURNS = 16;

// ── History sanitisation ──────────────────────────────────────────────────────

/**
 * Sanitise a history array before sending to OpenAI.
 *
 * Rules (per requirements):
 * 1. Every tool message must immediately follow an assistant message that
 *    contains tool_calls.
 * 2. An assistant+tool_calls group and all its tool results are indivisible.
 * 3. Orphaned tool messages (no preceding assistant tool_calls) are removed.
 * 4. Incomplete groups (assistant tool_calls with no matching tool results)
 *    are removed entirely — retain the final assistant text summary instead.
 * 5. When truncating to maxTurns, treat each assistant+tool group as one unit.
 *
 * The function is pure (no side-effects) and safe to call multiple times.
 */
export function sanitiseHistory(
  messages: OAIMessage[],
  maxTurns: number = CONTEXT_RECENT_TURNS * 2,
): OAIMessage[] {
  // ── Pass 1: remove orphaned tool messages and incomplete tool-call groups ──
  const cleaned: OAIMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'tool') {
      // Only keep if the immediately preceding cleaned message is an assistant
      // message with tool_calls that contains a matching tool_call_id.
      const prev = cleaned[cleaned.length - 1];
      if (
        prev?.role === 'assistant' &&
        prev.tool_calls?.some((tc) => tc.id === msg.tool_call_id)
      ) {
        cleaned.push(msg);
      }
      // Otherwise: orphaned tool message — silently drop it.
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      // Look ahead: collect all consecutive tool messages that follow.
      const toolResults: OAIMessage[] = [];
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool') {
        toolResults.push(messages[j]);
        j++;
      }

      // Validate: every tool_call must have a matching result.
      const allMatched = msg.tool_calls.every((tc) =>
        toolResults.some(
          (tr) => tr.role === 'tool' && tr.tool_call_id === tc.id,
        ),
      );

      if (allMatched && toolResults.length > 0) {
        // Complete group — include assistant + all tool results.
        cleaned.push(msg);
        for (const tr of toolResults) cleaned.push(tr);
        i = j - 1; // skip ahead past the consumed tool messages
      } else {
        // Incomplete group — drop the entire exchange.
        // The final assistant text summary (if any) was already saved
        // separately as a plain assistant message; it will appear later.
        i = j - 1;
      }
      continue;
    }

    // Plain user / assistant text message — always keep.
    cleaned.push(msg);
  }

  // ── Pass 2: group-aware truncation ────────────────────────────────────────
  if (cleaned.length <= maxTurns) return cleaned;

  // Walk from the end, collecting groups until we hit maxTurns.
  // A "group" is: assistant(tool_calls) + ALL its consecutive tool results.
  // Plain user/assistant messages are single-item groups.
  // We collect groups from the end and prepend them.
  const kept: OAIMessage[] = [];
  let i = cleaned.length - 1;

  while (i >= 0 && kept.length < maxTurns) {
    const msg = cleaned[i];

    if (msg.role === 'tool') {
      // We've hit the end of a tool-call group.  Walk backwards to collect
      // ALL consecutive tool results, then the assistant tool_calls message.
      const group: OAIMessage[] = [];

      // Collect all consecutive tool messages (backwards).
      while (i >= 0 && cleaned[i].role === 'tool') {
        group.unshift(cleaned[i]);
        i--;
      }

      // The assistant tool_calls message must be immediately before.
      if (
        i >= 0 &&
        cleaned[i].role === 'assistant' &&
        (cleaned[i] as Extract<OAIMessage, { role: 'assistant' }>).tool_calls?.length
      ) {
        group.unshift(cleaned[i]);
        i--;
      } else {
        // No matching assistant tool_calls — these are orphans; skip them.
        continue;
      }

      // Only include the group if the entire group fits within the budget.
      if (kept.length + group.length <= maxTurns) {
        kept.unshift(...group);
      }
      // If it doesn't fit, skip the whole group (indivisible).
      continue;
    }

    // Plain user or assistant text message — single-item group.
    kept.unshift(msg);
    i--;
  }

  return kept;
}

// ── DB persistence ────────────────────────────────────────────────────────────

/**
 * Load the persisted user/assistant text history for a conversation.
 * Tool-call exchanges are never persisted, so the returned array contains
 * only plain user and assistant messages.
 */
export async function loadHistory(
  conversationId: string,
  ownerUserId: string,
): Promise<PersistedMessage[]> {
  try {
    const [convData] = await db.execute(sql`
      SELECT role, content FROM dazza_v3_conversations
      WHERE conversation_id = ${conversationId}
        AND owner_user_id = ${ownerUserId}
      ORDER BY turn_index ASC
      LIMIT ${CONTEXT_RECENT_TURNS * 2}
    `) as unknown as [Array<{ role: string; content: string }>, unknown];
    const raw = (convData ?? []) as Array<{
      role: string;
      content: string;
    }>;
    // Defensive: only return rows with valid roles.
    return raw.filter(
      (r): r is PersistedMessage =>
        r.role === 'user' || r.role === 'assistant',
    );
  } catch {
    return [];
  }
}

/**
 * Persist a single user or assistant text message.
 * Never call this for tool or tool_calls messages — those stay in-memory only.
 */
export async function saveMessage(
  conversationId: string,
  ownerUserId: string,
  role: 'user' | 'assistant',
  content: string,
  turnIndex: number,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO dazza_v3_conversations
        (id, conversation_id, owner_user_id, role, content, turn_index)
      VALUES
        (${randomUUID()}, ${conversationId}, ${ownerUserId}, ${role}, ${content}, ${turnIndex})
    `);
  } catch {
    // Non-fatal — conversation history is best-effort.
  }
}

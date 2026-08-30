/**
 * dazza-builder/conversation.ts
 * Conversation persistence — reuses dazza_v3_conversations table.
 * Scoped by owner_user_id to prevent cross-user history leakage.
 */
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const CONTEXT_RECENT_TURNS = 16;

export async function loadHistory(
  conversationId: string,
  ownerUserId: string,
): Promise<Array<{ role: string; content: string }>> {
  try {
    const rows = await db.execute(sql`
      SELECT role, content FROM dazza_v3_conversations
      WHERE conversation_id = ${conversationId}
        AND owner_user_id = ${ownerUserId}
      ORDER BY turn_index ASC
      LIMIT ${CONTEXT_RECENT_TURNS * 2}
    `);
    return ((rows as { rows: unknown[] }).rows ?? []) as Array<{ role: string; content: string }>;
  } catch {
    return [];
  }
}

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
    // Non-fatal
  }
}

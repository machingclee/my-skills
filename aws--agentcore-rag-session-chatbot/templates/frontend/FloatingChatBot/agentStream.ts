/**
 * Transport + parsing for the docs agent.
 *
 * Extracted from AgentChatInterface so the main chat and the `/btw` side panel
 * consume one implementation of the AG-UI event stream. Everything here is pure
 * parsing plus the auth handshake — no UI state. Consumers map the emitted events
 * onto their own state.
 */

import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import { fetchAgentStream } from '@/redux/api/ragApi';

// ── shared UI types ───────────────────────────────────────────────────────

export interface LiveLine {
  type: 'reasoning' | 'tool_call' | 'step';
  text: string;
}

export const LIVE_TEXT_CAP = 160;

export function capLiveText(type: LiveLine['type'], text: string): string {
  if (text.length <= LIVE_TEXT_CAP) return text;
  return type === 'reasoning' ? text.slice(-LIVE_TEXT_CAP) : text.slice(0, LIVE_TEXT_CAP);
}

// ── sanitising ────────────────────────────────────────────────────────────

export function sanitizeAssistantText(text: string): string {
  return text
    .replace(/<[｜|]DSML[｜|]function_calls(\{[^}]*\})?/g, '')
    .replace(/function_calls\{[^}]*\}/g, '')
    .trim();
}

export function sanitizeChunk(text: string): string {
  return text
    .replace(/<[｜|]DSML[｜|]function_calls(\{[^}]*\})?/g, '')
    .replace(/function_calls\{[^}]*\}/g, '');
}

/** 解碼 JSON 轉義字串，包含 \uXXXX 的 Unicode 序列。 */
export function jsonDecodeString(str: string): string {
  try {
    return JSON.parse(`"${str}"`);
  } catch {
    return str;
  }
}

/**
 * Normalize tool-result payloads from AG-UI / AgentCore variants into plain text.
 * Handles: plain string, JSON-escaped string, JSON object/array, content[].text blocks.
 */
export function extractToolResultText(raw: unknown): string {
  if (raw == null) return '';

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    // Try full JSON value first: "Searching for: x" | {"text":"..."} | [{text:"..."}]
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed.trim();
      if (parsed && typeof parsed === 'object') {
        return extractToolResultText(parsed);
      }
    } catch {
      /* not full JSON — maybe only escapes */
    }

    return jsonDecodeString(trimmed).trim();
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item) => extractToolResultText(item))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Common shapes: { text }, { content }, { message }, { result }, { status }
    const preferredKeys = ['text', 'message', 'content', 'result', 'status', 'value', 'output'];
    for (const key of preferredKeys) {
      if (key in obj) {
        const nested = extractToolResultText(obj[key]);
        if (nested) return nested;
      }
    }
    // content: [{ text: "..." }]
    if (Array.isArray(obj.content)) {
      const nested = extractToolResultText(obj.content);
      if (nested) return nested;
    }
  }

  return '';
}

export function isStatusToolName(toolName: string | undefined | null): boolean {
  if (!toolName) return false;
  const n = toolName.trim().toLowerCase();
  return n === 'status' || n === 'status_tool' || n === 'update_status' || n.endsWith('_status');
}

/**
 * Pull rephrased search query from a status line for session naming.
 * Accepts:
 *   Searching for: foo
 *   Searching for foo
 *   🔍 Searching for: foo
 *   and multi-line status blobs that contain that phrase.
 */
export function parseSearchingForQuery(statusLine: string): string | null {
  if (!statusLine) return null;
  const line = statusLine.trim();

  // Prefer exact single-line match (legacy)
  const exact = line.match(/^Searching for:\s*(.+)$/im);
  if (exact?.[1]?.trim()) return exact[1].trim();

  // Soft match: optional leading emoji/prefix, optional colon
  const soft = line.match(/(?:^|\n)\s*(?:[^\w\n]{0,4}\s*)?Searching for:?\s*(.+?)\s*$/im);
  if (soft?.[1]?.trim()) return soft[1].trim();

  return null;
}

// ── auth ──────────────────────────────────────────────────────────────────

export interface AgentBotCredentials {
  username: string;
  password: string;
}

/**
 * Resolve a bearer token for the agent endpoint, signing in as the shared bot user
 * when there is no cached Cognito session. Returns the token plus the user id decoded
 * from it (sent as `forwardedProps.userId`, which the agent currently ignores).
 */
export async function resolveAgentAuth(
  botCredentials?: AgentBotCredentials,
): Promise<{ token: string; userId: string }> {
  let session = await fetchAuthSession().catch(() => null);
  if (!session?.tokens) {
    if (!botCredentials?.username || !botCredentials?.password) {
      throw new Error('Agent bot credentials are not available.');
    }
    await signIn({ username: botCredentials.username, password: botCredentials.password });
    session = await fetchAuthSession();
  }
  const token = session.tokens?.accessToken?.toString() || session.tokens?.idToken?.toString();
  if (!token) throw new Error('No authentication token available.');

  let userId = 'anonymous';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    userId = payload.sub || payload.username || payload['cognito:username'] || 'anonymous';
  } catch { /* fall back to anonymous */ }

  return { token, userId };
}

// ── stream events ─────────────────────────────────────────────────────────

/**
 * Normalized AG-UI events. The reader owns the messy parts (SSE framing, tool-name
 * tracking by toolCallId, the text accumulator, DSML sanitising) so consumers only
 * map events onto their own state.
 */
export type AgentStreamEvent =
  | { kind: 'text'; content: string }
  | { kind: 'reasoning'; delta: string }
  | { kind: 'tool_start'; toolName: string }
  | { kind: 'tool_args'; delta: string }
  | { kind: 'tool_result'; toolName: string; text: string }
  | { kind: 'status'; line: string; rephrased: string | null }
  | { kind: 'step'; name: string }
  | { kind: 'step_end' }
  | { kind: 'state'; state: Record<string, unknown> };

export type AgentStreamEmit = (event: AgentStreamEvent) => void;

/**
 * Consume an agent response, emitting normalized events. Handles both the SSE
 * (`text/event-stream`) and plain-JSON response shapes.
 *
 * Returns the accumulated assistant text, sanitised — consumers use it for the
 * "no response produced" fallback.
 */
export async function readAgentStream(
  response: Response,
  emit: AgentStreamEmit,
): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/event-stream')) {
    const data = await response.json();
    const content = data.content || data.response || data.message || JSON.stringify(data);
    const sanitized = sanitizeAssistantText(content);
    emit({ kind: 'text', content: sanitized });
    return sanitized;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedContent = '';
  let currentTool = '';
  const toolNamesById = new Map<string, string>();   // tracks by toolCallId for batched calls

  const pushText = (chunk: string) => {
    accumulatedContent += sanitizeChunk(chunk);
    emit({ kind: 'text', content: sanitizeAssistantText(accumulatedContent) });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr || dataStr === '[DONE]') continue;

      try {
        const event = JSON.parse(dataStr);
        const type = event.type;

        if (type === 'STATE_SNAPSHOT' || type === 'STATE_DELTA' || type === 'state') {
          const state = event.state || event.snapshot || event.delta || event;
          if (state && typeof state === 'object') {
            emit({ kind: 'state', state });
          }
          continue;
        }

        if (type === 'REASONING_MESSAGE_CONTENT') {
          const delta = event.delta || '';
          if (delta) emit({ kind: 'reasoning', delta });
          continue;
        }

        if (type === 'TOOL_CALL_START') {
          const toolName = event.tool_call_name || event.toolCallName || 'tool';
          const toolCallId = event.toolCallId || event.tool_call_id || '';
          currentTool = toolName;
          if (toolCallId) toolNamesById.set(toolCallId, toolName);
          emit({ kind: 'tool_start', toolName });
          continue;
        }

        if (type === 'TOOL_CALL_ARGS') {
          const delta = event.delta || '';
          if (delta) emit({ kind: 'tool_args', delta });
          continue;
        }

        if (type === 'TOOL_CALL_RESULT') {
          // Resolve tool name by toolCallId (handles batched calls) or fall back to last seen
          const resultToolId = event.toolCallId || event.tool_call_id || '';
          const toolName =
            (resultToolId && toolNamesById.get(resultToolId)) ||
            event.tool_call_name ||
            event.toolCallName ||
            currentTool;

          // Content can live in several AG-UI / AgentCore fields
          const rawContent =
            event.content ??
            event.result ??
            event.delta ??
            event.message ??
            event.output ??
            event.value ??
            null;
          const text = extractToolResultText(rawContent);

          // Prefer tool name === status*; also accept any result that parses as "Searching for: …"
          const treatAsStatus =
            isStatusToolName(toolName) ||
            (!!text && parseSearchingForQuery(text) != null);

          if (treatAsStatus) {
            if (text) {
              emit({ kind: 'status', line: text, rephrased: parseSearchingForQuery(text) });
            }
          } else {
            const previewSource = text || (typeof event.content === 'string' ? event.content : '');
            if (previewSource) {
              emit({
                kind: 'tool_result',
                toolName: toolName || 'tool',
                text: previewSource.replace(/^"|"$/g, ''),
              });
            }
          }
          continue;
        }

        if (type === 'STEP_STARTED') {
          emit({ kind: 'step', name: event.step_name || event.stepName || '' });
          continue;
        }
        if (type === 'STEP_FINISHED') {
          emit({ kind: 'step_end' });
          continue;
        }

        let chunk = '';
        if (type === 'text' || type === 'TEXT_MESSAGE_CONTENT') {
          chunk = event.content || event.delta || '';
        } else if (type === 'message' && event.content) {
          chunk = event.content;
        } else if (event.delta) {
          chunk = event.delta;
        } else if (typeof event.content === 'string') {
          chunk = event.content;
        }

        pushText(chunk);
      } catch {
        // Not JSON we understand — treat the raw payload as text, as before.
        if (dataStr) pushText(dataStr);
      }
    }
  }

  return sanitizeAssistantText(accumulatedContent);
}

/**
 * POST one turn and stream it back through `emit`. The caller owns retries and state
 * resets between attempts.
 */
export async function runAgentTurn(params: {
  threadId: string;
  runId: string;
  content: string;
  messageId: string;
  agentState: Record<string, unknown>;
  forwardedProps: Record<string, unknown>;
  token: string;
  emit: AgentStreamEmit;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetchAgentStream(
    {
      threadId: params.threadId,
      runId: params.runId,
      messages: [{ id: params.messageId, role: 'user' as const, content: params.content }],
      state: params.agentState,
      tools: [],
      context: [],
      forwardedProps: params.forwardedProps as { userId: string; sideQuestionOf?: string },
    },
    params.token,
    params.signal ? { signal: params.signal } : undefined,
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Agent error (${response.status}): ${errorText}`);
  }

  return readAgentStream(response, params.emit);
}

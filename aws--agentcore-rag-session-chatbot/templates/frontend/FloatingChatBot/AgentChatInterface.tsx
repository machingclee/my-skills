import { useState, useRef, useEffect, useCallback } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import './AgentChatInterface.css';
import CustomMarkdown from '@/components/CustomMarkdown';
import Spacer from './Spacer';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import chatSlice from '@/redux/slices/chatSlice';
import ragApi, {
  fetchAgentStream,
  type HistoryApiMessage,
  type HistoryContentBlock,
} from '@/redux/api/ragApi';
import { RiRobot2Line } from 'react-icons/ri';

/** Cognito pool for AgentCore CUSTOM_JWT. Dummy bot user is public by design. */
export const COGNITO = {
  userPoolId: '{{COGNITO_USER_POOL_ID}}',
  userPoolClientId: '{{COGNITO_CLIENT_ID}}',
  username: '{{BOT_USERNAME}}',
  password: '{{BOT_PASSWORD}}',
} as const;

try {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: COGNITO.userPoolId,
        userPoolClientId: COGNITO.userPoolClientId,
        loginWith: { username: true },
      },
    },
  });
} catch { /* already configured */ }

const WELCOME_MESSAGE = "{{WELCOME_MESSAGE}}";
const UNTITLED_SESSION_NAME = "Untitled";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface LiveLine {
  type: 'reasoning' | 'tool_call' | 'step';
  text: string;
}

const LIVE_LINE_LABEL: Record<LiveLine['type'], string> = {
  reasoning: 'THINK',
  tool_call: 'TOOL',
  step: 'STEP',
};

const LIVE_TEXT_CAP = 160;

function capLiveText(type: LiveLine['type'], text: string): string {
  if (text.length <= LIVE_TEXT_CAP) return text;
  return type === 'reasoning' ? text.slice(-LIVE_TEXT_CAP) : text.slice(0, LIVE_TEXT_CAP);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function createWelcomeMessage(): Message {
  return {
    id: 'welcome',
    role: 'assistant',
    content: WELCOME_MESSAGE,
    timestamp: new Date(),
  };
}

function sanitizeAssistantText(text: string): string {
  return text
    .replace(/<[｜|]DSML[｜|]function_calls(\{[^}]*\})?/g, '')
    .replace(/function_calls\{[^}]*\}/g, '')
    .trim();
}

function sanitizeChunk(text: string): string {
  return text
    .replace(/<[｜|]DSML[｜|]function_calls(\{[^}]*\})?/g, '')
    .replace(/function_calls\{[^}]*\}/g, '');
}

/** 解碼 JSON 轉義字串，包含 \uXXXX 的 Unicode 序列。 */
function jsonDecodeString(str: string): string {
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
function extractToolResultText(raw: unknown): string {
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

function isStatusToolName(toolName: string | undefined | null): boolean {
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
function parseSearchingForQuery(statusLine: string): string | null {
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

/** 從歷史內容陣列中提取純文字（跳過工具區塊）。 */
function extractTextContent(content: HistoryContentBlock[] | undefined): string {
  if (!content?.length) return '';
  return content
    .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * 將 S3/會話歷史訊息轉換為 UI 使用者/助理對話回合。
 * 忽略 toolUse / toolResult 列；僅保留純文字訊息。
 */
function historyToMessages(apiMessages: HistoryApiMessage[]): Message[] {
  const result: Message[] = [createWelcomeMessage()];

  for (const entry of apiMessages) {
    const role = entry.message?.role;
    const text = extractTextContent(entry.message?.content);
    if (!text) continue;
    if (role !== 'user' && role !== 'assistant') continue;

    result.push({
      id: `hist-${entry.message_id ?? generateId()}`,
      role,
      content: role === 'assistant' ? sanitizeAssistantText(text) : text,
      timestamp: entry.created_at ? new Date(entry.created_at) : new Date(),
    });
  }

  return result;
}

// ── ChatTurn ──────────────────────────────────────────────────────────
// During streaming, THINK / TOOL / STEP / status overwrite one live line.

function toSingleLine(text: string, max = 100): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return compact.slice(0, max - 1) + '…';
}

function formatLiveText(type: LiveLine['type'], text: string, max = 100): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return type === 'reasoning' ? 'Thinking …' : '';
  if (compact.length <= max) return compact;
  // Thinking streams as a ticker of the latest tokens; tools/status keep the start.
  if (type === 'reasoning') return '…' + compact.slice(-(max - 1));
  return compact.slice(0, max - 1) + '…';
}

function ChatTurn({
  userContent,
  assistantContent,
  liveLine,
  isStreaming,
  timestamp,
  statusLines,
}: {
  userContent: string;
  assistantContent: string;
  liveLine: LiveLine | null;
  isStreaming: boolean;
  timestamp: Date;
  statusLines: string[];
}) {
  const label = liveLine ? LIVE_LINE_LABEL[liveLine.type] : null;
  const liveText = liveLine
    ? formatLiveText(liveLine.type, liveLine.text)
    : 'Thinking ...';

  return (
    <>
      {/* User message */}
      <div className="message user-message">
        <div className="message-bubble">
          <div className="message-content">{userContent}</div>
          <span className="message-time">
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Assistant message */}
      <div className="message bot-message">
        <div className="message-bubble">
          {statusLines.length > 0 && (
            <div className="status-timeline">
              {statusLines.map((line, i) => {
                const isLatest = i === statusLines.length - 1;
                return (
                  <div
                    key={i}
                    className={`status-timeline__row${isLatest ? ' is-latest' : ''}`}
                  >
                    <div className="status-timeline__rail">
                      {i < statusLines.length - 1 && (
                        <div className="status-timeline__connector" />
                      )}
                      <div
                        className={`status-timeline__dot${isLatest && isStreaming ? ' is-active' : ''}`}
                      />
                    </div>
                    <div className="status-timeline__text">
                      {line}
                      {isLatest && isStreaming && !liveLine && (
                        <CircularProgress size={12} style={{ color: '#667099', flexShrink: 0 }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {isStreaming && (liveLine || statusLines.length === 0) && (
            <div className="live-status-line">
              {label && <span className="live-status-line__label">{label}</span>}
              <span
                className="live-status-line__text"
                title={liveLine ? toSingleLine(liveLine.text, 240) : undefined}
              >
                {liveText}
              </span>
              <CircularProgress size={12} style={{ color: '#667099', flexShrink: 0 }} />
            </div>
          )}
          {assistantContent ? (
            <CustomMarkdown content={assistantContent || ""} />
          ) : null}
          <span className="message-time">
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </>
  );
}


// ── AgentChatInterface ────────────────────────────────────────────────

export default function ChatInterface({ onClose }: { onClose?: () => void }) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((state) => state.chat.sessions ?? { sessionIds: [], idToSession: {} });
  const isMaximized = useAppSelector((state) => !!state.chat.chatbotMaximized);
  const [fetchSessionMessages] = ragApi.endpoints.getSessionMessages.useLazyQuery();

  const threadIdRef = useRef<string>(crypto.randomUUID());
  const sessionSavedRef = useRef(false);

  const [messages, setMessages] = useState<Message[]>([createWelcomeMessage()]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string>(threadIdRef.current);

  const [agentState, setAgentState] = useState<Record<string, unknown>>({});
  const [liveLine, setLiveLine] = useState<LiveLine | null>(null);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentToolRef = useRef<string>('');
  const toolNamesById = useRef<Map<string, string>>(new Map()); // tracks by toolCallId for batched calls
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveLine, statusLines, scrollToBottom]);

  // Close history panel on outside click
  useEffect(() => {
    if (!showHistory) return;
    const onPointerDown = (e: MouseEvent) => {
      if (historyPanelRef.current && !historyPanelRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showHistory]);

  const resetLocalChatState = useCallback(() => {
    setLiveLine(null);
    setStatusLines([]);
    setAgentState({});
    setError(null);
    setInput('');
    currentToolRef.current = '';
    toolNamesById.current.clear();
  }, []);

  const ensureSessionSaved = useCallback((sessionId: string) => {
    if (sessionSavedRef.current) return;
    sessionSavedRef.current = true;
    dispatch(chatSlice.actions.saveChatSession({ sessionId, name: UNTITLED_SESSION_NAME }));
  }, [dispatch]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (isLoading || isLoadingHistory) return;

    setShowHistory(false);
    setIsLoadingHistory(true);
    setError(null);
    resetLocalChatState();

    threadIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    sessionSavedRef.current = !!sessions.idToSession[sessionId];

    try {
      // preferCacheValue: true → RTK Query cache hit when not invalidated after SSE
      const result = await fetchSessionMessages(sessionId, true).unwrap();
      const apiMessages: HistoryApiMessage[] = result?.messages ?? [];
      setMessages(historyToMessages(apiMessages));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load session history';
      setError(errorMessage);
      setMessages([createWelcomeMessage()]);
    } finally {
      setIsLoadingHistory(false);
      inputRef.current?.focus();
    }
  }, [isLoading, isLoadingHistory, resetLocalChatState, sessions.idToSession, fetchSessionMessages]);

  const deleteSession = useCallback((sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();

    // Remove from redux-persist local session list
    dispatch(chatSlice.actions.removeChatSession({ sessionId }));
    // Drop cached history for this session
    dispatch(ragApi.util.invalidateTags([{ type: 'SessionMessages', id: sessionId }]));

    // If the deleted session is currently open, start a fresh local session
    if (threadIdRef.current === sessionId || activeSessionId === sessionId) {
      const newId = crypto.randomUUID();
      threadIdRef.current = newId;
      setActiveSessionId(newId);
      sessionSavedRef.current = false;
      setMessages([createWelcomeMessage()]);
      resetLocalChatState();
    }
  }, [dispatch, activeSessionId, resetLocalChatState]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || isLoadingHistory) return;

    setInput('');
    setError(null);
    retryCountRef.current = 0;

    const sessionId = threadIdRef.current;
    ensureSessionSaved(sessionId);

    const msgId = generateId();
    const runId = generateId();

    const userMessage: Message = {
      id: msgId,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const assistantMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setLiveLine(null);
    setStatusLines([]);
    setIsLoading(true);

    const doSend = async () => {
      let session = await fetchAuthSession().catch(() => null);
      if (!session?.tokens) {
        await signIn({ username: COGNITO.username, password: COGNITO.password });
        session = await fetchAuthSession();
      }
      const token = session.tokens?.accessToken?.toString() || session.tokens?.idToken?.toString();

      if (!token) throw new Error('No authentication token available.');

      let userId = 'anonymous';
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.sub || payload.username || payload['cognito:username'] || 'anonymous';
      } catch { /* fall back to anonymous */ }

      const requestBody = {
        threadId: sessionId,
        runId,
        messages: [
          {
            id: msgId,
            role: 'user' as const,
            content: trimmed,
          },
        ],
        state: agentState,
        tools: [],
        context: [],
        forwardedProps: { userId },
      };

      // SSE is streamed via fetchAgentStream (not RTK Query cache) — invalidate session messages after the turn.
      const response = await fetchAgentStream(requestBody, token);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Agent error (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body is not readable');

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (!dataStr || dataStr === '[DONE]') continue;

              try {
                const event = JSON.parse(dataStr);
                let chunk = '';

                if (
                  event.type === 'STATE_SNAPSHOT' ||
                  event.type === 'STATE_DELTA' ||
                  event.type === 'state'
                ) {
                  const newState = event.state || event.snapshot || event.delta || event;
                  if (newState && typeof newState === 'object') {
                    setAgentState((prev) => ({ ...prev, ...newState }));
                  }
                  continue;
                }

                if (event.type === 'REASONING_MESSAGE_CONTENT') {
                  const delta = event.delta || '';
                  setLiveLine((prev) => ({
                    type: 'reasoning',
                    text: capLiveText(
                      'reasoning',
                      (prev?.type === 'reasoning' ? prev.text : '') + delta,
                    ),
                  }));
                  continue;
                }

                if (event.type === 'TOOL_CALL_START') {
                  const toolName = event.tool_call_name || event.toolCallName || 'tool';
                  const toolCallId = event.toolCallId || event.tool_call_id || '';
                  currentToolRef.current = toolName;
                  if (toolCallId) toolNamesById.current.set(toolCallId, toolName);
                  setLiveLine({ type: 'tool_call', text: `Calling ${toolName}...` });
                  continue;
                }
                if (event.type === 'TOOL_CALL_ARGS') {
                  const delta = event.delta || '';
                  if (delta) {
                    setLiveLine((prev) => {
                      if (!prev || prev.type !== 'tool_call') return prev;
                      const current = prev.text.replace(/^Calling.*\.\.\.\s?/, '');
                      return { type: 'tool_call', text: capLiveText('tool_call', current + delta) };
                    });
                  }
                  continue;
                }
                if (event.type === 'TOOL_CALL_RESULT') {
                  // Resolve tool name by toolCallId (handles batched calls) or fall back to last seen
                  const resultToolId = event.toolCallId || event.tool_call_id || '';
                  const toolName =
                    (resultToolId && toolNamesById.current.get(resultToolId)) ||
                    event.tool_call_name ||
                    event.toolCallName ||
                    currentToolRef.current;

                  // Content can live in several AG-UI / AgentCore fields
                  const rawContent =
                    event.content ??
                    event.result ??
                    event.delta ??
                    event.message ??
                    event.output ??
                    event.value ??
                    null;
                  const line = extractToolResultText(rawContent);

                  // Prefer tool name === status*; also accept any result that parses as "Searching for: …"
                  const treatAsStatus =
                    isStatusToolName(toolName) ||
                    (!!line && parseSearchingForQuery(line) != null);

                  if (treatAsStatus) {
                    if (line) {
                      setStatusLines((prev) => (prev[prev.length - 1] === line ? prev : [...prev, line]));
                      setLiveLine(null);
                      const rephrased = parseSearchingForQuery(line);
                      if (rephrased) {
                        dispatch(chatSlice.actions.updateChatSessionName({
                          sessionId,
                          name: rephrased,
                        }));
                      }
                    }
                    continue;
                  }

                  const previewSource = line || (typeof event.content === 'string' ? event.content : '');
                  if (previewSource) {
                    setLiveLine({
                      type: 'tool_call',
                      text: `${toolName || 'tool'} → ${previewSource.replace(/^"|"$/g, '')}`,
                    });
                  }
                  continue;
                }

                if (event.type === 'STEP_STARTED') {
                  const stepName = event.step_name || event.stepName || '';
                  setLiveLine({ type: 'step', text: stepName || 'Working...' });
                  continue;
                }
                if (event.type === 'STEP_FINISHED') {
                  setLiveLine((prev) => (prev?.type === 'step' ? null : prev));
                  continue;
                }

                if (event.type === 'text' || event.type === 'TEXT_MESSAGE_CONTENT') {
                  chunk = event.content || event.delta || '';
                } else if (event.type === 'message' && event.content) {
                  chunk = event.content;
                } else if (event.delta) {
                  chunk = event.delta;
                } else if (typeof event.content === 'string') {
                  chunk = event.content;
                }

                accumulatedContent += sanitizeChunk(chunk);
                const sanitized = sanitizeAssistantText(accumulatedContent);

                setMessages((prev) => {
                  const updated = [...prev];
                  const lastMsg = updated[updated.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...lastMsg,
                      content: sanitized,
                    };
                  }
                  return updated;
                });
              } catch {
                if (dataStr) {
                  accumulatedContent += sanitizeChunk(dataStr);
                  const sanitized = sanitizeAssistantText(accumulatedContent);
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...lastMsg,
                        content: sanitized,
                      };
                    }
                    return updated;
                  });
                }
              }
            }
          }
        }

        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
            updated[updated.length - 1] = {
              ...lastMsg,
              content: sanitizeAssistantText(accumulatedContent) || '(No response)',
            };
          }
          return updated;
        });
      } else {
        const data = await response.json();
        const responseContent =
          data.content || data.response || data.message || JSON.stringify(data);

        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            updated[updated.length - 1] = {
              ...lastMsg,
              content: sanitizeAssistantText(responseContent),
            };
          }
          return updated;
        });
      }
    };

    try {
      await doSend();
    } catch (err) {
      // If the stream broke before producing content (likely maxLifetime container
      // kill), retry once. A new container spins up and restores session state from S3.
      if (retryCountRef.current < 1) {
        retryCountRef.current += 1;
        setError(null);
        setLiveLine(null);
        setStatusLines([]);
        currentToolRef.current = '';
        toolNamesById.current.clear();
        console.log('[handleSend] retrying after stream failure');
        try {
          await doSend();
          return;
        } catch (retryErr) {
          // fall through to error display
        }
      }
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);

      setMessages((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: sanitizeAssistantText(`⚠️ Error: ${errorMessage}`),
          };
        }
        return updated;
      });
    } finally {
      // Session history on S3 changed after agent turn → drop RTK Query cache for this session
      dispatch(ragApi.util.invalidateTags([{ type: 'SessionMessages', id: sessionId }]));
      setIsLoading(false);
      setLiveLine(null);
      inputRef.current?.focus();
    }
  }, [input, isLoading, isLoadingHistory, agentState, ensureSessionSaved, dispatch]);

  const handleClear = useCallback(() => {
    const newId = crypto.randomUUID();
    threadIdRef.current = newId;
    setActiveSessionId(newId);
    sessionSavedRef.current = false;
    setMessages([createWelcomeMessage()]);
    resetLocalChatState();
    setShowHistory(false);
  }, [resetLocalChatState]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ── Build turn pairs from the flat messages array ──────────────────
  // welcome message is standalone; subsequent messages are user/assistant pairs.
  const welcomeMsg = messages[0]?.role === 'assistant' ? messages[0] : null;
  const conversationMsgs = welcomeMsg ? messages.slice(1) : messages;

  interface Turn {
    userMsg: Message;
    botMsg: Message;
  }
  const turns: Turn[] = [];
  // Prefer strict user/assistant pairs; if history is incomplete, still show user rows with empty bot.
  for (let i = 0; i < conversationMsgs.length;) {
    const msg = conversationMsgs[i];
    if (msg.role === 'user') {
      const next = conversationMsgs[i + 1];
      if (next && next.role === 'assistant') {
        turns.push({ userMsg: msg, botMsg: next });
        i += 2;
      } else {
        turns.push({
          userMsg: msg,
          botMsg: {
            id: `empty-${msg.id}`,
            role: 'assistant',
            content: '',
            timestamp: msg.timestamp,
          },
        });
        i += 1;
      }
    } else {
      // orphan assistant message (e.g. final answer without paired user in parse)
      turns.push({
        userMsg: {
          id: `orphan-user-${msg.id}`,
          role: 'user',
          content: '(continued)',
          timestamp: msg.timestamp,
        },
        botMsg: msg,
      });
      i += 1;
    }
  }

  const historyEntries = sessions.sessionIds
    .map((id) => ({ id, ...sessions.idToSession[id] }))
    .filter((entry) => entry.name);

  return (
    <div className="chat-container">
      <header className="chatbot-header">
        <div className="chatbot-header-brand">
          <div className="chatbot-header-icon" aria-hidden="true">
            {/* <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M8 7h8" />
              <path d="M8 11h6" />
            </svg> */}
            <RiRobot2Line size={24} />
          </div>
          <div className="chatbot-header-titles">
            <h3>{{CHAT_TITLE}}</h3>
            <p>Search &amp; continue past chats</p>
          </div>
        </div>

        <div className="chatbot-header-actions">
          <Tooltip title="New Session" arrow placement="bottom">
            <span>
              <button
                type="button"
                className="header-icon-button"
                onClick={handleClear}
                aria-label="New Session"
                disabled={isLoading || isLoadingHistory}
              >
                <AddCircleOutlineIcon style={{ fontSize: 20 }} />
              </button>
            </span>
          </Tooltip>

          <div ref={historyPanelRef} className="chatbot-history-anchor">
            <Tooltip title="View History" arrow placement="bottom">
              <span>
                <button
                  type="button"
                  className={`header-icon-button${showHistory ? ' active' : ''}`}
                  onClick={() => setShowHistory((v) => !v)}
                  aria-label="View History"
                  aria-expanded={showHistory}
                  disabled={isLoading || isLoadingHistory}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {historyEntries.length > 0 && (
                    <span className="history-badge">{historyEntries.length > 9 ? '9+' : historyEntries.length}</span>
                  )}
                </button>
              </span>
            </Tooltip>

            {showHistory && (
              <div className="chat-history-panel chat-history-panel--header">
                <div className="chat-history-header">Sessions</div>
                {historyEntries.length === 0 ? (
                  <div className="chat-history-empty">No previous sessions yet.</div>
                ) : (
                  <ul className="chat-history-list">
                    {historyEntries.map((entry) => {
                      const isActive = entry.id === activeSessionId;
                      return (
                        <li key={entry.id} className="chat-history-row">
                          <button
                            type="button"
                            className={`chat-history-item${isActive ? ' active' : ''}`}
                            onClick={() => loadSession(entry.id)}
                            title={entry.id}
                          >
                            <span className="chat-history-name">{entry.name}</span>
                            {entry.updatedAt && (
                              <span className="chat-history-meta">
                                {new Date(entry.updatedAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            className="chat-history-delete"
                            title="Remove from history"
                            aria-label={`Remove session ${entry.name}`}
                            onClick={(e) => deleteSession(entry.id, e)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          <Tooltip title={isMaximized ? "Exit Fullscreen" : "Fullscreen"} arrow placement="bottom">
            <span>
              <button
                type="button"
                className={`header-icon-button${isMaximized ? ' active' : ''}`}
                onClick={() => dispatch(chatSlice.actions.setChatbotMaximized(!isMaximized))}
                aria-label={isMaximized ? "Exit fullscreen chat" : "Maximize chat"}
                aria-pressed={isMaximized}
              >
                {isMaximized
                  ? <FullscreenExitIcon style={{ fontSize: 20 }} />
                  : <FullscreenIcon style={{ fontSize: 20 }} />}
              </button>
            </span>
          </Tooltip>

          {onClose && (
            <button
              type="button"
              className="header-icon-button close-button"
              onClick={onClose}
              aria-label="Close chat"
              title="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="chatbot-messages">
        <Spacer height={5} />

        {isLoadingHistory && (
          <div className="message bot-message">
            <div className="message-bubble" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Loading session history...
              <CircularProgress size={14} style={{ color: '#667099' }} />
            </div>
          </div>
        )}

        {/* Welcome message */}
        {!isLoadingHistory && welcomeMsg && (
          <div key={welcomeMsg.id} className="message bot-message">
            <div className="message-bubble">
              <CustomMarkdown content={welcomeMsg.content || ""} />
              <span className="message-time">
                {welcomeMsg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        )}

        {!isLoadingHistory && turns.map((turn, i) => {
          const isLast = i === turns.length - 1;
          return (
            <ChatTurn
              key={turn.userMsg.id}
              userContent={turn.userMsg.content}
              assistantContent={turn.botMsg.content}
              liveLine={isLast && isLoading ? liveLine : null}
              isStreaming={isLast && isLoading}
              timestamp={turn.botMsg.timestamp}
              statusLines={isLast ? statusLines : []}
            />
          );
        })}

        {error && (
          <div className="message bot-message">
            <div className="message-bubble" style={{ color: "#ef4444" }}>{error}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chatbot-input">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLoadingHistory ? "Loading history..." : isLoading ? "Thinking..." : "Type your message..."}
          aria-label="Chat message input"
          disabled={isLoadingHistory}
        />
        <button
          className="send-button"
          onClick={handleSend}
          aria-label="Send message"
          disabled={isLoading || isLoadingHistory || !input.trim()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { Amplify } from 'aws-amplify';
import './AgentChatInterface.css';
import CustomMarkdown from '@/components/CustomMarkdown';
import Spacer from './Spacer';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import chatSlice from '@/redux/slices/chatSlice';
import ragApi, {
  sideSeqOf,
  sideThreadId,
  type HistoryApiMessage,
  type HistoryContentBlock,
} from '@/redux/api/ragApi';
import { useGetAgentBotCredentialsQuery } from '@/redux/api/agentBotApi';
import { RiRobot2Line } from 'react-icons/ri';
import {
  capLiveText,
  resolveAgentAuth,
  runAgentTurn,
  sanitizeAssistantText,
  type AgentStreamEvent,
  type LiveLine,
} from './agentStream';

/** Cognito pool for AgentCore CUSTOM_JWT. Bot user/password come from GET /api/agent-bot-credentials. */
export const COGNITO = {
  userPoolId: '{{COGNITO_USER_POOL_ID}}',
  userPoolClientId: '{{COGNITO_CLIENT_ID}}',
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

/** `/btw` followed by the question. Bare `/btw` just opens the panel. */
const BTW_PATTERN = /^\/btw\b\s*/i;

/**
 * Cap on how much of an in-flight main answer is carried into a side question's
 * prompt. The tail is kept: it is the part the user is most likely asking about.
 */
const SIDE_CONTEXT_CAP = 3000;

/**
 * The in-flight main answer is prepended to the side question's *prompt* — the panel shows
 * only the question, but this composed string is what the agent stores as the side turn.
 * So it has to come back off on the way in. Mint and strip sit together here so they
 * cannot drift.
 */
const SIDE_PROMPT_PREFIX = '[The main conversation is still streaming this answer:';
const SIDE_PROMPT_QUESTION = 'Side question: ';

/** The user's own question, out of whatever was actually sent. Untouched when not composed. */
function splitSidePrompt(sentContent: string): string {
  if (!sentContent.startsWith(SIDE_PROMPT_PREFIX)) return sentContent;
  // The question is composed last, so the final marker is ours even if the carried answer
  // happens to contain the same words.
  const marker = sentContent.lastIndexOf(SIDE_PROMPT_QUESTION);
  return marker === -1
    ? sentContent
    : sentContent.slice(marker + SIDE_PROMPT_QUESTION.length);
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const LIVE_LINE_LABEL: Record<LiveLine['type'], string> = {
  reasoning: 'THINK',
  tool_call: 'TOOL',
  step: 'STEP',
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** The one-line timestamp both history lists show under an entry's name. */
function formatHistoryTimestamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createWelcomeMessage(): Message {
  return {
    id: 'welcome',
    role: 'assistant',
    content: WELCOME_MESSAGE,
    timestamp: new Date(),
  };
}

/**
 * Map normalized agent-stream events onto React state. Shared by the main chat and
 * the `/btw` side panel — each passes its own setters, so neither owns a private
 * copy of the AG-UI event semantics.
 */
interface StreamSetters {
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setLiveLine: Dispatch<SetStateAction<LiveLine | null>>;
  setStatusLines: Dispatch<SetStateAction<string[]>>;
  setAgentState: Dispatch<SetStateAction<Record<string, unknown>>>;
}

function applyStreamEvent(event: AgentStreamEvent, s: StreamSetters): void {
  switch (event.kind) {
    case 'state':
      s.setAgentState((prev) => ({ ...prev, ...event.state }));
      break;

    case 'reasoning':
      // Capping overwrites the accumulator — the ticker keeps only the newest tokens.
      s.setLiveLine((prev) => ({
        type: 'reasoning',
        text: capLiveText('reasoning', (prev?.type === 'reasoning' ? prev.text : '') + event.delta),
      }));
      break;

    case 'tool_start':
      s.setLiveLine({ type: 'tool_call', text: `Calling ${event.toolName}...` });
      break;

    case 'tool_args':
      s.setLiveLine((prev) => {
        if (!prev || prev.type !== 'tool_call') return prev;
        const current = prev.text.replace(/^Calling.*\.\.\.\s?/, '');
        return { type: 'tool_call', text: capLiveText('tool_call', current + event.delta) };
      });
      break;

    case 'tool_result':
      s.setLiveLine({ type: 'tool_call', text: `${event.toolName} → ${event.text}` });
      break;

    case 'status':
      s.setStatusLines((prev) => (prev[prev.length - 1] === event.line ? prev : [...prev, event.line]));
      s.setLiveLine(null);
      break;

    case 'step':
      s.setLiveLine({ type: 'step', text: event.name || 'Working...' });
      break;

    case 'step_end':
      s.setLiveLine((prev) => (prev?.type === 'step' ? null : prev));
      break;

    case 'text':
      s.setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: event.content };
        }
        return updated;
      });
      break;
  }
}

interface Turn {
  userMsg: Message;
  botMsg: Message;
}

/**
 * Pair a flat user/assistant list into turns. Incomplete pairs still render (a user
 * row with an empty bot row) so a partially-loaded history is not silently dropped.
 */
function toTurns(conversationMsgs: Message[]): Turn[] {
  const turns: Turn[] = [];
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
  return turns;
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
function historyToMessageList(apiMessages: HistoryApiMessage[]): Message[] {
  const result: Message[] = [];

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

/** Main transcript: the same rows, with the welcome bubble the main chat opens on. */
function historyToMessages(apiMessages: HistoryApiMessage[]): Message[] {
  return [createWelcomeMessage(), ...historyToMessageList(apiMessages)];
}

/**
 * A side thread's stored turns. Same mapping, but no welcome bubble (the panel has none)
 * and the bridge bracket comes off the user turns — see `splitSidePrompt`.
 */
function sideHistoryToMessages(apiMessages: HistoryApiMessage[]): Message[] {
  return historyToMessageList(apiMessages).map((msg) =>
    msg.role === 'user' ? { ...msg, content: splitSidePrompt(msg.content) } : msg
  );
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

const INPUT_MAX_LINES = 10;
/** Side panel geometry. The reserve keeps a slice of the main transcript reachable. */
const DEFAULT_SIDE_PANEL_WIDTH = 360;
const MIN_SIDE_PANEL_WIDTH = 240;
const SIDE_PANEL_RESERVE = 160;
/** Header double-click window and slop, mirroring the OS defaults closely enough. */
const DOUBLE_CLICK_MS = 320;
const DRAG_SLOP = 4;

function ChatInterface({
  onClose,
  onHeaderPointerDown,
}: {
  onClose?: () => void;
  onHeaderPointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
}) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((state) => state.chat.sessions ?? { sessionIds: [], idToSession: {} });
  const isMaximized = useAppSelector((state) => !!state.chat.chatbotMaximized);
  const [fetchSessionMessages] = ragApi.endpoints.getSessionMessages.useLazyQuery();
  const [fetchSideSessionMessages] = ragApi.endpoints.getSideSessionMessages.useLazyQuery();
  const { data: botCredentials, isLoading: isLoadingBotCredentials } = useGetAgentBotCredentialsQuery();

  const threadIdRef = useRef<string>(crypto.randomUUID());
  const sessionSavedRef = useRef(false);

  const toggleMaximized = useCallback(() => {
    dispatch(chatSlice.actions.setChatbotMaximized(!isMaximized));
  }, [dispatch, isMaximized]);

  /**
   * Double-click lives on pointerdown rather than onDoubleClick: dragging the window lays a
   * full-viewport shield over the page (see startGestureChrome), which swallows the click, so
   * the browser dispatches dblclick to <body> — outside the React root — and it never arrives.
   * Returns true when the double-click was consumed, so the drag gesture does not also start.
   */
  const headerClickRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return false;
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, .chat-history-panel')) {
        headerClickRef.current = null;
        return false;
      }
      const now = Date.now();
      const prev = headerClickRef.current;
      const isDoubleClick =
        !!prev &&
        now - prev.time < DOUBLE_CLICK_MS &&
        Math.abs(e.clientX - prev.x) < DRAG_SLOP &&
        Math.abs(e.clientY - prev.y) < DRAG_SLOP;
      headerClickRef.current = isDoubleClick ? null : { time: now, x: e.clientX, y: e.clientY };
      if (!isDoubleClick) return false;
      toggleMaximized();
      return true;
    },
    [toggleMaximized]
  );

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);

  // ── /btw side question ────────────────────────────────────────────────
  // Own thread id, own state, own stream. Never registered as a session, never
  // written into the main transcript — see add-btw.md.
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sideMessages, setSideMessages] = useState<Message[]>([]);
  const [sideInput, setSideInput] = useState('');
  const [sideIsLoading, setSideIsLoading] = useState(false);
  const [sideLiveLine, setSideLiveLine] = useState<LiveLine | null>(null);
  const [sideStatusLines, setSideStatusLines] = useState<string[]>([]);
  const [sideError, setSideError] = useState<string | null>(null);
  const [sideAgentState, setSideAgentState] = useState<Record<string, unknown>>({});
  /**
   * The thread on screen, mirrored out of `sideThreadIdRef` because the side list has to
   * mark it, and a ref alone never re-renders.
   */
  const [activeSideSessionId, setActiveSideSessionId] = useState<string | null>(null);
  const [showSideHistory, setShowSideHistory] = useState(false);
  /** True only while a switched-to thread's transcript is being fetched from S3. */
  const [isLoadingSideHistory, setIsLoadingSideHistory] = useState(false);
  const sideThreadIdRef = useRef<string | null>(null);
  const sideSeqRef = useRef(0);
  const sideRetryCountRef = useRef(0);
  const sideAbortRef = useRef<AbortController | null>(null);
  const sideInputRef = useRef<HTMLTextAreaElement>(null);
  const sideMessagesEndRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLElement>(null);
  const sideHistoryPanelRef = useRef<HTMLDivElement>(null);
  const sideHistoryButtonRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const storedSidePanelWidth = useAppSelector((state) => state.chat.sidePanelWidth);
  const sidePanelWidth = storedSidePanelWidth ?? DEFAULT_SIDE_PANEL_WIDTH;

  /**
   * The width lives in a CSS variable rather than an inline style so the drag can write it
   * straight to the DOM: re-rendering on every pointermove would rebuild each ChatTurn and
   * its markdown. React only repaints the variable when the committed width changes.
   *
   * It is hosted on the body, not on the panel: the panel inherits it for its own width,
   * and the main composer reads the same value to reserve exactly that much room. One
   * variable, so the two can never disagree mid-drag.
   */
  useLayoutEffect(() => {
    chatBodyRef.current?.style.setProperty('--side-panel-width', `${sidePanelWidth}px`);
  }, [sidePanelWidth]);

  const handleSidePanelResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const panel = sidePanelRef.current;
      const body = chatBodyRef.current;
      if (!panel || !body) return;
      e.preventDefault();

      // Measure instead of trusting state: the CSS max-width may have capped the panel.
      const startX = e.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      const maxWidth = Math.max(MIN_SIDE_PANEL_WIDTH, body.clientWidth - SIDE_PANEL_RESERVE);
      const handle = e.currentTarget;
      handle.classList.add('is-resizing');
      // Keeps the pointer from selecting transcript text as it sweeps across the panel.
      body.classList.add('is-resizing-panel');
      let width = startWidth;

      const onMove = (ev: PointerEvent) => {
        width = Math.min(maxWidth, Math.max(MIN_SIDE_PANEL_WIDTH, startWidth - (ev.clientX - startX)));
        // Written to the shared host so the composer tracks the drag in the same frame.
        body.style.setProperty('--side-panel-width', `${width}px`);
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        handle.classList.remove('is-resizing');
        body.classList.remove('is-resizing-panel');
        dispatch(chatSlice.actions.setSidePanelWidth(Math.round(width)));
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [dispatch]
  );

  /** Grow a textarea to fit its content, up to INPUT_MAX_LINES. */
  const adjustInputHeight = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 24;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    const maxHeight = lineHeight * INPUT_MAX_LINES + padding + border;
    // scrollHeight includes padding and excludes the border; height is border-box.
    const needed = el.scrollHeight + border;
    const nextHeight = Math.min(needed, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = needed > maxHeight + 1 ? 'auto' : 'hidden';
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveLine, statusLines, scrollToBottom]);

  useEffect(() => {
    adjustInputHeight(inputRef.current);
  }, [input, adjustInputHeight]);

  useEffect(() => {
    adjustInputHeight(sideInputRef.current);
  }, [sideInput, sidePanelOpen, adjustInputHeight]);

  useEffect(() => {
    const windowEl = inputRef.current?.closest('.chatbot-window');
    if (!windowEl) return;
    const observer = new ResizeObserver(() => {
      adjustInputHeight(inputRef.current);
      adjustInputHeight(sideInputRef.current);
    });
    observer.observe(windowEl);
    return () => observer.disconnect();
  }, [adjustInputHeight]);

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

  // Same for the side list. It has two refs because the toggle and the dropdown are not
  // siblings — the dropdown hangs off the panel rather than the toolbar, which sits in the
  // transcript scroller and would clip it.
  useEffect(() => {
    if (!showSideHistory) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sideHistoryPanelRef.current?.contains(target)) return;
      if (sideHistoryButtonRef.current?.contains(target)) return;
      setShowSideHistory(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showSideHistory]);

  const resetLocalChatState = useCallback(() => {
    setLiveLine(null);
    setStatusLines([]);
    setAgentState({});
    setError(null);
    setInput('');
  }, []);

  /** The ref and its render mirror always move together — see `activeSideSessionId`. */
  const setActiveSideThread = useCallback((sideId: string | null) => {
    sideThreadIdRef.current = sideId;
    setActiveSideSessionId(sideId);
  }, []);

  /**
   * Abandon the current side thread and start clean. The next ask mints a new thread id,
   * re-reading the parent transcript and picking up main turns that finished since. The
   * abandoned thread is *not* dropped here: it stays in the parent's side list, reachable
   * and deletable from there, which is what keeps a cleared side question from being lost.
   */
  const clearSideThread = useCallback(() => {
    sideAbortRef.current?.abort();
    sideAbortRef.current = null;
    setActiveSideThread(null);
    sideRetryCountRef.current = 0;
    setSideMessages([]);
    setSideInput('');
    setSideIsLoading(false);
    setIsLoadingSideHistory(false);
    setSideLiveLine(null);
    setSideStatusLines([]);
    setSideError(null);
    setSideAgentState({});
  }, [setActiveSideThread]);

  /** Side questions are bound to their parent session, so a session switch drops them. */
  const resetSidePanel = useCallback(() => {
    clearSideThread();
    setSidePanelOpen(false);
    setShowSideHistory(false);
  }, [clearSideThread]);

  const ensureSessionSaved = useCallback((sessionId: string) => {
    if (sessionSavedRef.current) return;
    sessionSavedRef.current = true;
    dispatch(chatSlice.actions.saveChatSession({ sessionId, name: UNTITLED_SESSION_NAME }));
  }, [dispatch]);

  /**
   * Read one side thread's own turns back from S3, or `null` when there is nothing to show
   * (unknown thread, failed fetch). The single place both restore paths go through, so the
   * staleness guard below is written once.
   *
   * The guard is what keeps a late payload from being written over whatever the user is
   * looking at now: the ref only still points here if this thread is the one on screen.
   */
  const fetchSideHistory = useCallback(async (parentSessionId: string, sideId: string) => {
    const sideSeq = sideSeqOf(sideId);
    if (!sideSeq) return null;
    try {
      const result = await fetchSideSessionMessages({ parentSessionId, sideSeq }, true).unwrap();
      if (sideThreadIdRef.current !== sideId) return null;
      return sideHistoryToMessages(result?.messages ?? []);
    } catch {
      // Display-only. The panel simply starts empty.
      return null;
    }
  }, [fetchSideSessionMessages]);

  /**
   * Fill the panel from S3 for the side thread this session left open before the page
   * reloaded.
   *
   * Restoring here rather than when the panel opens is what makes it race-free: the app can
   * only resume a stored session through `loadSession`, which serializes itself and resets
   * the panel first. It also covers the header `/btw` toggle, which opens the panel without
   * going through `handleSubmit`.
   *
   * Silent by design: a failure leaves the panel empty and says nothing, because a red
   * bubble about something the user did not just do is worse than no history — and
   * `sideError` is only cleared by the next ask. Local messages win, so a question asked
   * while this was in flight is not overwritten by older history that arrived late.
   */
  const restoreSideHistory = useCallback(async (parentSessionId: string, sideId: string) => {
    const restored = await fetchSideHistory(parentSessionId, sideId);
    if (!restored?.length) return;
    setSideMessages((prev) => (prev.length ? prev : restored));
  }, [fetchSideHistory]);

  /**
   * Show another side thread of this session. Unlike the restore above this one does
   * replace what is on screen: switching threads is the user saying the current transcript
   * is not the one they want.
   */
  const selectSideThread = useCallback(async (sideId: string) => {
    setShowSideHistory(false);
    // Already on screen. An *empty* one still goes through: that is a thread whose restore
    // failed or was cut short, and picking it again is the natural way to retry.
    if (sideId === sideThreadIdRef.current && sideMessages.length) return;
    const parentId = threadIdRef.current;
    // Drops the previous thread's transcript and aborts its stream, if it had one.
    clearSideThread();
    setActiveSideThread(sideId);
    // Never *lower* the floor while switching: the next mint has to clear every number in
    // use, including the threads this switch moved away from. Switching to `:btw:1` of a
    // `1..3` session must still mint `:btw:4`, or the new thread would read 2's turns back
    // off S3 as its own.
    sideSeqRef.current = Math.max(sideSeqRef.current, sideSeqOf(sideId));
    setIsLoadingSideHistory(true);
    const restored = await fetchSideHistory(parentId, sideId);
    if (sideThreadIdRef.current !== sideId) return;
    setSideMessages(restored ?? []);
    setIsLoadingSideHistory(false);
  }, [clearSideThread, fetchSideHistory, setActiveSideThread, sideMessages]);

  /**
   * The list's own delete button: drop the thread from the parent session's list. The
   * transcript stays on S3, and `lastSideSeq` keeps its number out of circulation.
   *
   * Deleting the thread on screen falls back to the newest one left, so the panel never
   * ends up showing a transcript the list says is gone.
   */
  const deleteSideThread = useCallback((sideId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();

    const parentId = threadIdRef.current;
    dispatch(chatSlice.actions.removeChatSideSession({
      sessionId: parentId,
      sideSessionId: sideId,
    }));
    if (sideThreadIdRef.current !== sideId) return;
    // The still-current list, minus the entry this click removes from it.
    const next = (sessions.idToSession[parentId]?.sideSessions ?? [])
      .find((entry) => entry.sideSessionId !== sideId);
    if (next) void selectSideThread(next.sideSessionId);
    else clearSideThread();
  }, [dispatch, sessions.idToSession, selectSideThread, clearSideThread]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (isLoading || isLoadingHistory) return;

    setShowHistory(false);
    setIsLoadingHistory(true);
    setError(null);
    resetLocalChatState();
    resetSidePanel();

    threadIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    sessionSavedRef.current = !!sessions.idToSession[sessionId];

    // Resume the side thread this session already opened — the newest one, which is where
    // the list keeps it — so `/btw` continues it instead of starting blind, and pull its
    // transcript back from S3 so the panel is not empty.
    const storedSides = sessions.idToSession[sessionId]?.sideSessions ?? [];
    const storedSideId = storedSides[0]?.sideSessionId ?? null;
    setActiveSideThread(storedSideId);
    sideSeqRef.current = storedSides.reduce(
      (max, entry) => Math.max(max, sideSeqOf(entry.sideSessionId)),
      // Deleted threads are gone from the list, so their numbers have to come from here.
      sessions.idToSession[sessionId]?.lastSideSeq ?? 0
    );

    // Deliberately not awaited: it is display state for a panel the user has not opened yet,
    // and holding `isLoadingHistory` open for it would delay the main transcript. Its own
    // guards handle arriving late.
    if (storedSideId) void restoreSideHistory(sessionId, storedSideId);

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
  }, [isLoading, isLoadingHistory, resetLocalChatState, resetSidePanel, setActiveSideThread, sessions.idToSession, fetchSessionMessages, restoreSideHistory]);

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
      resetSidePanel();
    }
  }, [dispatch, activeSessionId, resetLocalChatState, resetSidePanel]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || isLoadingHistory || isLoadingBotCredentials) return;

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
      const { token, userId } = await resolveAgentAuth(botCredentials);

      const finalContent = await runAgentTurn({
        threadId: sessionId,
        runId,
        content: trimmed,
        messageId: msgId,
        agentState,
        forwardedProps: { userId },
        token,
        emit: (event) => {
          // The "Searching for: …" status doubles as the session name.
          if (event.kind === 'status' && event.rephrased) {
            dispatch(chatSlice.actions.updateChatSessionName({ sessionId, name: event.rephrased }));
          }
          applyStreamEvent(event, { setMessages, setLiveLine, setStatusLines, setAgentState });
        },
      });

      // A turn that streamed no text still needs something on screen.
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          updated[updated.length - 1] = { ...last, content: finalContent || '(No response)' };
        }
        return updated;
      });
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
        console.log('[handleSend] retrying after stream failure');
        try {
          await doSend();
          return;
        } catch {
          // fall through to error display
        }
      }
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
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
  }, [input, isLoading, isLoadingHistory, isLoadingBotCredentials, botCredentials, agentState, ensureSessionSaved, dispatch]);

  /**
   * Ask a `/btw` side question on its own thread. Its context comes from the parent
   * session on the agent side; nothing here touches the main transcript, the session
   * list, or the main session's cache.
   */
  const sendSideQuestion = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || sideIsLoading || isLoadingBotCredentials) return;

    sideRetryCountRef.current = 0;
    setSideError(null);

    // A question typed while the list is open is about to change that list; close it so
    // the panel behind shows the thread being asked on.
    setShowSideHistory(false);

    const parentId = threadIdRef.current;
    // Held in a local, not read back off the ref: the seq bump and the dispatch below are
    // calls, and a call in between is enough for TypeScript to drop the narrowing.
    let threadId = sideThreadIdRef.current;
    const isNewThread = !threadId;
    if (!threadId) {
      sideSeqRef.current += 1;
      threadId = sideThreadId(parentId, sideSeqRef.current);
      setActiveSideThread(threadId);
    }

    // Record the thread on the parent session — new, or touched because a follow-up is
    // being asked on it. That is what keeps the side list in step with the panel. Ignored
    // for a session that has not registered yet (a `/btw` before any main send).
    dispatch(chatSlice.actions.saveChatSideSession({
      sessionId: parentId,
      sideSessionId: threadId,
      sideSeq: sideSeqRef.current,
      // Only a new thread is named by the question that opened it; a follow-up must not
      // rename the thread it continues.
      ...(isNewThread ? { name: trimmed } : {}),
    }));

    const msgId = generateId();
    const runId = generateId();

    // The parent's persisted transcript cannot contain an answer that is still
    // streaming, so carry it in the prompt when there is one — otherwise a question
    // *about* the arriving answer would have nothing to refer to.
    const lastMessage = messages[messages.length - 1];
    const inFlight = isLoading && lastMessage?.role === 'assistant'
      ? lastMessage.content.trim()
      : '';
    const sentContent = inFlight
      ? `${SIDE_PROMPT_PREFIX}\n${inFlight.slice(-SIDE_CONTEXT_CAP)}\n]\n\n${SIDE_PROMPT_QUESTION}${trimmed}`
      : trimmed;

    setSideMessages((prev) => [
      ...prev,
      { id: msgId, role: 'user', content: trimmed, timestamp: new Date() },
      { id: generateId(), role: 'assistant', content: '', timestamp: new Date() },
    ]);
    setSideLiveLine(null);
    setSideStatusLines([]);
    setSideIsLoading(true);

    const controller = new AbortController();
    sideAbortRef.current = controller;

    const doSend = async () => {
      const { token, userId } = await resolveAgentAuth(botCredentials);
      const finalContent = await runAgentTurn({
        threadId,
        runId,
        content: sentContent,
        messageId: msgId,
        agentState: sideAgentState,
        forwardedProps: { userId, sideQuestionOf: parentId },
        token,
        emit: (event) => applyStreamEvent(event, {
          setMessages: setSideMessages,
          setLiveLine: setSideLiveLine,
          setStatusLines: setSideStatusLines,
          setAgentState: setSideAgentState,
        }),
        signal: controller.signal,
      });

      setSideMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          updated[updated.length - 1] = { ...last, content: finalContent || '(No response)' };
        }
        return updated;
      });
    };

    try {
      await doSend();
    } catch (err) {
      // Cleared or closed mid-stream — the state is already gone, don't resurrect it.
      if (controller.signal.aborted) return;
      // Same single retry as the main chat: a container kill mid-stream is recoverable.
      if (sideRetryCountRef.current < 1) {
        sideRetryCountRef.current += 1;
        setSideError(null);
        setSideLiveLine(null);
        setSideStatusLines([]);
        try {
          await doSend();
          return;
        } catch {
          // fall through to error display
        }
      }
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setSideError(errorMessage);
      setSideMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: sanitizeAssistantText(`⚠️ Error: ${errorMessage}`),
          };
        }
        return updated;
      });
    } finally {
      if (sideAbortRef.current === controller) sideAbortRef.current = null;
      setSideIsLoading(false);
      setSideLiveLine(null);
      // The thread just gained turns on S3. Without this the year-long cache would hand the
      // same pre-ask transcript back to the next restore (a session switch clears local
      // messages but not the cache).
      dispatch(ragApi.util.invalidateTags([{ type: 'SessionMessages', id: threadId }]));
    }
  }, [sideIsLoading, isLoadingBotCredentials, botCredentials, messages, isLoading, sideAgentState, setActiveSideThread, dispatch]);

  const closeSidePanel = useCallback(() => {
    setSidePanelOpen(false);
    setShowSideHistory(false);
  }, []);

  const handleSideKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const question = sideInput.trim();
        if (!question) return;
        setSideInput('');
        void sendSideQuestion(question);
      }
    },
    [sideInput, sendSideQuestion]
  );

  const handleClear = useCallback(() => {
    const newId = crypto.randomUUID();
    threadIdRef.current = newId;
    setActiveSessionId(newId);
    sessionSavedRef.current = false;
    setMessages([createWelcomeMessage()]);
    resetLocalChatState();
    resetSidePanel();
    setShowHistory(false);
  }, [resetLocalChatState, resetSidePanel]);

  /** `/btw <question>` opens the side panel; everything else is an ordinary send. */
  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoadingHistory || isLoadingBotCredentials) return;

    const match = trimmed.match(BTW_PATTERN);
    if (match) {
      // Deliberately checked before the isLoading guard: asking a side question while
      // the main answer streams is the whole point of the feature.
      const question = trimmed.slice(match[0].length).trim();
      setInput('');
      setSidePanelOpen(true);
      if (question) void sendSideQuestion(question);
      return;
    }

    if (isLoading) return;
    void handleSend();
  }, [input, isLoading, isLoadingHistory, isLoadingBotCredentials, sendSideQuestion, handleSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  useEffect(() => {
    if (sidePanelOpen) sideInputRef.current?.focus();
  }, [sidePanelOpen]);

  useEffect(() => {
    sideMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sideMessages, sideLiveLine, sideStatusLines, sidePanelOpen]);

  // ── Build turn pairs from the flat messages array ──────────────────
  // welcome message is standalone; subsequent messages are user/assistant pairs.
  const welcomeMsg = messages[0]?.role === 'assistant' ? messages[0] : null;
  const conversationMsgs = welcomeMsg ? messages.slice(1) : messages;
  const turns = toTurns(conversationMsgs);
  const sideTurns = toTurns(sideMessages);

  const historyEntries = sessions.sessionIds
    .map((id) => ({ id, ...sessions.idToSession[id] }))
    .filter((entry) => entry.name);

  // The open session's side threads, newest first. Read off `activeSessionId` rather than
  // the ref so a change made while this session is on screen re-renders the list. Threads
  // minted before the session registered are not in here — see `saveChatSideSession`.
  const sideSessionEntries = sessions.idToSession[activeSessionId]?.sideSessions ?? [];

  return (
    <div className={`chat-container${sidePanelOpen ? ' chat-container--split' : ''}`}>
      <header
        className={`chatbot-header${onHeaderPointerDown ? ' is-draggable' : ''}`}
        onPointerDown={(e) => {
          if (handleHeaderPointerDown(e)) return;
          onHeaderPointerDown?.(e);
        }}
      >
        <div
          className="chatbot-header-brand"
          title={onHeaderPointerDown ? 'Drag to move · Double-click to maximize' : 'Double-click to maximize'}
        >
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
          {/* Same as typing /btw in the composer; a toggle so it also closes the panel. */}
          <Tooltip title="Ask a side question — /btw" arrow placement="bottom">
            <span>
              <button
                type="button"
                className={`header-text-button${sidePanelOpen ? ' active' : ''}`}
                onClick={() => setSidePanelOpen((v) => !v)}
                aria-label="Ask a side question"
                aria-pressed={sidePanelOpen}
              >
                <code>/btw</code>
              </button>
            </span>
          </Tooltip>

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
                                {formatHistoryTimestamp(entry.updatedAt)}
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
                onClick={toggleMaximized}
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

      <div className="chat-container__body" ref={chatBodyRef}>
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

        {sidePanelOpen && (
          // A second transcript, overlaid on the right of the one above rather than laid out
          // beside it: the main chat keeps its full width, so opening or closing the panel
          // never re-wraps the conversation or moves its scroll anchor. Sharing the
          // .chatbot-messages class name means bubbles, dark mode and the markdown
          // typography cascade apply unchanged.
          <aside
            className="side-panel"
            ref={sidePanelRef}
            aria-label="Side question panel"
          >
            <div
              className="side-panel__handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side question panel"
              title="Drag to resize"
              onPointerDown={handleSidePanelResizeStart}
            />
          <div className="chatbot-messages side-panel__messages">
            <div className="side-panel__toolbar">
              <span className="side-panel__toolbar-label">Side question</span>
              <div className="side-panel__toolbar-actions">
                {/* Same chrome as the header's session history: a count badge on the
                    toggle, then a list whose rows switch or delete a thread. */}
                <div ref={sideHistoryButtonRef} className="side-panel__history-anchor">
                  <Tooltip title="Previous side questions" arrow placement="bottom">
                    <span>
                      <button
                        type="button"
                        className={`side-panel__icon-button${showSideHistory ? ' active' : ''}`}
                        onClick={() => setShowSideHistory((v) => !v)}
                        aria-label="Previous side questions"
                        aria-expanded={showSideHistory}
                        disabled={sideIsLoading}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {sideSessionEntries.length > 0 && (
                          <span className="side-panel__badge">
                            {sideSessionEntries.length > 9 ? '9+' : sideSessionEntries.length}
                          </span>
                        )}
                      </button>
                    </span>
                  </Tooltip>
                </div>
                <Tooltip title="New side question" arrow placement="bottom">
                  <span>
                    <button
                      type="button"
                      className="side-panel__icon-button"
                      onClick={() => {
                        setShowSideHistory(false);
                        clearSideThread();
                      }}
                      aria-label="New side question"
                      disabled={sideIsLoading}
                    >
                      <AddCircleOutlineIcon style={{ fontSize: 18 }} />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip title="Close side question" arrow placement="bottom">
                  <span>
                    <button
                      type="button"
                      className="side-panel__icon-button"
                      onClick={closeSidePanel}
                      aria-label="Close side question panel"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                </Tooltip>
              </div>
            </div>

            {sideMessages.length === 0 && !sideIsLoading && !isLoadingSideHistory && (
              <p className="side-panel__hint">
                Ask a quick side question below without interrupting the conversation.
              </p>
            )}

            {sideTurns.map((turn, i) => {
              const isLast = i === sideTurns.length - 1;
              return (
                <ChatTurn
                  key={turn.userMsg.id}
                  userContent={turn.userMsg.content}
                  assistantContent={turn.botMsg.content}
                  liveLine={isLast && sideIsLoading ? sideLiveLine : null}
                  isStreaming={isLast && sideIsLoading}
                  timestamp={turn.botMsg.timestamp}
                  statusLines={isLast ? sideStatusLines : []}
                />
              );
            })}

            {sideError && (
              <div className="message bot-message">
                <div className="message-bubble" style={{ color: '#ef4444' }}>{sideError}</div>
              </div>
            )}

            <div ref={sideMessagesEndRef} />
          </div>

            {/*
              Every side question this session has asked, newest first — the panel's copy of
              the header's session list, down to the classes, so a row reads the same way.

              Hung off the panel rather than the toolbar that toggles it: the toolbar sits in
              the transcript scroller, which would clip an overlay of this size. The panel is
              the nearest positioned ancestor, so `.side-panel__history` anchors to its top
              right and needs no portal.
            */}
            {showSideHistory && (
              <div className="chat-history-panel side-panel__history" ref={sideHistoryPanelRef}>
                <div className="chat-history-header">Side questions</div>
                {sideSessionEntries.length === 0 ? (
                  <div className="chat-history-empty">No previous side questions yet.</div>
                ) : (
                  <ul className="chat-history-list">
                    {sideSessionEntries.map((entry) => {
                      const isActive = entry.sideSessionId === activeSideSessionId;
                      return (
                        <li key={entry.sideSessionId} className="chat-history-row">
                          <button
                            type="button"
                            className={`chat-history-item${isActive ? ' active' : ''}`}
                            onClick={() => void selectSideThread(entry.sideSessionId)}
                            title={entry.name}
                          >
                            <span className="chat-history-name">{entry.name}</span>
                            {entry.updatedAt && (
                              <span className="chat-history-meta">
                                {formatHistoryTimestamp(entry.updatedAt)}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            className="chat-history-delete"
                            title="Delete side question"
                            aria-label={`Delete side question ${entry.name}`}
                            onClick={(e) => deleteSideThread(entry.sideSessionId, e)}
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

            {/*
              The panel composer sits inside the overlay, above the main one — the main
              composer keeps the window's full width so it never shifts either.
            */}
            <div className="chatbot-input side-panel__input">
              <textarea
                ref={sideInputRef}
                rows={1}
                value={sideInput}
                onChange={(e) => setSideInput(e.target.value)}
                onKeyDown={handleSideKeyDown}
                placeholder={isLoadingBotCredentials ? "Connecting to agent..." : "Ask a side question"}
                title="Enter to send, Shift+Enter for a new line"
                aria-label="Side question input"
                disabled={isLoadingBotCredentials}
              />
              <button
                type="button"
                className="send-button mb-1"
                onClick={() => {
                  const question = sideInput.trim();
                  if (!question) return;
                  setSideInput('');
                  void sendSideQuestion(question);
                }}
                aria-label="Send side question"
                disabled={sideIsLoading || isLoadingBotCredentials || !sideInput.trim()}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </aside>
        )}

        {/*
          The main composer sits inside the body rather than below it, so the panel's
          overlay can run the full height of the window. It buys that height back on the
          horizontal axis instead: .chat-container--split reserves the panel's width on
          this element, packing the two composers side by side.
        */}
        <div className="chatbot-input">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isLoadingBotCredentials
                ? "Connecting to agent..."
                : isLoadingHistory
                  ? "Loading history..."
                  : isLoading
                    ? "Thinking..."
                    : "Type your message..."
            }
            title="Enter to send, Shift+Enter for a new line"
            aria-label="Chat message input"
            disabled={isLoadingHistory || isLoadingBotCredentials}
          />
          <button
            type="button"
            className="send-button mb-1!"
            onClick={handleSubmit}
            aria-label="Send message"
            disabled={isLoading || isLoadingHistory || isLoadingBotCredentials || !input.trim()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(ChatInterface);

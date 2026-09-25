import { baseApi } from "./baseApi";

const SESSION_API_BASE = import.meta.env.VITE_SESSION_API_BASE as string | undefined;
export const AGENT_ENDPOINT = (import.meta.env.VITE_AGENT_ENDPOINT as string | undefined) || "";

export type HistoryContentBlock =
    | { text: string }
    | { toolUse: { toolUseId?: string; name?: string; input?: unknown } }
    | { toolResult: { toolUseId?: string; status?: string; content?: Array<{ text?: string }> } };

export interface HistoryApiMessage {
    message: {
        role: string;
        content?: HistoryContentBlock[];
    };
    message_id?: number;
    created_at?: string;
    updated_at?: string;
    redact_message?: unknown;
}

export interface SessionMessagesResult {
    /** The thread these messages belong to: a session id, or `<parent>:btw:<n>` for a side thread. */
    sessionId: string;
    /** Present only for a side thread: the session the side question was asked about. */
    parentSessionId?: string;
    messageCount: number;
    messages: HistoryApiMessage[];
}

export type RagTag = { type: "SessionMessages"; id: string };

const KEEP_SESSION_MESSAGES_FOR = 60 * 60 * 24 * 365;

/**
 * A `/btw` side thread's id — `<parent>:btw:<n>`. This is the single definition of that
 * format on the frontend: the component mints with it, the endpoint below tags with it,
 * and it must match `sideThreadId` in the retrieval Lambda's `routes/sessionMessages.ts`
 * (which builds the same string from `/sessions/:parentId/side/:seq/messages`). See
 * add-btw.md.
 */
export function sideThreadId(parentSessionId: string, sideSeq: number): string {
    return `${parentSessionId}:btw:${sideSeq}`;
}

/** The `:btw:<n>` tail of an id minted above — see `sideThreadId`. */
const SIDE_THREAD_SEQ_PATTERN = /:btw:(\d+)$/;

/**
 * Recover the sequence number from a side thread id, or 0 when it carries none.
 *
 * Restoring an id without its number would let the next mint hand out a number this
 * session already used, quietly reviving a side thread the user threw away.
 */
export function sideSeqOf(sideThreadId: string | undefined | null): number {
    const match = sideThreadId ? SIDE_THREAD_SEQ_PATTERN.exec(sideThreadId) : null;
    return match ? Number(match[1]) : 0;
}

const emptySessionMessages = (sessionId: string): SessionMessagesResult => ({
    sessionId,
    messageCount: 0,
    messages: [],
});

/**
 * Shared body of both message endpoints. `sessionId` is the thread the messages belong to
 * — used for the empty fallback and the unset-base case, which is a silent empty result
 * rather than an error (no retrieval API configured is a normal local state).
 */
async function fetchSessionMessagesAt(url: string, sessionId: string) {
    if (!SESSION_API_BASE) {
        return { data: emptySessionMessages(sessionId) };
    }
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return { error: { status: response.status, data: await response.text() } };
        }
        const json = await response.json();
        const result =
            json?.result ??
            (json?.messages ? json : emptySessionMessages(sessionId));
        return { data: result as SessionMessagesResult };
    } catch (error) {
        return {
            error: {
                status: 0,
                data: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

export const ragApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getSessionMessages: builder.query<SessionMessagesResult, string>({
            keepUnusedDataFor: KEEP_SESSION_MESSAGES_FOR,
            queryFn: (sessionId) =>
                fetchSessionMessagesAt(`${SESSION_API_BASE}/sessions/${sessionId}/messages`, sessionId),
            providesTags: (_result, _error, sessionId) => [{ type: "SessionMessages", id: sessionId }],
        }),
        /**
         * One `/btw` side thread's own turns. The panel renders these next to the main
         * transcript, so the parent's messages are deliberately not merged in — the
         * Lambda serves only the side prefix (see add-btw.md). Tagged by the side thread
         * id, which shares the tag *type* with the endpoint above but never its id, so
         * invalidating one never drops the other's cache.
         */
        getSideSessionMessages: builder.query<
            SessionMessagesResult,
            { parentSessionId: string; sideSeq: number }
        >({
            keepUnusedDataFor: KEEP_SESSION_MESSAGES_FOR,
            queryFn: ({ parentSessionId, sideSeq }) =>
                fetchSessionMessagesAt(
                    `${SESSION_API_BASE}/sessions/${parentSessionId}/side/${sideSeq}/messages`,
                    sideThreadId(parentSessionId, sideSeq)
                ),
            providesTags: (_result, _error, { parentSessionId, sideSeq }) => [
                { type: "SessionMessages", id: sideThreadId(parentSessionId, sideSeq) },
            ],
        }),
    }),
});

export type AgentStreamRequestBody = {
    threadId: string;
    runId: string;
    messages: Array<{ id: string; role: "user"; content: string }>;
    state: Record<string, unknown>;
    tools: unknown[];
    context: unknown[];
    /**
     * Passed through to the agent untouched. `sideQuestionOf` marks a `/btw` side
     * question and carries the thread it is a question *about*; the agent's
     * session_manager_provider reads the parent transcript instead of starting empty.
     */
    forwardedProps: { userId: string; sideQuestionOf?: string };
};

export async function fetchAgentStream(
    body: AgentStreamRequestBody,
    token: string,
    init?: RequestInit
): Promise<Response> {
    if (!AGENT_ENDPOINT) {
        throw new Error(
            "VITE_AGENT_ENDPOINT is not set. Deploy {{AGENT_NAME}} and put the invoke URL in the frontend .env"
        );
    }
    return fetch(AGENT_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
            ...(init?.headers || {}),
        },
        body: JSON.stringify(body),
        signal: init?.signal,
    });
}

export default ragApi;

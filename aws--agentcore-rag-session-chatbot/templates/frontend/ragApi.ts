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
    sessionId: string;
    messageCount: number;
    messages: HistoryApiMessage[];
}

export type RagTag = { type: "SessionMessages"; id: string };

const KEEP_SESSION_MESSAGES_FOR = 60 * 60 * 24 * 365;

export const ragApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getSessionMessages: builder.query<SessionMessagesResult, string>({
            keepUnusedDataFor: KEEP_SESSION_MESSAGES_FOR,
            queryFn: async (sessionId) => {
                if (!SESSION_API_BASE) {
                    return { data: { sessionId, messageCount: 0, messages: [] } };
                }
                try {
                    const response = await fetch(`${SESSION_API_BASE}/sessions/${sessionId}/messages`);
                    if (!response.ok) {
                        return { error: { status: response.status, data: await response.text() } };
                    }
                    const json = await response.json();
                    const result =
                        json?.result ??
                        (json?.messages ? json : { sessionId, messageCount: 0, messages: [] });
                    return { data: result };
                } catch (error) {
                    return {
                        error: {
                            status: 0,
                            data: error instanceof Error ? error.message : String(error),
                        },
                    };
                }
            },
            providesTags: (_result, _error, sessionId) => [{ type: "SessionMessages", id: sessionId }],
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
    forwardedProps: { userId: string };
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

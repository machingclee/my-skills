import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { sideSeqOf } from "@/redux/api/ragApi";

const CHAT_STORAGE_KEY = "chat-storage";

/** A `/btw` side thread, as the panel's own list shows it. */
export type ChatSideSession = {
    /** `<parentSessionId>:btw:<n>` — see `sideThreadId`. */
    sideSessionId: string;
    /** The question that opened the thread; the row's label. */
    name: string;
    updatedAt?: string;
};

export type ChatSession = {
    name: string;
    updatedAt?: string;
    /**
     * Every `/btw` side thread this session has opened, newest first, so the panel can
     * open on the latest one and still come back to the rest. All of them are kept, not
     * just the one in use: clearing the panel starts a new thread without dropping the
     * old one, and only the list's own delete button removes an entry.
     *
     * Never set for a session that has not been registered yet — see
     * `saveChatSideSession`.
     */
    sideSessions?: ChatSideSession[];
    /**
     * Highest `:btw:<n>` ever minted for this session. Outlives the deletion of the
     * thread it belongs to, deliberately: that thread's turns are still on S3, so
     * handing its number to a new thread would read them back as the new thread's own
     * history. Never decreases.
     */
    lastSideSeq?: number;
};

export type ChatSessionsState = {
    sessionIds: string[];
    idToSession: { [sessionId: string]: ChatSession };
};

type ChatState = {
    isChatbotOpen: boolean;
    chatbotWidth?: number;
    chatbotHeight?: number;
    chatbotLeft?: number;
    chatbotTop?: number;
    chatbotMaximized: boolean;
    sidePanelWidth?: number;
    sessions: ChatSessionsState;
};

const emptySessions = (): ChatSessionsState => ({
    sessionIds: [],
    idToSession: {},
});

function loadChatFromStorage(): Partial<ChatState> {
    try {
        const raw = localStorage.getItem(CHAT_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed?.state ?? parsed ?? {};
    } catch {
        return {};
    }
}

const stored = loadChatFromStorage();

/** A session as an older build wrote it, when a session held at most one side thread. */
type StoredChatSession = ChatSession & { sideSessionId?: string };

/** Label for a thread restored from `StoredChatSession.sideSessionId` — its question is unknown. */
const LEGACY_SIDE_SESSION_NAME = "Side question";

/**
 * Rebuild the session map out of whatever was persisted. Sessions written before side
 * threads became a list carry a single `sideSessionId`; fold it into `sideSessions` so the
 * thread it points at survives the upgrade instead of being stranded on S3. The id is also
 * what sets the floor for the next mint, hence `lastSideSeq` being derived here too.
 */
function normalizeSessions(stored?: Partial<ChatSessionsState>): ChatSessionsState {
    const sessionIds = stored?.sessionIds ?? [];
    const rawSessions = stored?.idToSession ?? {};
    const idToSession: { [sessionId: string]: ChatSession } = {};

    for (const sessionId of sessionIds) {
        const raw = rawSessions[sessionId] as StoredChatSession | undefined;
        if (!raw) continue;
        const { sideSessionId, ...session } = raw;
        const sideSessions = [...(session.sideSessions ?? [])];
        if (sideSessionId && !sideSessions.some((entry) => entry.sideSessionId === sideSessionId)) {
            sideSessions.push({ sideSessionId, name: LEGACY_SIDE_SESSION_NAME });
        }
        idToSession[sessionId] = {
            ...session,
            ...(sideSessions.length ? { sideSessions } : {}),
            lastSideSeq: sideSessions.reduce(
                (max, entry) => Math.max(max, sideSeqOf(entry.sideSessionId)),
                session.lastSideSeq ?? 0
            ),
        };
    }

    return { sessionIds, idToSession };
}

const initialState: ChatState = {
    isChatbotOpen: false,
    chatbotWidth: stored.chatbotWidth,
    chatbotHeight: stored.chatbotHeight,
    chatbotLeft: stored.chatbotLeft,
    chatbotTop: stored.chatbotTop,
    chatbotMaximized: !!stored.chatbotMaximized,
    sidePanelWidth: stored.sidePanelWidth,
    sessions: stored.sessions?.sessionIds ? normalizeSessions(stored.sessions) : emptySessions(),
};

const chatSlice = createSlice({
    name: "chat",
    initialState,
    reducers: {
        setIsChatbotOpen(state, action: PayloadAction<boolean>) {
            state.isChatbotOpen = action.payload;
        },
        setChatbotWidth(state, action: PayloadAction<number>) {
            state.chatbotWidth = action.payload;
        },
        setChatbotHeight(state, action: PayloadAction<number>) {
            state.chatbotHeight = action.payload;
        },
        setChatbotFrame(
            state,
            action: PayloadAction<{ width: number; height: number; left: number; top: number }>
        ) {
            state.chatbotWidth = action.payload.width;
            state.chatbotHeight = action.payload.height;
            state.chatbotLeft = action.payload.left;
            state.chatbotTop = action.payload.top;
        },
        setChatbotMaximized(state, action: PayloadAction<boolean>) {
            state.chatbotMaximized = action.payload;
        },
        setSidePanelWidth(state, action: PayloadAction<number>) {
            state.sidePanelWidth = action.payload;
        },
        saveChatSession(state, action: PayloadAction<{ sessionId: string; name?: string }>) {
            const { sessionId, name } = action.payload;
            const existing = state.sessions.idToSession[sessionId];
            if (!existing) {
                state.sessions.sessionIds.unshift(sessionId);
                state.sessions.idToSession[sessionId] = {
                    name: name ?? "Untitled",
                    updatedAt: new Date().toISOString(),
                };
            } else {
                state.sessions.idToSession[sessionId] = {
                    ...existing,
                    ...(name ? { name } : {}),
                    updatedAt: new Date().toISOString(),
                };
                state.sessions.sessionIds = [
                    sessionId,
                    ...state.sessions.sessionIds.filter((id) => id !== sessionId),
                ];
            }
        },
        updateChatSessionName(
            state,
            action: PayloadAction<{ sessionId: string; name: string; force?: boolean }>
        ) {
            const { sessionId, name, force } = action.payload;
            const existing = state.sessions.idToSession[sessionId];
            if (!existing) return;
            const isPlaceholder =
                !existing.name || existing.name === "Untitled" || existing.name === sessionId;
            if (!force && !isPlaceholder) return;
            state.sessions.idToSession[sessionId] = {
                ...existing,
                name,
                updatedAt: new Date().toISOString(),
            };
        },
        /**
         * Record a side thread on its parent session, or touch one already recorded when a
         * follow-up is asked there. Either way the thread moves to the front, since the
         * list is read newest-first — that is what makes the panel open on the thread in
         * use. `name` is only passed when the thread is new: a follow-up must not rename it.
         *
         * Sessions that are not in the list yet are left alone: a `/btw` sent before any
         * main message must not put an entry in the history list, so there is nothing to
         * attach the thread to until that session registers.
         *
         * `updatedAt` on the *session* is deliberately untouched — the history list renders
         * it as when the main conversation was last active, which a side question is not.
         */
        saveChatSideSession(
            state,
            action: PayloadAction<{
                sessionId: string;
                sideSessionId: string;
                sideSeq: number;
                name?: string;
            }>
        ) {
            const { sessionId, sideSessionId, sideSeq, name } = action.payload;
            const session = state.sessions.idToSession[sessionId];
            if (!session) return;
            const known = session.sideSessions ?? [];
            const existing = known.find((entry) => entry.sideSessionId === sideSessionId);
            session.sideSessions = [
                {
                    sideSessionId,
                    name: name ?? existing?.name ?? "Side question",
                    updatedAt: new Date().toISOString(),
                },
                ...known.filter((entry) => entry.sideSessionId !== sideSessionId),
            ];
            session.lastSideSeq = Math.max(session.lastSideSeq ?? 0, sideSeq);
        },
        /**
         * Drop one side thread from the list. `lastSideSeq` is deliberately left where it
         * is — see `ChatSession.lastSideSeq` — and so is the thread's own transcript on S3,
         * which this frontend never deletes.
         */
        removeChatSideSession(
            state,
            action: PayloadAction<{ sessionId: string; sideSessionId: string }>
        ) {
            const { sessionId, sideSessionId } = action.payload;
            const session = state.sessions.idToSession[sessionId];
            if (!session?.sideSessions) return;
            const remaining = session.sideSessions.filter(
                (entry) => entry.sideSessionId !== sideSessionId
            );
            if (remaining.length) {
                session.sideSessions = remaining;
            } else {
                delete session.sideSessions;
            }
        },
        removeChatSession(state, action: PayloadAction<{ sessionId: string }>) {
            const { sessionId } = action.payload;
            state.sessions.sessionIds = state.sessions.sessionIds.filter((id) => id !== sessionId);
            delete state.sessions.idToSession[sessionId];
        },
    },
});

export function persistChatState(state: ChatState) {
    localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify({
            state: {
                chatbotWidth: state.chatbotWidth,
                chatbotHeight: state.chatbotHeight,
                chatbotLeft: state.chatbotLeft,
                chatbotTop: state.chatbotTop,
                chatbotMaximized: state.chatbotMaximized,
                sidePanelWidth: state.sidePanelWidth,
                sessions: state.sessions,
            },
        })
    );
}

export default chatSlice;

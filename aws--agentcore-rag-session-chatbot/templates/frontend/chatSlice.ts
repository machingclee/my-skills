import { createSlice, PayloadAction } from "@reduxjs/toolkit";

const CHAT_STORAGE_KEY = "chat-storage";

export type ChatSession = {
    name: string;
    updatedAt?: string;
    /**
     * The `/btw` side thread this session last opened (`<sessionId>:btw:<n>`), if any.
     * Persisted so a session restored from history continues the side thread it already
     * has instead of minting a fresh one. Never set for a session that has not been
     * registered yet — see `setChatSessionSideSessionId`.
     */
    sideSessionId?: string;
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

const initialState: ChatState = {
    isChatbotOpen: false,
    chatbotWidth: stored.chatbotWidth,
    chatbotHeight: stored.chatbotHeight,
    chatbotLeft: stored.chatbotLeft,
    chatbotTop: stored.chatbotTop,
    chatbotMaximized: !!stored.chatbotMaximized,
    sidePanelWidth: stored.sidePanelWidth,
    sessions: stored.sessions?.sessionIds ? stored.sessions : emptySessions(),
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
         * Record the side thread bound to a session, or forget it (`null`) when the user
         * trashes it. Sessions that are not in the list yet are left alone: a `/btw` sent
         * before any main message must not put an entry in the history list, so there is
         * nothing to attach the id to until that session registers.
         *
         * `updatedAt` is deliberately untouched — the history list renders it as when the
         * main conversation was last active, which a side question is not.
         */
        setChatSessionSideSessionId(
            state,
            action: PayloadAction<{ sessionId: string; sideSessionId: string | null }>
        ) {
            const { sessionId, sideSessionId } = action.payload;
            const existing = state.sessions.idToSession[sessionId];
            if (!existing) return;
            if (sideSessionId) {
                existing.sideSessionId = sideSessionId;
            } else {
                delete existing.sideSessionId;
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

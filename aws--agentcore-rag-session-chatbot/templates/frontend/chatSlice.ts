import { createSlice, PayloadAction } from "@reduxjs/toolkit";

const CHAT_STORAGE_KEY = "chat-storage";

export type ChatSession = {
    name: string;
    updatedAt?: string;
};

export type ChatSessionsState = {
    sessionIds: string[];
    idToSession: { [sessionId: string]: ChatSession };
};

type ChatState = {
    isChatbotOpen: boolean;
    chatbotWidth?: number;
    chatbotHeight?: number;
    chatbotMaximized: boolean;
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
    chatbotMaximized: !!stored.chatbotMaximized,
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
        setChatbotMaximized(state, action: PayloadAction<boolean>) {
            state.chatbotMaximized = action.payload;
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
                chatbotMaximized: state.chatbotMaximized,
                sessions: state.sessions,
            },
        })
    );
}

export default chatSlice;

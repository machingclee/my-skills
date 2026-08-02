import { configureStore } from "@reduxjs/toolkit";
import appSlice, { setTokens, clearTokens } from "./slices/appSlice";
import { baseApi } from "./api/baseApi";

export const store = configureStore({
    reducer: {
        app: appSlice.reducer,
        [baseApi.reducerPath]: baseApi.reducer,
    },
    // baseApi middleware enables caching, invalidation, polling, etc.
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(baseApi.middleware),
});

// ── localStorage write-through ───────────────────────────────
// Keep localStorage in sync with Redux token state so the
// baseApi prepareHeaders always reads the latest tokens.

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

let prevAccessToken: string | null = store.getState().app.accessToken;
let prevRefreshToken: string | null = store.getState().app.refreshToken;

store.subscribe(() => {
    const { accessToken, refreshToken } = store.getState().app;

    // Capture old values BEFORE updating so the event-dispatch
    // check below works correctly.
    const accessChanged = accessToken !== prevAccessToken;
    const refreshChanged = refreshToken !== prevRefreshToken;

    if (accessChanged) {
        if (accessToken) {
            localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        } else {
            localStorage.removeItem(ACCESS_TOKEN_KEY);
        }
        prevAccessToken = accessToken;
    }

    if (refreshChanged) {
        if (refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        } else {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
        prevRefreshToken = refreshToken;
    }

    // Notify other tabs when tokens change from this tab.
    if (accessChanged || refreshChanged) {
        window.dispatchEvent(new Event("auth-tokens-changed"));
    }
});

// ── cross-tab sync ───────────────────────────────────────────
// When another tab writes tokens (storage event) or any tab
// refreshes tokens (auth-tokens-changed event), pull the latest
// values from localStorage into Redux.

function syncTokensFromStorage() {
    const nextAccess = localStorage.getItem(ACCESS_TOKEN_KEY);
    const nextRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
    const current = store.getState().app;

    if (
        nextAccess !== current.accessToken ||
        nextRefresh !== current.refreshToken
    ) {
        if (nextAccess && nextRefresh) {
            store.dispatch(
                setTokens({
                    accessToken: nextAccess,
                    refreshToken: nextRefresh,
                }),
            );
        } else if (!nextAccess && !nextRefresh) {
            store.dispatch(clearTokens());
        }
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("storage", syncTokensFromStorage);
    window.addEventListener("auth-tokens-changed", syncTokensFromStorage);
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

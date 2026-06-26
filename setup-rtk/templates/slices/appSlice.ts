import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

function readStorageItem(key: string): string | null {
    if (typeof window === "undefined") {
        return null;
    }
    return window.localStorage.getItem(key);
}

interface AppState {
    accessToken: string | null;
    refreshToken: string | null;
}

// Hydrate initial token state from localStorage so the store survives a
// full-page reload without waiting for the next login mutation.
const initialState: AppState = {
    accessToken: readStorageItem(ACCESS_TOKEN_KEY),
    refreshToken: readStorageItem(REFRESH_TOKEN_KEY),
};

export const appSlice = createSlice({
    name: "app",
    initialState,
    reducers: {
        setAccessToken: (state, action: PayloadAction<string | null>) => {
            state.accessToken = action.payload;
        },
        setRefreshToken: (state, action: PayloadAction<string | null>) => {
            state.refreshToken = action.payload;
        },
        setTokens: (
            state,
            action: PayloadAction<{ accessToken: string; refreshToken: string }>,
        ) => {
            state.accessToken = action.payload.accessToken;
            state.refreshToken = action.payload.refreshToken;
        },
        clearTokens: (state) => {
            state.accessToken = null;
            state.refreshToken = null;
        },
    },
});

export const { setAccessToken, setRefreshToken, setTokens, clearTokens } =
    appSlice.actions;

export default appSlice;

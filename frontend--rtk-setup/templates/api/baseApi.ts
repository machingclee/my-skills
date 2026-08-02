import {
    createApi,
    fetchBaseQuery,
    type BaseQueryFn,
    type FetchArgs,
    type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { clearTokens } from "../slices/appSlice";
import { store } from "../store";

/* ── token storage keys (adjust to match your backend) ──────── */
const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

/* ── base URL ───────────────────────────────────────────────── */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

/* ── auth error codes returned by the backend ─────────────────
   These are the `errorDescription` values that trigger special
   handling.  Change them to match what your backend sends. */
const JWT_EXPIRED_CODE = "JWT_EXPIRED";   // refresh the token & retry
const LOGIN_EXPIRED_CODE = "LOGIN_EXPIRED"; // clear tokens, force re-login

/* ── refresh endpoint ───────────────────────────────────────── */
const REFRESH_PATH = "/auth/access-token/refresh";

/* ── helpers ────────────────────────────────────────────────── */

function readStorageItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
}

function writeStorageItem(key: string, value: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
}

/**
 * Clear tokens from localStorage AND Redux.
 * Imports `store` directly — this is a live ES module binding so it is
 * always resolved by the time this function runs (it is only called at
 * runtime inside the baseQuery, never during module evaluation).
 */
function clearAuthTokens() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    store.dispatch(clearTokens());
    window.dispatchEvent(new Event("auth-tokens-changed"));
}

/* ── raw fetch base ───────────────────────────────────────────
   Attaches Authorization + Refresh-Token headers from localStorage
   on every request. */

const rawBaseQuery = fetchBaseQuery({
    baseUrl: BASE_URL,
    prepareHeaders: (headers) => {
        const accessToken = readStorageItem(ACCESS_TOKEN_KEY);
        const refreshToken = readStorageItem(REFRESH_TOKEN_KEY);

        if (accessToken) {
            headers.set("Authorization", `Bearer ${accessToken}`);
        }

        if (refreshToken) {
            headers.set("Refresh-Token", refreshToken);
        }

        return headers;
    },
});

/* ── token refresh (with mutex) ───────────────────────────────
   Only one refresh call can be in-flight at a time.  Other
   concurrent 401s wait on the same promise.

   LOGIN_EXPIRED is typically returned by the refresh endpoint
   itself (called via raw fetch here, not through rawBaseQuery).
   That's why attemptTokenRefresh clears auth on failure — the
   unwrapEnvelope below never sees that error code directly. */

let refreshPromise: Promise<boolean> | null = null;

async function attemptTokenRefresh(): Promise<boolean> {
    const refreshToken = readStorageItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
        clearAuthTokens();
        return false;
    }

    try {
        const response = await fetch(`${BASE_URL}${REFRESH_PATH}`, {
            method: "GET",
            headers: { "Refresh-Token": refreshToken },
        });

        if (!response.ok) {
            // e.g. 401 with LOGIN_EXPIRED
            clearAuthTokens();
            return false;
        }

        const body = (await response.json()) as {
            success: boolean;
            errorDescription?: string;
            result?: { accessToken?: string; refreshToken?: string };
        };

        if (
            body.success &&
            body.result?.accessToken &&
            body.result?.refreshToken
        ) {
            writeStorageItem(ACCESS_TOKEN_KEY, body.result.accessToken);
            writeStorageItem(REFRESH_TOKEN_KEY, body.result.refreshToken);
            window.dispatchEvent(new Event("auth-tokens-changed"));
            return true;
        }

        // success:false — refresh token expired
        if (!body.success) {
            clearAuthTokens();
        }

        return false;
    } catch {
        return false;
    }
}

async function refreshTokensOnce(): Promise<boolean> {
    if (!refreshPromise) {
        refreshPromise = attemptTokenRefresh().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

/* ── envelope unwrapping + auth retry ─────────────────────────
   Every backend response has the shape:
     { success: boolean, errorDescription?: string, errorCode?: string, result: T }

   On success the `result` field is returned directly.
   On auth failure the token is refreshed and the request retried once.
   If the refresh token itself is expired, tokens are cleared. */

interface WrappedResponse<T = unknown> {
    success: boolean;
    errorDescription?: string;
    errorCode?: string;
    result: T;
}

function readErrorDescription(
    rawResult: Awaited<ReturnType<typeof rawBaseQuery>>,
): string | null {
    // HTTP error with a body (e.g. 400)
    if (
        rawResult.error &&
        typeof rawResult.error.data === "object"
    ) {
        const data = rawResult.error.data as { errorDescription?: string };
        return data.errorDescription ?? null;
    }
    // HTTP 200 with success:false
    if (rawResult.data && typeof rawResult.data === "object") {
        const data = rawResult.data as { errorDescription?: string };
        return data.errorDescription ?? null;
    }
    return null;
}

function isRefreshRequest(args: string | FetchArgs): boolean {
    const url = typeof args === "string" ? args : args.url;
    return url.includes(REFRESH_PATH);
}

async function unwrapEnvelope(
    rawResult: Awaited<ReturnType<typeof rawBaseQuery>>,
    args: string | FetchArgs,
    api: Parameters<BaseQueryFn>[1],
    extraOptions: Record<string, never>,
): Promise<
    ReturnType<BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError>>
> {
    const errorDesc = readErrorDescription(rawResult);

    // ── JWT expired → refresh & retry (once) ────────────
    if (errorDesc === JWT_EXPIRED_CODE && !isRefreshRequest(args)) {
        const refreshed = await refreshTokensOnce();
        if (refreshed) {
            rawResult = await rawBaseQuery(args, api, extraOptions);
        }
        // If refresh failed, attemptTokenRefresh already called
        // clearAuthTokens() when it saw LOGIN_EXPIRED.
    }

    // ── refresh token expired (direct from endpoint) ─────
    if (errorDesc === LOGIN_EXPIRED_CODE) {
        clearAuthTokens();
    }

    // ── unwrap { success, result } ──────────────────────
    if (rawResult.error) return rawResult;

    const body = rawResult.data as WrappedResponse;

    if (body && typeof body === "object" && "success" in body) {
        if (body.success) {
            return { data: body.result };
        }

        return {
            error: {
                status: "CUSTOM_ERROR",
                error: body.errorDescription ?? "Request failed.",
                data: body,
            },
        };
    }

    return rawResult;
}

export const baseQuery: BaseQueryFn<
    string | FetchArgs,
    unknown,
    FetchBaseQueryError
> = async (args, api, extraOptions) => {
    const result = await rawBaseQuery(args, api, extraOptions);
    return unwrapEnvelope(result, args, api, extraOptions);
};

export const baseApi = createApi({
    reducerPath: "api",
    baseQuery,
    // Add shared tag types here so injected endpoints can use them.
    tagTypes: ["Example"],
    endpoints: () => ({}),
});

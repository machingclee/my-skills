import { z } from "zod";

/**
 * Wraps an inner schema in the standard success envelope:
 *   { success: true, result: <inner> }
 *
 * Usage:
 *   const MyResponse = successResponse(z.object({ name: z.string() }));
 *   // → { success: true, result: { name: string } }
 */
export function successResponse<T extends z.ZodTypeAny>(resultSchema: T) {
    return z.object({
        success: z.literal(true),
        result: resultSchema,
    });
}

/** Standard error envelope, for documenting error responses. */
export const ErrorResponse = z.object({
    success: z.literal(false),
    error: z.object({
        code: z.string().optional(),
        message: z.string(),
    }),
});

// ── Example / starter schemas ─────────────────────────────────────────────
// Replace these with your own. They exist so app.ts has something to import
// on first run; delete or rename as you build out real endpoints.

export const PingResponseSchema = z.object({
    status: z.string(),
    time_of_last_update: z.number(),
});

export const SuccessResponseSchema = successResponse(z.object({ status: z.string() }));

export const HelloResponseSchema = successResponse(z.object({ message: z.string() }));

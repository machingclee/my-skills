import { randomUUID } from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import { db } from "../db/database";
import { sideThreadId } from "./sessionMessages";

const router = Router();

/** Standard UUID — the only shape an ordinary session id can have. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/sessions
 *
 * Records a chat session the browser has already minted an id for. The
 * frontend calls this before it asks the agent, so the chat_session row exists
 * by the time AgentCore starts writing the thread to S3.
 *
 * The id comes from the client (`crypto.randomUUID()`), so this inserts that
 * exact value rather than generating one. Sending it again — a retry, or a
 * second message in a session already recorded — is a no-op and returns the
 * row that is already there.
 *
 * Body: { sessionId: string, username: string, name?: string }
 */
router.post(
  "/api/sessions",
  async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId, username, name } = req.body ?? {};

    if (typeof sessionId !== "string" || !UUID_REGEX.test(sessionId)) {
      res.status(400).json({
        success: false,
        errorMessage: "Invalid sessionId. Expected a UUID.",
      });
      return;
    }

    if (typeof username !== "string" || username.trim() === "") {
      res.status(400).json({
        success: false,
        errorMessage: "username is required.",
      });
      return;
    }

    const sessionName =
      typeof name === "string" && name.trim() !== "" ? name.trim() : "Untitled";

    try {
      const result = await db.transaction().execute(async (trx) => {
        // The session belongs to a user, and the only thing known about them
        // here is the username they logged in with. A user row is created on
        // first use.
        const user = await trx
          .insertInto("user")
          .values({
            username: username.trim(),
            updated_at: sql`now()`,
          })
          .onConflict((oc) => oc.column("username").doNothing())
          .returning(["username"])
          .executeTakeFirst();

        const owner =
          user ??
          (await trx
            .selectFrom("user")
            .select(["username"])
            .where("username", "=", username.trim())
            .executeTakeFirstOrThrow());

        // Newest first: everything this user already has slides down one, and
        // the new session takes position 0. A session that already exists is
        // left exactly where it is.
        const inserted = await trx
          .insertInto("chat_session")
          .values({
            id: randomUUID(),
            session_id: sessionId,
            username: owner.username,
            name: sessionName,
            updated_at: sql`now()`,
            position: 0,
          })
          .onConflict((oc) => oc.columns(["username", "session_id"]).doNothing())
          .returning(["id", "session_id", "name", "position"])
          .executeTakeFirst();

        if (inserted) {
          await trx
            .updateTable("chat_session")
            .set({ position: sql`"position" + 1` })
            .where("username", "=", owner.username)
            .where("session_id", "!=", sessionId)
            .execute();
          return { ...inserted, created: true };
        }

        const existing = await trx
          .selectFrom("chat_session")
          .select(["id", "session_id", "name", "position"])
          .where("username", "=", owner.username)
          .where("session_id", "=", sessionId)
          .executeTakeFirstOrThrow();
        return { ...existing, created: false };
      });

      res.status(result.created ? 201 : 200).json({
        success: true,
        result: {
          id: result.id,
          sessionId: result.session_id,
          name: result.name,
          position: result.position,
          created: result.created,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/** A `:btw:<n>` sequence — the only tail a side thread id can have. */
const SIDE_SEQ_REGEX = /^\d+$/;

/**
 * POST /api/sessions/:sessionId/side
 *
 * Records a `/btw` thread on the parent session the browser already recorded.
 * The id is `<sessionId>:btw:<sideSeq>`, the same string the agent writes to S3.
 *
 * Sending it again — a follow-up on a thread already recorded — moves that
 * thread back to position 0 and leaves its name alone. `name` is only written
 * for a thread that did not exist yet.
 *
 * Body: { username: string, sideSeq: number, name?: string }
 */
router.post(
  "/api/sessions/:sessionId/side",
  async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;
    const { username, sideSeq, name } = req.body ?? {};

    if (!UUID_REGEX.test(sessionId)) {
      res.status(400).json({
        success: false,
        errorMessage: "Invalid sessionId. Expected a UUID.",
      });
      return;
    }

    if (typeof username !== "string" || username.trim() === "") {
      res.status(400).json({
        success: false,
        errorMessage: "username is required.",
      });
      return;
    }

    if (typeof sideSeq !== "number" || !SIDE_SEQ_REGEX.test(String(sideSeq))) {
      res.status(400).json({
        success: false,
        errorMessage: "sideSeq is required.",
      });
      return;
    }

    const sideSessionId = sideThreadId(sessionId, String(sideSeq));
    const sideName =
      typeof name === "string" && name.trim() !== "" ? name.trim() : "Side question";

    try {
      const result = await db.transaction().execute(async (trx) => {
        const parent = await trx
          .selectFrom("chat_session")
          .select(["id", "last_side_seq"])
          .where("username", "=", username.trim())
          .where("session_id", "=", sessionId)
          .executeTakeFirst();

        // A `/btw` sent before the parent session was recorded has nothing to
        // attach to. The browser keeps it locally until that session exists.
        if (!parent) return null;

        // The number outlives the thread, so a deleted one is never minted again.
        if (sideSeq > parent.last_side_seq) {
          await trx
            .updateTable("chat_session")
            .set({ last_side_seq: sideSeq })
            .where("id", "=", parent.id)
            .execute();
        }

        const inserted = await trx
          .insertInto("chat_side_session")
          .values({
            id: randomUUID(),
            side_session_id: sideSessionId,
            chat_session_id: parent.id,
            name: sideName,
            updated_at: sql`now()`,
            position: 0,
          })
          .onConflict((oc) => oc.columns(["chat_session_id", "side_session_id"]).doNothing())
          .returning(["id", "side_session_id", "name", "position"])
          .executeTakeFirst();

        if (inserted) {
          await trx
            .updateTable("chat_side_session")
            .set({ position: sql`"position" + 1` })
            .where("chat_session_id", "=", parent.id)
            .where("side_session_id", "!=", sideSessionId)
            .execute();
          return { ...inserted, created: true };
        }

        // A follow-up: back to the front of the list, name unchanged.
        const existing = await trx
          .updateTable("chat_side_session")
          .set({ position: 0, updated_at: sql`now()` })
          .where("chat_session_id", "=", parent.id)
          .where("side_session_id", "=", sideSessionId)
          .returning(["id", "side_session_id", "name", "position"])
          .executeTakeFirstOrThrow();

        await trx
          .updateTable("chat_side_session")
          .set({ position: sql`"position" + 1` })
          .where("chat_session_id", "=", parent.id)
          .where("side_session_id", "!=", sideSessionId)
          .execute();

        return { ...existing, created: false };
      });

      if (!result) {
        res.status(404).json({
          success: false,
          errorMessage: "Session not found.",
        });
        return;
      }

      res.status(result.created ? 201 : 200).json({
        success: true,
        result: {
          id: result.id,
          sideSessionId: result.side_session_id,
          name: result.name,
          position: result.position,
          created: result.created,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/sessions/:sessionId/side/:sideSeq?username=
 *
 * Drops one side thread from the parent session's list. `last_side_seq` stays
 * where it is, and the transcript in S3 is left alone.
 *
 * A thread that was never recorded deletes nothing and still returns 200.
 */
router.delete(
  "/api/sessions/:sessionId/side/:sideSeq",
  async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId, sideSeq } = req.params;
    const { username } = req.query;

    if (!UUID_REGEX.test(sessionId) || !SIDE_SEQ_REGEX.test(sideSeq)) {
      res.status(400).json({
        success: false,
        errorMessage: "Invalid session id.",
      });
      return;
    }

    if (typeof username !== "string" || username.trim() === "") {
      res.status(400).json({
        success: false,
        errorMessage: "username is required.",
      });
      return;
    }

    try {
      const parent = await db
        .selectFrom("chat_session")
        .select("id")
        .where("username", "=", username.trim())
        .where("session_id", "=", sessionId)
        .executeTakeFirst();

      const deleted = parent
        ? await db
            .deleteFrom("chat_side_session")
            .where("chat_session_id", "=", parent.id)
            .where("side_session_id", "=", sideThreadId(sessionId, sideSeq))
            .returning("id")
            .executeTakeFirst()
        : undefined;

      res.json({
        success: true,
        result: { sideSessionId: sideThreadId(sessionId, sideSeq), deleted: Boolean(deleted) },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/sessions/:sessionId?username=
 *
 * Drops the chat_session row recorded for this user. Side threads go with it:
 * chat_side_session.chat_session_id is ON DELETE CASCADE. The transcript in S3
 * is left alone — this only removes the history entry.
 *
 * A session that was never recorded deletes nothing and still returns 200, so a
 * retry, or deleting a session that only ever lived in the browser, is safe.
 */
router.delete(
  "/api/sessions/:sessionId",
  async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;
    const { username } = req.query;

    if (!UUID_REGEX.test(sessionId)) {
      res.status(400).json({
        success: false,
        errorMessage: "Invalid sessionId. Expected a UUID.",
      });
      return;
    }

    if (typeof username !== "string" || username.trim() === "") {
      res.status(400).json({
        success: false,
        errorMessage: "username is required.",
      });
      return;
    }

    try {
      const deleted = await db
        .deleteFrom("chat_session")
        .where("username", "=", username.trim())
        .where("session_id", "=", sessionId)
        .returning(["id", "session_id"])
        .executeTakeFirst();

      res.json({
        success: true,
        result: { sessionId, deleted: Boolean(deleted) },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * One side thread, in the shape the frontend stores under `sideSessions`.
 * `side_session_id` is `<parentSessionId>:btw:<n>`.
 */
type StoredSideSession = {
  sideSessionId: string;
  name: string;
  updatedAt: string | null;
};

/**
 * One session, in the shape the frontend stores under `idToSession`.
 * `sideSessions` is omitted entirely when the session has none, matching the
 * object local storage holds — it is never an empty array there.
 */
type StoredSession = {
  name: string;
  updatedAt: string | null;
  lastSideSeq: number;
  sideSessions?: StoredSideSession[];
};

/**
 * GET /api/sessions?username=
 *
 * The signed-in user's chat history, in the exact shape `chat-storage` keeps
 * under `sessions`: `sessionIds` ordered newest first, and `idToSession`
 * keyed by those ids. Side threads come back nested, newest first, through
 * jsonArrayFrom.
 */
router.get(
  "/api/sessions",
  async (req: Request, res: Response, next: NextFunction) => {
    const { username } = req.query;

    if (typeof username !== "string" || username.trim() === "") {
      res.status(400).json({
        success: false,
        errorMessage: "username is required.",
      });
      return;
    }

    try {
      const rows = await db
        .selectFrom("chat_session")
        .select([
          "session_id as sessionId",
          "name",
          "updated_at as updatedAt",
          "last_side_seq as lastSideSeq",
        ])
        .select((eb) => [
          jsonArrayFrom(
            eb
              .selectFrom("chat_side_session")
              .select([
                "chat_side_session.side_session_id as sideSessionId",
                "chat_side_session.name as name",
                "chat_side_session.updated_at as updatedAt",
              ])
              .whereRef("chat_side_session.chat_session_id", "=", "chat_session.id")
              .orderBy("chat_side_session.position")
          ).as("sideSessions"),
        ])
        .where("username", "=", username.trim())
        .orderBy("position")
        .execute();

      const sessionIds: string[] = [];
      const idToSession: { [sessionId: string]: StoredSession } = {};

      for (const row of rows) {
        sessionIds.push(row.sessionId);
        const session: StoredSession = {
          name: row.name,
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
          lastSideSeq: row.lastSideSeq,
        };
        if (row.sideSessions.length) {
          session.sideSessions = row.sideSessions.map((side) => ({
            sideSessionId: side.sideSessionId,
            name: side.name,
            updatedAt: side.updatedAt ? new Date(side.updatedAt).toISOString() : null,
          }));
        }
        idToSession[row.sessionId] = session;
      }

      res.json({
        success: true,
        result: { sessionIds, idToSession },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

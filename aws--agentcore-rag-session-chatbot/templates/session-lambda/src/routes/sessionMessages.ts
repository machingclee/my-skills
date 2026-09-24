import { Router, Request, Response, NextFunction } from "express";
import { messagesPrefix, readSessionMessages } from "../messages";

const router = Router();

/** Standard UUID — the only shape an ordinary session id can have. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/btw` side questions run on their own thread whose id is `<parent>:btw:<n>`.
 * See add-btw.md; the browser mints the same string in
 * `AgentChatInterface.sendSideQuestion` and persists it as `ChatSession.sideSessionId`,
 * so the two spellings must stay in step.
 */
const SIDE_THREAD_INFIX = ":btw:";

/** A side thread's id, as the browser stores it and as the agent writes it to S3. */
export function sideThreadId(parentSessionId: string, sideSeq: string): string {
  return `${parentSessionId}${SIDE_THREAD_INFIX}${sideSeq}`;
}

/**
 * GET /api/sessions/:sessionId/messages
 *
 * Lists and returns all messages for a given session from S3.
 *
 * S3 path convention:
 *   sessions/{sessionId}/session_{sessionId}/agents/agent_default/messages/
 *
 * Each message is a JSON file: message_0.json, message_1.json, …
 */
router.get(
  "/api/sessions/:sessionId/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;

    if (!UUID_REGEX.test(sessionId)) {
      res.status(400).json({
        success: false,
        errorMessage: "Invalid session-id format. Expected a UUID.",
      });
      return;
    }

    try {
      const { objectCount, messages } = await readSessionMessages(
        messagesPrefix(sessionId)
      );

      if (objectCount === 0) {
        res.status(404).json({
          success: false,
          errorMessage: `No messages found for session "${sessionId}".`,
        });
        return;
      }

      res.json({
        success: true,
        result: {
          sessionId,
          messageCount: messages.length,
          messages,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/sessions/:parentSessionId/side/:sideSeq/messages
 *
 * Returns the turns of one `/btw` side thread — the thread `<parent>:btw:<n>` that the
 * side panel is showing. Its own prefix holds only the side's turns: the parent's
 * transcript is read through by the agent at run time and never copied down, so this is
 * a fragment rather than a standalone conversation (add-btw.md). A reader that wants the
 * whole exchange fetches the parent from the route above as well.
 *
 * The side id is *constructed* from two validated halves rather than parsed out of a URL,
 * which is why the parent id keeps the plain UUID guard and the sequence must be digits.
 */
router.get(
  "/api/sessions/:parentSessionId/side/:sideSeq/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    const { parentSessionId, sideSeq } = req.params;

    if (!UUID_REGEX.test(parentSessionId)) {
      res.status(400).json({
        success: false,
        errorMessage: "Invalid session-id format. Expected a UUID.",
      });
      return;
    }

    // Digits only, and that is load-bearing rather than cosmetic: Express decodes %2F
    // inside a path param *after* routing, so a looser check would let a "/" through and
    // build an S3 prefix outside the parent's namespace.
    if (!/^\d+$/.test(sideSeq)) {
      res.status(400).json({
        success: false,
        errorMessage: "Invalid side-question sequence. Expected digits.",
      });
      return;
    }

    const sessionId = sideThreadId(parentSessionId, sideSeq);

    try {
      const { messages } = await readSessionMessages(messagesPrefix(sessionId));

      // Deliberately not a 404 when empty, unlike the parent route: a side thread that
      // was minted but whose first run died before writing anything is a legitimate
      // state, and the panel should come up empty rather than surface an error.
      res.json({
        success: true,
        result: {
          sessionId,
          parentSessionId,
          messageCount: messages.length,
          messages,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

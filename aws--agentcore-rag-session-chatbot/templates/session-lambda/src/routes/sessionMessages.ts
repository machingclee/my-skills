import { Router, Request, Response, NextFunction } from "express";
import {
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "../s3Client";
import type { MessageRecord } from "../types";

const router = Router();

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

    // Validate UUID format (basic check — allows standard UUID v4)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      res.status(400).json({
        success: false,
        errorMessage: "Invalid session-id format. Expected a UUID.",
      });
      return;
    }

    // Prefix where messages live for this session
    const prefix = `sessions/${sessionId}/session_${sessionId}/agents/agent_default/messages/`;

    try {
      // 1. List all message objects under the prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
      });

      const listed = await s3Client.send(listCommand);

      const keys = (listed.Contents ?? [])
        .map((obj) => obj.Key!)
        .filter((key) => key.endsWith(".json"));

      if (keys.length === 0) {
        res.status(404).json({
          success: false,
          errorMessage: `No messages found for session "${sessionId}".`,
        });
        return;
      }

      // 2. Fetch every message JSON in parallel
      const fetchPromises = keys.map(async (key) => {
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        const obj = await s3Client.send(getCommand);
        const body = await obj.Body?.transformToString("utf-8");
        if (!body) return null;
        try {
          return JSON.parse(body) as MessageRecord;
        } catch {
          console.error(`Failed to parse message JSON: ${key}`);
          return null;
        }
      });

      const messages = (await Promise.all(fetchPromises))
        .filter((m): m is MessageRecord => m !== null)
        // Sort by message_id ascending so conversation order is preserved
        .sort((a, b) => a.message_id - b.message_id);

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

export default router;

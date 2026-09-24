import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "./s3Client";
import type { MessageRecord } from "./types";

/**
 * S3 prefix where a thread's message objects live.
 *
 * An ordinary session and a `/btw` side thread use the same shape — only the id
 * differs — so callers pass whichever id they are reading:
 *   sessions/{sessionId}/session_{sessionId}/agents/agent_default/messages/
 */
export function messagesPrefix(sessionId: string): string {
  return `sessions/${sessionId}/session_${sessionId}/agents/agent_default/messages/`;
}

/**
 * Read every message object under a prefix, oldest first.
 *
 * `objectCount` is the number of `.json` keys listed, counted *before* any fetch, and
 * is returned alongside the messages rather than folded into `messages.length`: the two
 * differ when an object exists but fails to parse, and callers key their 404 on that
 * distinction — no objects at all means an unknown thread, whereas objects that will
 * not parse mean a real thread with damaged contents, which is not a 404.
 *
 * Known limit, carried over from the route this was extracted from: a prefix holding
 * more than one S3 listing page (1000 keys) is read one page deep only.
 */
export async function readSessionMessages(
  prefix: string
): Promise<{ objectCount: number; messages: MessageRecord[] }> {
  const listed = await s3Client.send(
    new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix })
  );

  const keys = (listed.Contents ?? [])
    .map((obj) => obj.Key!)
    .filter((key) => key.endsWith(".json"));

  if (keys.length === 0) return { objectCount: 0, messages: [] };

  const fetchPromises = keys.map(async (key) => {
    const obj = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
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
    // Numeric sort: message_1000000 belongs after message_17, which a lexicographic
    // sort would reverse.
    .sort((a, b) => a.message_id - b.message_id);

  return { objectCount: keys.length, messages };
}

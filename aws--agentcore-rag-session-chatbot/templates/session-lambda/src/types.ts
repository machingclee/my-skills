// --- Message JSON structure as stored in S3 ---

export interface ToolUseInput {
  [key: string]: unknown;
}

export interface ToolUseBlock {
  toolUse: {
    toolUseId: string;
    name: string;
    input: ToolUseInput;
  };
}

export interface ContentBlock {
  text?: string;
  toolUse?: ToolUseBlock["toolUse"];
}

export interface MessageMetadata {
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadInputTokens: number;
  };
  metrics: {
    latencyMs: number;
    timeToFirstByteMs: number;
  };
}

export interface MessageRecord {
  message: {
    role: "assistant" | "user";
    content: ContentBlock[];
    metadata: MessageMetadata;
    tracking_id: string;
  };
  message_id: number;
  redact_message: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface SessionMessagesResponse {
  success: boolean;
  result: {
    /** The thread these messages belong to: a session id, or `<parent>:btw:<n>` for a side thread. */
    sessionId: string;
    /** Present only on the side-thread route, where it names the thread the side question was asked about. */
    parentSessionId?: string;
    messageCount: number;
    messages: MessageRecord[];
  };
}

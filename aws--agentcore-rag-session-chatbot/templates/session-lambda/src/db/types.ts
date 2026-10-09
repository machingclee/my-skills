import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type chat_session = {
    id: Generated<string>;
    session_id: string;
    username: string;
    name: Generated<string>;
    updated_at: Timestamp | null;
    /**
     * Highest `:btw:<n>` ever minted. Outlives deleted side threads, so it never decreases.
     */
    last_side_seq: Generated<number>;
    position: Generated<number>;
};
export type chat_side_session = {
    id: Generated<string>;
    side_session_id: string;
    chat_session_id: string;
    name: string;
    updated_at: Timestamp | null;
    position: Generated<number>;
};
export type embeddings = {
    id: string;
    content: string | null;
    metadata: unknown | null;
    /**
     * `vector(1536)`, written as `Unsupported` in schema.prisma. prisma-kysely
     * drops Unsupported columns, so this line is kept by hand — do not delete
     * it when regenerating.
     */
    embedding: string | null;
};
export type tags = {
    tag: string;
};
export type user = {
    username: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
};
export type DB = {
    chat_session: chat_session;
    chat_side_session: chat_side_session;
    embeddings: embeddings;
    tags: tags;
    user: user;
};

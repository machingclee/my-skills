-- Bootstrap PostgreSQL helpers used as Prisma @default(dbgenerated(...)) values.
-- Must run before any table migration that references these functions.
-- Source pattern: wonderbricks wb-backend-node (pgcrypto + ULID-as-UUID + HK timestamps).
--
-- Functions are created in the "{{schemaName}}" schema. Prisma Migrate does NOT
-- create non-default schemas automatically, so the schema is created here first
-- (CREATE SCHEMA IF NOT EXISTS is a no-op for the default "public").
--
-- IMPORTANT — why every cross-function call below is schema-qualified:
-- PL/pgSQL resolves unqualified names inside a function body against the
-- CALLER's session search_path at call time (proconfig is NULL here), NOT the
-- schema the function lives in. So ulid_as_uuid() calling plain generate_ulid()
-- fails from any session whose search_path lacks {{schemaName}} — e.g. a JDBC
-- connection without currentSchema, psql defaults ("$user", public), etc.
-- Schema-qualifying ({{schemaName}}.*) makes the helpers work from ANY session.

-- CreateSchema (idempotent — safe if already exists)
CREATE SCHEMA IF NOT EXISTS "{{schemaName}}";

-- Install the helper functions into the {{schemaName}} schema
SET search_path TO "{{schemaName}}";

-- pgcrypto installs into the first schema of search_path ({{schemaName}}) only
-- when it is not already installed elsewhere. If the target DB already has
-- pgcrypto in another schema (typically "public"), either re-point it with
--   ALTER EXTENSION pgcrypto SET SCHEMA "{{schemaName}}";
-- or qualify gen_random_bytes below with that other schema instead.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Epoch milliseconds (UTC) as float — matches Prisma Float fields using gen_created_at()
CREATE OR REPLACE FUNCTION gen_created_at() RETURNS float AS $$
BEGIN
  RETURN ROUND(extract(epoch FROM NOW()::TIMESTAMPTZ) * 1000, 0)::float;
END
$$ LANGUAGE plpgsql;

-- Human-readable Asia/Hong_Kong (+8) timestamp string
CREATE OR REPLACE FUNCTION gen_created_at_hk_timestr() RETURNS text AS $$
BEGIN
  RETURN TO_CHAR(
    (NOW()::TIMESTAMPTZ AT TIME ZONE 'UTC' AT TIME ZONE 'GMT+8'),
    'YYYY-MM-DD HH24:MI:SS'
  );
END
$$ LANGUAGE plpgsql;

-- Crockford Base32 ULID (26 chars)
CREATE OR REPLACE FUNCTION generate_ulid()
RETURNS TEXT
AS $$
DECLARE
  encoding   BYTEA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  timestamp  BYTEA = E'\\000\\000\\000\\000\\000\\000';
  output     TEXT = '';
  unix_time  BIGINT;
  ulid       BYTEA;
BEGIN
  unix_time = (EXTRACT(EPOCH FROM CLOCK_TIMESTAMP()) * 1000)::BIGINT;
  timestamp = SET_BYTE(timestamp, 0, (unix_time >> 40)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 1, (unix_time >> 32)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 2, (unix_time >> 24)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 3, (unix_time >> 16)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 4, (unix_time >> 8)::BIT(8)::INTEGER);
  timestamp = SET_BYTE(timestamp, 5, unix_time::BIT(8)::INTEGER);

  ulid = timestamp || {{schemaName}}.gen_random_bytes(10);

  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 0) & 224) >> 5));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 0) & 31)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 1) & 248) >> 3));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 1) & 7) << 2) | ((GET_BYTE(ulid, 2) & 192) >> 6)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 2) & 62) >> 1));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 2) & 1) << 4) | ((GET_BYTE(ulid, 3) & 240) >> 4)));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 3) & 15) << 1) | ((GET_BYTE(ulid, 4) & 128) >> 7)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 4) & 124) >> 2));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 4) & 3) << 3) | ((GET_BYTE(ulid, 5) & 224) >> 5)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 5) & 31)));

  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 6) & 248) >> 3));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 6) & 7) << 2) | ((GET_BYTE(ulid, 7) & 192) >> 6)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 7) & 62) >> 1));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 7) & 1) << 4) | ((GET_BYTE(ulid, 8) & 240) >> 4)));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 8) & 15) << 1) | ((GET_BYTE(ulid, 9) & 128) >> 7)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 9) & 124) >> 2));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 9) & 3) << 3) | ((GET_BYTE(ulid, 10) & 224) >> 5)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 10) & 31)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 11) & 248) >> 3));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 11) & 7) << 2) | ((GET_BYTE(ulid, 12) & 192) >> 6)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 12) & 62) >> 1));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 12) & 1) << 4) | ((GET_BYTE(ulid, 13) & 240) >> 4)));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 13) & 15) << 1) | ((GET_BYTE(ulid, 14) & 128) >> 7)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 14) & 124) >> 2));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(ulid, 14) & 3) << 3) | ((GET_BYTE(ulid, 15) & 224) >> 5)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(ulid, 15) & 31)));

  RETURN output;
END
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION parse_ulid(ulid text) RETURNS bytea AS $$
DECLARE
  bytes bytea = E'\\x00000000 00000000 00000000 00000000';
  v     char[];
  dec   integer[] = ARRAY[
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 255, 255, 255,   0,   1,   2,
      3,   4,   5,   6,   7,   8,   9, 255, 255, 255,
    255, 255, 255, 255,  10,  11,  12,  13,  14,  15,
    16,  17,   1,  18,  19,   1,  20,  21,   0,  22,
    23,  24,  25,  26, 255,  27,  28,  29,  30,  31,
    255, 255, 255, 255, 255, 255,  10,  11,  12,  13,
    14,  15,  16,  17,   1,  18,  19,   1,  20,  21,
      0,  22,  23,  24,  25,  26, 255,  27,  28,  29,
    30,  31
  ];
BEGIN
  IF NOT ulid ~* '^[0-7][0-9ABCDEFGHJKMNPQRSTVWXYZ]{25}$' THEN
    RAISE EXCEPTION 'Invalid ULID: %', ulid;
  END IF;

  v = regexp_split_to_array(ulid, '');

  bytes = SET_BYTE(bytes, 0, (dec[ASCII(v[1])] << 5) | dec[ASCII(v[2])]);
  bytes = SET_BYTE(bytes, 1, (dec[ASCII(v[3])] << 3) | (dec[ASCII(v[4])] >> 2));
  bytes = SET_BYTE(bytes, 2, (dec[ASCII(v[4])] << 6) | (dec[ASCII(v[5])] << 1) | (dec[ASCII(v[6])] >> 4));
  bytes = SET_BYTE(bytes, 3, (dec[ASCII(v[6])] << 4) | (dec[ASCII(v[7])] >> 1));
  bytes = SET_BYTE(bytes, 4, (dec[ASCII(v[7])] << 7) | (dec[ASCII(v[8])] << 2) | (dec[ASCII(v[9])] >> 3));
  bytes = SET_BYTE(bytes, 5, (dec[ASCII(v[9])] << 5) | dec[ASCII(v[10])]);

  bytes = SET_BYTE(bytes, 6, (dec[ASCII(v[11])] << 3) | (dec[ASCII(v[12])] >> 2));
  bytes = SET_BYTE(bytes, 7, (dec[ASCII(v[12])] << 6) | (dec[ASCII(v[13])] << 1) | (dec[ASCII(v[14])] >> 4));
  bytes = SET_BYTE(bytes, 8, (dec[ASCII(v[14])] << 4) | (dec[ASCII(v[15])] >> 1));
  bytes = SET_BYTE(bytes, 9, (dec[ASCII(v[15])] << 7) | (dec[ASCII(v[16])] << 2) | (dec[ASCII(v[17])] >> 3));
  bytes = SET_BYTE(bytes, 10, (dec[ASCII(v[17])] << 5) | dec[ASCII(v[18])]);
  bytes = SET_BYTE(bytes, 11, (dec[ASCII(v[19])] << 3) | (dec[ASCII(v[20])] >> 2));
  bytes = SET_BYTE(bytes, 12, (dec[ASCII(v[20])] << 6) | (dec[ASCII(v[21])] << 1) | (dec[ASCII(v[22])] >> 4));
  bytes = SET_BYTE(bytes, 13, (dec[ASCII(v[22])] << 4) | (dec[ASCII(v[23])] >> 1));
  bytes = SET_BYTE(bytes, 14, (dec[ASCII(v[23])] << 7) | (dec[ASCII(v[24])] << 2) | (dec[ASCII(v[25])] >> 3));
  bytes = SET_BYTE(bytes, 15, (dec[ASCII(v[25])] << 5) | dec[ASCII(v[26])]);

  RETURN bytes;
END
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION ulid_to_uuid(ulid text) RETURNS uuid AS $$
BEGIN
  RETURN encode({{schemaName}}.parse_ulid(ulid), 'hex')::uuid;
END
$$ LANGUAGE plpgsql IMMUTABLE;

-- Primary key default used from Prisma: @default(dbgenerated("ulid_as_uuid()")) @db.Uuid
CREATE OR REPLACE FUNCTION ulid_as_uuid() RETURNS uuid AS $$
BEGIN
  RETURN {{schemaName}}.ulid_to_uuid({{schemaName}}.generate_ulid());
END
$$ LANGUAGE plpgsql;

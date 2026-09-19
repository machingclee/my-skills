import { S3Client } from "@aws-sdk/client-s3";

// Reusable S3 client. When running in Lambda the SDK auto-detects credentials
// from the execution role. Locally it uses your default AWS credential chain
// (~/.aws/credentials, env vars, etc.).
// In Lambda, AWS_REGION is auto-provided at runtime. Locally, use S3_REGION from env.
const region = process.env.AWS_REGION || process.env.S3_REGION || "{{AWS_REGION}}";
export const s3Client = new S3Client({ region });

export const BUCKET_NAME = process.env.BUCKET_NAME || "{{S3_SESSION_BUCKET}}";

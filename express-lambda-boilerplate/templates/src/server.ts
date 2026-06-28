import { app } from "./app";
import * as serverless from "serverless-http";

// AWS Lambda entry point. serverless-http adapts the Express app to Lambda's
// API-Gateway event/response format (the Node equivalent of Python's Mangum).
// serverless.yml `src/server.handler` points here.
//
// `binary` lets Express serve images/PDFs/etc. through API Gateway uncorrupted —
// pair it with `apiGateway.binaryMediaTypes: ["*/*"]` in serverless.yml.
export const handler = serverless.default(app, { binary: ["*/*"] });

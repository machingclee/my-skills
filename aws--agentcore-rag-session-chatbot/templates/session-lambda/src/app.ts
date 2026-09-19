import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import errorHandler from "./middlewares/errorHandler";
import sessionMessagesRouter from "./routes/sessionMessages";

export const app = express();

// Health check — lightest possible route; good for Lambda warmups / uptime probes.
app.get("/healthcheck", (_req: Request, res: Response) => {
  res.status(200).json({ success: true, result: { status: "ok" } });
});

// Global middleware
// origin: true reflects the caller's origin (required for credentials: true).
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// --- Routes ---
app.use(sessionMessagesRouter);

// Error handler — MUST be registered last (after all routes).
app.use(errorHandler);

// Start the local HTTP server ONLY when run directly via `ts-node src/app.ts`.
// In Lambda, src/server.ts imports this module; without this guard, app.listen()
// would execute on cold start with PORT undefined (NaN) and crash the Lambda.
if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
}

import { NextFunction, Request, Response } from "express";

// Registered LAST via `app.use(errorHandler)`. Express routes here when a
// route/middleware throws or calls next(err). Keeps Lambda from returning an
// unstructured HTML error page.
export default (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, errorMessage: err.message });
};

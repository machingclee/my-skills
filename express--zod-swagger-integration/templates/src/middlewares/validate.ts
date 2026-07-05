import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Generic validation middleware factory.
 * Parses req.body against the given Zod schema. On failure returns 400
 * with structured issues. On success, replaces req.body with the parsed
 * (and potentially transformed) data so downstream handlers are fully typed.
 *
 * Used directly by createDocApp() when a route sets `bodySchema`,
 * but is also exported so it can be applied manually to a plain Express app
 * (see the /express--create-zod-middleware skill).
 */
function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        errorMessage: "Validation failed",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    req.body = result.data; // replace with parsed data
    next();
  };
}

export default validate;

---
name: express--create-zod-middleware
description: >-
  Add a reusable Zod validation middleware factory to an Express TypeScript
  project. Creates `src/middlewares/validate.ts` with a `validate(schema)`
  function that parses `req.body` against a Zod schema, returns 400 with
  structured issues on failure, and replaces `req.body` with the parsed data
  on success. Also adds the `validate` import to `src/app.ts` if it exists.
  Use when the user wants to add Zod request validation to an Express app,
  create a validation middleware, validate request bodies, or scaffold a
  `validate` function for Express routes.
---

# Express Zod Validation Middleware

Adds a reusable `validate` middleware factory to an Express TypeScript project.
Drop it onto any route and pass a Zod schema — the middleware validates
`req.body`, returns a 400 on failure, and replaces `req.body` with the typed
output on success.

## What it does

- Creates `src/middlewares/validate.ts` if it doesn't already exist
- If `src/app.ts` exists, ensures `validate` is imported at the top

## The middleware

```typescript
import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

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
    req.body = result.data;
    next();
  };
}

export default validate;
```

## How to apply

1. Check if `src/middlewares/validate.ts` already exists. If so, do nothing.
2. Create `src/middlewares/` if it doesn't exist, then write `validate.ts`.
3. If `src/app.ts` exists and doesn't already import `validate`, add
   `import validate from "./middlewares/validate";` below the last existing
   import line.

## Usage pattern (for the user to follow)

```typescript
import { z } from "zod";

const InvocationSchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
});

app.post("/invocations", validate(InvocationSchema), async (req, res) => {
  const { prompt } = req.body as z.infer<typeof InvocationSchema>;
  // prompt is typed and validated
});
```

## Prerequisites

The project must have `zod` installed:

```bash
npm install zod
```

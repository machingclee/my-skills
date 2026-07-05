import { RequestHandler, Request, Response } from "express";
import express from "express";
import { z } from "zod";
import swaggerUi from "swagger-ui-express";

// Zod v4 deprecated ZodSchema in favor of ZodTypeAny — alias for brevity.
type ZodSchema = z.ZodTypeAny;
import validate from "../middlewares/validate";

// ── Types ────────────────────────────────────────────────────────────────

interface RouteDefinition<
  TBody extends ZodSchema | undefined = ZodSchema | undefined,
  TResp extends ZodSchema | undefined = ZodSchema | undefined,
> {
  method: "get" | "post" | "put" | "delete" | "patch";
  path: string;
  summary?: string;
  tags?: string[];
  requestBodySchema?: TBody;
  querySchema?: ZodSchema;
  /** Success response schema — infers res.json() type + auto-generates OpenAPI. */
  responseSchema?: TResp;
  /** Full response overrides (merges on top of responseSchema). */
  responses?: Record<string, { description: string; schema?: ZodSchema }>;
}

/**
 * Config object passed as the second argument to app.get/post/put/delete/patch.
 * TBody: inferred from requestBodySchema (or undefined).
 * TResp: inferred from responseSchema (or undefined).
 */
export type EndpointConfig<
  TBody extends ZodSchema | undefined = undefined,
  TResp extends ZodSchema | undefined = undefined,
> = Omit<RouteDefinition<TBody, TResp>, "method" | "path">;

/** Request with body typed from bodySchema. */
type TypedRequest<TBody extends ZodSchema | undefined> =
  TBody extends ZodSchema
  ? Omit<Request, "body"> & { body: z.infer<TBody> }
  : Request;

/** Response with json() narrowed to the responseSchema type. */
type TypedResponse<TResp extends ZodSchema | undefined> =
  TResp extends ZodSchema
  ? Omit<Response, "json"> & {
    json(body: z.infer<TResp>): Response;
    status(code: number): TypedResponse<TResp>;
  }
  : Response;

type TypedHandler<
  TBody extends ZodSchema | undefined,
  TResp extends ZodSchema | undefined,
> = (
  req: TypedRequest<TBody>,
  res: TypedResponse<TResp>,
) => void | Promise<void>;

// ── Augmented Express app ─────────────────────────────────────────────────

interface DocAppMethods {
  // Overload 1: bodySchema + responseSchema — req.body + res.json both typed
  get<TBody extends ZodSchema, TResp extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, TResp>, handler: TypedHandler<TBody, TResp>
  ): void;
  // Overload 2: bodySchema only — req.body typed, res.json any
  get<TBody extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, undefined>, handler: TypedHandler<TBody, undefined>
  ): void;
  // Overload 3: no schemas — plain Express
  get(
    path: string, config: EndpointConfig<undefined, undefined>, handler: TypedHandler<undefined, undefined>
  ): void;
  // Overload 4: plain Express — no config
  get(path: string, handler: RequestHandler): void;

  post<TBody extends ZodSchema, TResp extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, TResp>, handler: TypedHandler<TBody, TResp>
  ): void;
  post<TBody extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, undefined>, handler: TypedHandler<TBody, undefined>
  ): void;
  post(
    path: string, config: EndpointConfig<undefined, undefined>, handler: TypedHandler<undefined, undefined>
  ): void;
  post(path: string, handler: RequestHandler): void;

  put<TBody extends ZodSchema, TResp extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, TResp>, handler: TypedHandler<TBody, TResp>
  ): void;
  put<TBody extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, undefined>, handler: TypedHandler<TBody, undefined>
  ): void;
  put(
    path: string, config: EndpointConfig<undefined, undefined>, handler: TypedHandler<undefined, undefined>
  ): void;
  put(path: string, handler: RequestHandler): void;

  delete<TBody extends ZodSchema, TResp extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, TResp>, handler: TypedHandler<TBody, TResp>
  ): void;
  delete<TBody extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, undefined>, handler: TypedHandler<TBody, undefined>
  ): void;
  delete(
    path: string, config: EndpointConfig<undefined, undefined>, handler: TypedHandler<undefined, undefined>
  ): void;
  delete(path: string, handler: RequestHandler): void;

  patch<TBody extends ZodSchema, TResp extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, TResp>, handler: TypedHandler<TBody, TResp>
  ): void;
  patch<TBody extends ZodSchema>(
    path: string, config: EndpointConfig<TBody, undefined>, handler: TypedHandler<TBody, undefined>
  ): void;
  patch(
    path: string, config: EndpointConfig<undefined, undefined>, handler: TypedHandler<undefined, undefined>
  ): void;
  patch(path: string, handler: RequestHandler): void;
}

export type DocApp = ReturnType<typeof express> & DocAppMethods;

// ── Registry ──────────────────────────────────────────────────────────────

const registry: RouteDefinition[] = [];

/** Checks whether the argument is an EndpointConfig (not a handler or internal Express arg). */
const CONFIG_KEYS = ["requestBodySchema", "responseSchema", "querySchema", "summary", "tags", "responses"];
function isConfig(obj: any): obj is EndpointConfig {
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || typeof obj === "function") return false;
  return CONFIG_KEYS.some((k) => k in obj);
}

// ── createDocApp ──────────────────────────────────────────────────────────

/**
 * Creates an Express app with FastAPI-style route registration.
 *
 * Usage:
 *   const app = createDocApp();
 *
 *   app.get("/ping", {
 *     responseSchema: PingResponseSchema,
 *     summary: "Health check",
 *   }, (_req, res) => { ... });
 *
 *   app.post("/invocations", {
 *     requestBodySchema: InvocationSchema,  // validates + types req.body
 *     responseSchema: InvocationResponseSchema,
 *     summary: "Invoke the Agent",
 *   }, async (req, res) => {
 *     const { prompt } = req.body;          // typed, no cast
 *   });
 */
export function createDocApp(): DocApp {
  const app = express() as DocApp;

  const methods = ["get", "post", "put", "delete", "patch"] as const;
  for (const method of methods) {
    const original = (app as any)[method].bind(app) as (...args: any[]) => any;

    (app as any)[method] = function (this: any, path: string, configOrHandler: any, maybeHandler?: any) {
      if (isConfig(configOrHandler)) {
        // FastAPI-style: app.post(path, config, handler)
        const config = configOrHandler as EndpointConfig;
        let handler: RequestHandler = maybeHandler;
        const middleware: RequestHandler[] = [];
        if (config.requestBodySchema) {
          middleware.push(validate(config.requestBodySchema));
        }
        // Wrap handler to validate the response body against responseSchema
        if (config.responseSchema) {
          const responseSchema = config.responseSchema;
          const userHandler = handler;
          handler = (req, res, next) => {
            const originalJson = res.json.bind(res);
            res.json = function (this: any, body: any) {
              const status = this.statusCode || 200;
              if (status >= 200 && status < 300 && body !== undefined) {
                const result = (responseSchema as ZodSchema).safeParse(body);
                if (!result.success) {
                  console.error(
                    `[response validation] ${method.toUpperCase()} ${path} body does not match responseSchema:`,
                    result.error.issues
                  );
                  this.status(500);
                  return originalJson({ error: "Internal server error" });
                }
                return originalJson(result.data);
              }
              return originalJson(body);
            } as any;
            return userHandler(req, res, next);
          };
        }
        registry.push({ method, path, ...config });
        return original(path, ...middleware, handler);
      }
      // Plain Express — only forward defined arguments so Express's
      // arg-count-based dispatch (route vs settings getter) works.
      if (arguments.length === 1 || configOrHandler === undefined) {
        return original(path);
      }
      if (arguments.length === 2) {
        return original(path, configOrHandler);
      }
      return original(path, configOrHandler, maybeHandler);
    };
  }

  return app;
}

// ── keep registerRoute for backward compatibility ─────────────────────────

export function registerRoute<TBody extends ZodSchema>(
  app: DocApp,
  def: Omit<RouteDefinition<TBody>, "requestBodySchema"> & { requestBodySchema: TBody },
  handler: TypedHandler<TBody, undefined>,
): void;
export function registerRoute(
  app: DocApp,
  def: Omit<RouteDefinition, "requestBodySchema"> & { requestBodySchema?: undefined },
  handler: TypedHandler<undefined, undefined>,
): void;
export function registerRoute<TBody extends ZodSchema | undefined = undefined>(
  app: DocApp,
  def: Omit<RouteDefinition<TBody>, "requestBodySchema"> & { requestBodySchema?: TBody },
  handler: TypedHandler<TBody, undefined>,
): void {
  (app as any)[def.method](def.path, def, handler);
}

// ── OpenAPI generation ────────────────────────────────────────────────────

/** Returns the inner type for optional/default wrappers, or the schema itself. */
function unwrap(schema: ZodSchema): ZodSchema {
  const def = (schema as any)._def;
  if (def?.innerType) return unwrap(def.innerType);
  return schema;
}

/** Get the type string (e.g. "string", "object") from a Zod schema. Works across v3/v4. */
function zodType(schema: ZodSchema): string {
  return (schema as any)._def?.type ?? (schema as any)._def?.typeName ?? "";
}

/** Get the shape object from a ZodObject, handling v3 (fn) vs v4 (plain object). */
function getShape(obj: ZodSchema): Record<string, ZodSchema> {
  const shapeDef = (obj as any)._def.shape;
  return typeof shapeDef === "function" ? shapeDef() : shapeDef;
}

function zodToOpenApiSchema(schema: ZodSchema): Record<string, unknown> {
  const inner = unwrap(schema);
  const tn = zodType(inner);

  if (tn === "string" || tn === "ZodString") {
    const checks = (inner as any)._def.checks || [];
    const minCheck = checks.find((c: any) => c.kind === "min");
    const maxCheck = checks.find((c: any) => c.kind === "max");
    const result: Record<string, unknown> = { type: "string" };
    if (minCheck) result.minLength = minCheck.value;
    if (maxCheck) result.maxLength = maxCheck.value;
    return result;
  }

  if (tn === "number" || tn === "ZodNumber") {
    const checks = (inner as any)._def.checks || [];
    const minCheck = checks.find((c: any) => c.kind === "min");
    const maxCheck = checks.find((c: any) => c.kind === "max");
    const intCheck = checks.find((c: any) => c.kind === "int");
    const result: Record<string, unknown> = { type: intCheck ? "integer" : "number" };
    if (minCheck) result.minimum = minCheck.value;
    if (maxCheck) result.maximum = maxCheck.value;
    return result;
  }

  if (tn === "boolean" || tn === "ZodBoolean") return { type: "boolean" };

  if (tn === "enum" || tn === "ZodEnum") return { type: "string", enum: (inner as any)._def.values };

  if (tn === "array" || tn === "ZodArray") {
    return { type: "array", items: zodToOpenApiSchema((inner as any)._def.type) };
  }

  if (tn === "object" || tn === "ZodObject") {
    const shape = getShape(inner);
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, fieldSchema] of Object.entries(shape)) {
      properties[key] = zodToOpenApiSchema(fieldSchema as ZodSchema);
      const ft = zodType(fieldSchema as ZodSchema);
      if (ft !== "optional" && ft !== "default" && ft !== "ZodOptional" && ft !== "ZodDefault") {
        required.push(key);
      }
    }
    const result: Record<string, unknown> = { type: "object", properties };
    if (required.length > 0) result.required = required;
    return result;
  }

  return { type: "string" };
}

export function generateOpenApiDoc(title: string, version: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const tagNames = new Set<string>();

  for (const def of registry) {
    if (def.tags) def.tags.forEach((t) => tagNames.add(t));
    const pathItem: Record<string, unknown> = paths[def.path] || {};
    const operation: Record<string, unknown> = {
      summary: def.summary || `${def.method.toUpperCase()} ${def.path}`,
      tags: def.tags || [],
      responses: def.responses || { "200": { description: "OK" } },
    };

    if (def.requestBodySchema) {
      (operation as any).requestBody = {
        required: true,
        content: {
          "application/json": { schema: zodToOpenApiSchema(def.requestBodySchema) },
        },
      };
    }

    if (def.querySchema) {
      const qShapeDef = (def.querySchema as any)._def.shape;
      const qShape = typeof qShapeDef === "function" ? qShapeDef() : qShapeDef;
      (operation as any).parameters = Object.entries(qShape).map(([name, fieldSchema]: [string, any]) => ({
        name,
        in: "query",
        required: zodType(fieldSchema) !== "optional" && zodType(fieldSchema) !== "ZodOptional",
        schema: zodToOpenApiSchema(fieldSchema),
      }));
    }

    const baseResponses: Record<string, { description: string; schema?: ZodSchema }> = {};
    if (def.responseSchema) {
      baseResponses["200"] = { description: "OK", schema: def.responseSchema };
    }
    if (def.responses) {
      Object.assign(baseResponses, def.responses);
    }
    if (Object.keys(baseResponses).length === 0) {
      baseResponses["200"] = { description: "OK" };
    }

    const openApiResponses: Record<string, unknown> = {};
    for (const [statusCode, respDef] of Object.entries(baseResponses)) {
      const entry: Record<string, unknown> = { description: respDef.description };
      if (respDef.schema) {
        entry.content = { "application/json": { schema: zodToOpenApiSchema(respDef.schema) } };
      }
      openApiResponses[statusCode] = entry;
    }
    (operation as any).responses = openApiResponses;

    pathItem[def.method] = operation;
    paths[def.path] = pathItem;
  }

  return {
    openapi: "3.0.3",
    info: { title, version },
    tags: [...tagNames].sort().map((name) => ({ name })),
    paths,
  };
}

// ── Swagger UI ────────────────────────────────────────────────────────────

export function setupSwagger(
  app: DocApp,
  opts: { jsonPath?: string; uiPath?: string; title?: string; version?: string } = {}
): void {
  const {
    jsonPath = "/api-docs.json",
    uiPath = "/api-docs",
    title = "API",
    version = "1.0.0",
  } = opts;

  const doc = generateOpenApiDoc(title, version);

  app.get(jsonPath, (_req, res) => res.json(doc));

  app.use(uiPath, swaggerUi.serve, swaggerUi.setup(doc));
}

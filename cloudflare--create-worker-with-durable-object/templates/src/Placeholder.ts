import { DurableObject } from 'cloudflare:workers'

export interface Env {
  PLACEHOLDER: DurableObjectNamespace<Placeholder>
}

/**
 * Placeholder Durable Object. Replace this class (and its wrangler binding /
 * exports entry) with the real DO. SQLite storage is already declared in
 * wrangler.jsonc — `this.ctx.storage` is available if you need it.
 */
export class Placeholder extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const name = url.pathname.split('/').filter(Boolean).pop() ?? 'unnamed'
    return Response.json({ ok: true, name })
  }
}

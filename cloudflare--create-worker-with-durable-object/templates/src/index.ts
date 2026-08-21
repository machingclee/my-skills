import { Hono } from 'hono'
import { Placeholder } from './Placeholder'
import type { Env } from './Placeholder'

// Durable Object classes must be exported from the Worker entrypoint
export { Placeholder }

type AppEnv = {
  Bindings: Env
}

const app = new Hono<AppEnv>()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// Named stub — one Durable Object instance per `name`.
app.get('/do/:name', (c) => {
  const name = c.req.param('name')
  if (!name) {
    return c.json({ success: false, errorMessage: 'name is required' }, 400)
  }

  const stub = c.env.PLACEHOLDER.getByName(name)
  return stub.fetch(c.req.raw)
})

export default app

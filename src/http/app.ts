import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'

import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { render } from '../mail/render.js'
import { enqueue, pending } from '../queue.js'

import { parseNotification } from './validate.js'

/**
 * Service-to-service auth: a shared bearer token.
 *
 * **No CORS, deliberately.** Nothing in a browser should ever call this — the callers
 * are `momoto-core` and the operator scripts, server-side, holding a secret that must
 * not be shipped to a page. Leaving CORS off means a browser can't reach it even if
 * the key leaks into frontend code by mistake.
 */
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!env.apiKey) return next() // Unset: local development only — see config/env.ts.

  const header = req.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  // Length-independent comparison isn't warranted here (the secret is high-entropy and
  // the endpoint is rate-limited by its own network position), but a plain mismatch
  // must not say *why* it failed.
  if (presented !== env.apiKey) {
    logger.warn('notify.unauthorized', { ip: req.ip })
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  next()
}

export function createApp(): Express {
  const app = express()

  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1))
  app.use(helmet({ contentSecurityPolicy: false }))
  // Invite bodies carry a rendered password and a display name; 64kb is ample.
  app.use(express.json({ limit: '64kb' }))

  /**
   * Liveness, on both the conventional path and the root.
   *
   * `/` answers too because platform healthchecks default to it, and a service that
   * 404s its own root gets marked unhealthy and killed — a restart loop that only ever
   * appears in production, since nothing healthchecks a process on your laptop. Making
   * the root respond removes the dependency on someone remembering to configure a
   * healthcheck path.
   *
   * Deliberately unauthenticated and deliberately dull: uptime and queue depth, never
   * anything about who has been mailed.
   */
  const health = (_req: Request, res: Response): void => {
    res.json({ status: 'ok', uptime: process.uptime(), pending: pending() })
  }
  app.get('/', health)
  app.get('/healthz', health)

  // ── POST /notifications ─── accept one message for delivery ────────────────
  //
  // Answers 202, never 200: nothing has been delivered when this returns. The caller
  // is a request handler whose own work already succeeded, so it must not be made to
  // wait on SMTP — and must not fail if the mailbox is down.
  app.post('/notifications', requireApiKey, (req, res) => {
    const parsed = parseNotification(req.body)
    if (typeof parsed === 'string') {
      logger.warn('notify.invalid_request', { reason: parsed })
      res.status(400).json({ error: 'invalid_request', detail: parsed })
      return
    }
    res.status(202).json({ id: enqueue(parsed) })
  })

  // ── POST /notifications/preview ─── render without sending ─────────────────
  //
  // Exists for `send:invites --dry-run`, which has always let an operator eyeball the
  // real thing before mailing 50 people. With the templates living here, that check
  // has to happen here too.
  app.post('/notifications/preview', requireApiKey, (req, res) => {
    const parsed = parseNotification(req.body)
    if (typeof parsed === 'string') {
      res.status(400).json({ error: 'invalid_request', detail: parsed })
      return
    }
    res.json(render(parsed))
  })

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' })
  })

  // Four parameters is what marks this as Express's error handler — the unused
  // `next` is load-bearing, so it is disabled rather than removed.
  app.use(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('notify.unhandled', { err: err instanceof Error ? err.message : String(err) })
      res.status(500).json({ error: 'internal_error' })
    },
  )

  return app
}

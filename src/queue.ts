import { randomUUID } from 'node:crypto'

import { env } from './config/env.js'
import { logger } from './lib/logger.js'
import { deliver } from './mail/transport.js'
import { render } from './mail/render.js'
import type { NotificationRequest } from './types.js'

/**
 * A single-consumer send queue with retries.
 *
 * **Why a queue at all.** The callers are request handlers whose real work has
 * already succeeded — the account exists, the token is minted — so they must not wait
 * on SMTP or fail because of it. Accepting here and sending on our own schedule also
 * paces the wave: shared mailboxes throttle per hour, and a 50-invite burst is
 * exactly the shape that gets a sender rate-limited.
 *
 * **What this deliberately is not.** The queue is in memory. A crash or a redeploy
 * drops whatever hasn't gone out, and there is no record of what was sent. That is an
 * acceptable trade for mail that is always re-requestable — every message here has a
 * "send it again" path (Resend in Profile, ask for another reset link, re-run the
 * invite script, which skips anyone already in its sent log). The upgrade, when
 * delivery has to be auditable, is a table with the same shape as `Job` below plus a
 * status column; nothing about the API changes.
 */
interface Job {
  id: string
  request: NotificationRequest
  attempts: number
  /** Earliest time this job may be tried again. */
  readyAt: number
}

const queue: Job[] = []
let running = false

/** Accepts a message for delivery and returns its id. Never blocks on SMTP. */
export function enqueue(request: NotificationRequest): string {
  const id = randomUUID()
  queue.push({ id, request, attempts: 0, readyAt: Date.now() })
  logger.info('notify.queued', { id, type: request.type, queued: queue.length })
  void drain()
  return id
}

/** How many messages are waiting. Surfaced on `/healthz` for a cheap liveness signal. */
export function pending(): number {
  return queue.length
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Sends what's due, one at a time. Re-entrant by design: `enqueue` calls it on every
 * push, and the `running` flag means the extra calls are no-ops rather than parallel
 * consumers racing for the same job.
 */
async function drain(): Promise<void> {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const now = Date.now()
      const index = queue.findIndex((job) => job.readyAt <= now)
      // Everything left is waiting out a retry backoff — stop, and let the timer
      // scheduled below wake us.
      if (index === -1) break

      const [job] = queue.splice(index, 1)
      if (!job) continue
      job.attempts += 1

      try {
        await deliver(job.request.to, render(job.request))
        logger.info('notify.sent', { id: job.id, type: job.request.type, attempts: job.attempts })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (job.attempts >= env.maxAttempts) {
          // Given up on. Logged loudly with the type and recipient, because at this
          // point a human is the only remaining retry mechanism.
          logger.error('notify.failed', {
            id: job.id,
            type: job.request.type,
            to: job.request.to,
            attempts: job.attempts,
            err: message,
          })
        } else {
          job.readyAt = Date.now() + env.retryDelayMs * job.attempts
          queue.push(job)
          logger.warn('notify.retrying', {
            id: job.id,
            type: job.request.type,
            attempts: job.attempts,
            err: message,
          })
        }
      }

      if (queue.length > 0) await sleep(env.sendIntervalMs)
    }
  } finally {
    running = false
    // Something is waiting on a backoff — make sure we come back for it even if no
    // new message arrives to trigger a drain.
    if (queue.length > 0) {
      const soonest = Math.min(...queue.map((job) => job.readyAt))
      setTimeout(() => void drain(), Math.max(0, soonest - Date.now())).unref()
    }
  }
}

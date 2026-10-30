import { randomUUID } from 'node:crypto'

import { env } from './config/env.js'
import { logger } from './lib/logger.js'
import { deliver } from './mail/transport.js'
import { render } from './mail/render.js'
import type { NotificationRequest, NotificationType } from './types.js'

/**
 * A single-consumer send queue with retries, in two lanes.
 *
 * **Why a queue at all.** The callers are request handlers whose real work has
 * already succeeded — the account exists, the token is minted — so they must not wait
 * on SMTP or fail because of it. Accepting here and sending on our own schedule also
 * paces bursts: shared mailboxes throttle per hour, and a burst is exactly the
 * shape that gets a sender rate-limited.
 *
 * **Why two lanes.** Some mail is only useful for minutes: a reset link that expires
 * in 30 can't sit behind an hour of receipts. `urgent` is always
 * drained first; `bulk` goes out when `urgent` has nothing ready. Each lane has its
 * own cap, so a flood of bulk mail can never stop a reset link from being accepted.
 *
 * **What this deliberately is not.** The queue is in memory. A redeploy sends what it
 * can first (`flush`), but a crash drops whatever hasn't gone out, and there is no
 * record of what was sent. That is an
 * acceptable trade for mail that is re-requestable — Resend in Profile, ask for
 * another reset link. **The payment receipt and refund confirmation are the exception**:
 * nothing re-sends them, so one lost here is lost for good. The upgrade, when delivery has to be auditable, is a
 * table with the same shape as `Job` below plus a status column; nothing about the
 * API changes.
 */
export type Lane = 'urgent' | 'bulk'

/** Exhaustive by construction: a new type has to be placed in a lane to compile. */
const LANE: Record<NotificationType, Lane> = {
  verify_email: 'urgent',
  password_reset: 'urgent',
  // A security notice — the reader may be someone whose account was just taken over.
  password_changed: 'urgent',
  payment_receipt: 'bulk',
  refund_confirmation: 'bulk',
}

interface Job {
  id: string
  request: NotificationRequest
  attempts: number
  /** Earliest time this job may be tried again. */
  readyAt: number
}

/** Drain order is the key order: `urgent` first. */
const lanes: Record<Lane, Job[]> = { urgent: [], bulk: [] }
let running = false
/**
 * The job being sent right now. It is out of its lane while SMTP has it, so `pending()`
 * doesn't count it — `flush` has to, or it would exit mid-send and lose it.
 */
let inFlight: Job | null = null
/** Set by `flush`: the process is going away, so retry backoffs are no longer waited out. */
let stopping = false

export function laneOf(type: NotificationType): Lane {
  return LANE[type]
}

/**
 * Accepts a message for delivery and returns its id, or `null` when its lane is full.
 * Never blocks on SMTP.
 *
 * Full means we are far enough behind that accepting more would only queue mail to
 * be delivered too late to matter — and grow memory without bound. Refusing tells the
 * caller, who logs it, instead of a 202 that quietly means "eventually, maybe".
 */
export function enqueue(request: NotificationRequest): string | null {
  const lane = laneOf(request.type)
  const jobs = lanes[lane]
  if (jobs.length >= env.maxQueued) {
    logger.error('notify.queue_full', { type: request.type, lane, queued: jobs.length })
    return null
  }

  const id = randomUUID()
  jobs.push({ id, request, attempts: 0, readyAt: Date.now() })
  logger.info('notify.queued', { id, type: request.type, lane, queued: jobs.length })
  void drain()
  return id
}

/** How many messages are waiting. Surfaced on `/healthz` for a cheap liveness signal. */
export function pending(): number {
  return lanes.urgent.length + lanes.bulk.length
}

/** Per-lane depth, for `/healthz` — a backlog in `bulk` alone is not an emergency. */
export function pendingByLane(): Record<Lane, number> {
  return { urgent: lanes.urgent.length, bulk: lanes.bulk.length }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Removes and returns the next job that is due, urgent lane first. */
function takeReady(now: number): Job | undefined {
  for (const jobs of Object.values(lanes)) {
    const index = jobs.findIndex((job) => job.readyAt <= now)
    if (index !== -1) return jobs.splice(index, 1)[0]
  }
  return undefined
}

/**
 * The earliest `readyAt` of anything queued, or null when empty.
 *
 * A loop, not `Math.min(...jobs)`: spreading an array into arguments overflows the
 * stack somewhere past 100k elements, and this runs from a `finally` in an un-awaited
 * promise — the throw would crash the process and drop the whole backlog with it.
 */
function soonestReadyAt(): number | null {
  let soonest: number | null = null
  for (const jobs of Object.values(lanes)) {
    for (const job of jobs) {
      if (soonest === null || job.readyAt < soonest) soonest = job.readyAt
    }
  }
  return soonest
}

/**
 * Sends what's due, one at a time. Re-entrant by design: `enqueue` calls it on every
 * push, and the `running` flag means the extra calls are no-ops rather than parallel
 * consumers racing for the same job.
 */
async function drain(): Promise<void> {
  if (running) return
  running = true
  try {
    while (pending() > 0) {
      // Everything left is waiting out a retry backoff — stop, and let the timer
      // scheduled below wake us.
      const job = takeReady(Date.now())
      if (!job) break
      job.attempts += 1
      const lane = laneOf(job.request.type)

      inFlight = job
      try {
        await deliver(job.request.to, render(job.request))
        logger.info('notify.sent', {
          id: job.id,
          type: job.request.type,
          lane,
          attempts: job.attempts,
        })
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
          // Back into its own lane even if that lane has since filled: it was already
          // accepted, and dropping it here would be a silent loss the cap exists to avoid.
          // While stopping there is no "later" to back off to — try again straight away,
          // still bounded by `maxAttempts`.
          job.readyAt = stopping ? Date.now() : Date.now() + env.retryDelayMs * job.attempts
          lanes[lane].push(job)
          logger.warn('notify.retrying', {
            id: job.id,
            type: job.request.type,
            attempts: job.attempts,
            err: message,
          })
        }
      } finally {
        inFlight = null
      }

      if (pending() > 0) await sleep(env.sendIntervalMs)
    }
  } finally {
    running = false
    // Something is waiting on a backoff — make sure we come back for it even if no
    // new message arrives to trigger a drain.
    const soonest = soonestReadyAt()
    if (soonest !== null) {
      setTimeout(() => void drain(), Math.max(0, soonest - Date.now())).unref()
    }
  }
}

/**
 * Sends what's left before the process exits, until the queue is empty and nothing is
 * mid-send, or `deadline` passes. Returns how many messages were left unsent.
 *
 * Called on SIGTERM. Anything waiting out a retry backoff is made due now — the backoff
 * assumed we'd still be here later. What is still queued at the deadline is logged one
 * line per message, recipient included, like `notify.failed`: a human is the only
 * retry left for it.
 */
export async function flush(deadline: number): Promise<number> {
  stopping = true
  const now = Date.now()
  for (const jobs of Object.values(lanes)) {
    for (const job of jobs) job.readyAt = Math.min(job.readyAt, now)
  }
  void drain()
  while ((pending() > 0 || inFlight) && Date.now() < deadline) await sleep(50)

  // Cut off mid-send: it may or may not have gone out, and nobody will find out which.
  if (inFlight) {
    logger.error('notify.interrupted', {
      id: inFlight.id,
      type: inFlight.request.type,
      to: inFlight.request.to,
      attempts: inFlight.attempts,
    })
  }
  for (const jobs of Object.values(lanes)) {
    for (const job of jobs) {
      logger.error('notify.dropped', {
        id: job.id,
        type: job.request.type,
        to: job.request.to,
        attempts: job.attempts,
      })
    }
  }
  return pending() + (inFlight ? 1 : 0)
}

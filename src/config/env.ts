import 'dotenv/config'

import { logger } from '../lib/logger.js'

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  /** Full `From` header, e.g. `Momoto <noreply@momotoldr.com>`. */
  from: string
  /** Optional `Reply-To`, so `From` can be a no-reply while replies still land. */
  replyTo: string | null
  /**
   * IP family to dial the mail host on: 4, 6, or 0 for "whatever DNS returns first".
   *
   * Defaults to **4**, and that default is load-bearing on most PaaS hosts. Mail
   * providers behind Cloudflare publish an AAAA record, Node tries it first, and a
   * container with no public IPv6 route answers `ENETUNREACH` — a failure that reads
   * like the mail server being down when it is nothing of the sort. Railway is exactly
   * this shape: IPv6 internally, IPv4-only egress.
   */
  ipFamily: 0 | 4 | 6
  /**
   * How long to wait for the TCP connection before giving up, in ms.
   *
   * Nodemailer's default is two minutes, which is the wrong shape for the failure
   * that actually happens on a PaaS host: an outbound SMTP port that is *blocked*
   * doesn't refuse the connection, it silently drops the packets. With the default
   * you wait two minutes per attempt to learn nothing, three times over. Failing in
   * ten seconds tells you the same thing and puts it in the log while you're looking.
   */
  connectionTimeoutMs: number
}

export interface Env {
  port: number
  /**
   * Shared secret every caller must present as `Authorization: Bearer …`.
   *
   * Not optional in any deployment that can be reached over a network: an open send
   * endpoint is a spam relay and a phishing kit that signs its mail with your domain's
   * reputation. Unset is allowed only to keep local development frictionless, and the
   * service says so loudly at boot.
   */
  apiKey: string | null
  /** SMTP, or null — with none configured the service logs what it would have sent. */
  smtp: SmtpConfig | null
  /** How many times a failed send is retried before it's given up on. */
  maxAttempts: number
  /** Base delay between retries; grows linearly with the attempt number. */
  retryDelayMs: number
  /** Pause between consecutive sends. Shared mailboxes throttle per hour. */
  sendIntervalMs: number
}

function positiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${name}: "${raw}" (expected a positive integer)`)
  }
  return n
}

function requiredSecret(name: string, raw: string | undefined): string {
  const value = raw?.trim()
  if (!value) throw new Error(`Missing ${name}: set it in the environment (see .env.example).`)
  return value
}

/**
 * All-or-nothing, mirroring how `momoto-core` reads its own optional integrations: the
 * host alone decides whether mail is configured, so a half-filled config fails at
 * boot instead of silently never sending.
 */
function parseSmtp(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim()
  if (!host) return null

  const user = requiredSecret('SMTP_USER', process.env.SMTP_USER)
  const from = process.env.SMTP_FROM?.trim() || `Momoto <${user}>`
  // A bare display name ("Momoto Team") produces a From header with no sender, which
  // SMTP accepts and the recipient's provider quietly discards.
  if (!from.includes('@')) {
    throw new Error(`Invalid SMTP_FROM: "${from}" (must contain a real address).`)
  }

  const rawFamily = process.env.SMTP_IP_FAMILY?.trim() || '4'
  if (!['0', '4', '6'].includes(rawFamily)) {
    throw new Error(`Invalid SMTP_IP_FAMILY: "${rawFamily}" (expected 4, 6, or 0 for auto).`)
  }

  return {
    host,
    port: positiveInt('SMTP_PORT', process.env.SMTP_PORT, 465),
    user,
    pass: requiredSecret('SMTP_PASS', process.env.SMTP_PASS),
    from,
    replyTo: process.env.SMTP_REPLY_TO?.trim() || null,
    ipFamily: Number(rawFamily) as 0 | 4 | 6,
    connectionTimeoutMs: positiveInt(
      'SMTP_CONNECTION_TIMEOUT_MS',
      process.env.SMTP_CONNECTION_TIMEOUT_MS,
      10_000,
    ),
  }
}

const apiKey = process.env.NOTIFY_API_KEY?.trim() || null
if (!apiKey) {
  logger.warn('config.auth.open', {
    msg: 'NOTIFY_API_KEY is unset — every caller is accepted. Never deploy this way.',
  })
}

export const env: Env = {
  port: positiveInt('PORT', process.env.PORT, 3002),
  apiKey,
  smtp: parseSmtp(),
  maxAttempts: positiveInt('NOTIFY_MAX_ATTEMPTS', process.env.NOTIFY_MAX_ATTEMPTS, 3),
  retryDelayMs: positiveInt('NOTIFY_RETRY_DELAY_MS', process.env.NOTIFY_RETRY_DELAY_MS, 30_000),
  sendIntervalMs: positiveInt(
    'NOTIFY_SEND_INTERVAL_MS',
    process.env.NOTIFY_SEND_INTERVAL_MS,
    1_000,
  ),
}

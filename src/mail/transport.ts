import nodemailer, { type Transporter } from 'nodemailer'

import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import type { RenderedMail } from '../types.js'

/**
 * The one SMTP connection in the system.
 *
 * Built on first use rather than at import, so a bad password surfaces on the first
 * send instead of taking the whole service down at boot over a mailbox that may not
 * be needed for hours.
 */
let transport: Transporter | null = null

function getTransport(): Transporter | null {
  if (!env.smtp) return null
  transport ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
    // Pin the IP family — see `SmtpConfig.ipFamily`. Without this, a mail host with an
    // AAAA record gets dialled over IPv6 from a container that has no public IPv6
    // route, and every send fails with ENETUNREACH.
    ...(env.smtp.ipFamily ? { family: env.smtp.ipFamily } : {}),
    // See `SmtpConfig.connectionTimeoutMs`. The greeting timeout matters too: a
    // proxy that accepts the TCP connection but never speaks SMTP would otherwise
    // hold the socket for nodemailer's default 30s on top of everything else.
    connectionTimeout: env.smtp.connectionTimeoutMs,
    greetingTimeout: env.smtp.connectionTimeoutMs,
  })
  return transport
}

/**
 * Delivers one message. **Throws on failure** — unlike the fire-and-forget helper
 * this replaced in `momoto-core`, the caller here is the queue, whose entire job is to
 * notice a failure and try again.
 */
export async function deliver(to: string, mail: RenderedMail): Promise<void> {
  const smtp = env.smtp
  const tx = getTransport()

  // No SMTP configured — the local-development path. Print the body so links are
  // clickable straight from the terminal; without it, every local test of
  // verification or reset would need a real mailbox.
  //
  // This logs the recipient and any token-bearing link, which is exactly the PII the
  // logger warns off. That is the trade, and it only happens when no transport
  // exists, which is never true in a deployed environment.
  if (!smtp || !tx) {
    logger.info('mail.unsent_no_smtp', { to, subject: mail.subject, text: mail.text })
    return
  }

  await tx.sendMail({
    from: smtp.from,
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    ...(smtp.replyTo ? { replyTo: smtp.replyTo } : {}),
  })
  // Deliberately not logging the address on the success path: a delivered mail is
  // routine, and the log is not the place to accumulate a list of user emails.
  logger.info('mail.sent', { subject: mail.subject })
}

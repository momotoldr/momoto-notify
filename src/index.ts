import { env } from './config/env.js'
import { createApp } from './http/app.js'
import { logger } from './lib/logger.js'
import { pending } from './queue.js'

const server = createApp().listen(env.port, () => {
  logger.info('notify.listening', {
    port: env.port,
    smtp: env.smtp ? `${env.smtp.host}:${env.smtp.port}` : 'none (logging only)',
    // Surfaced because getting this wrong presents as the mail host being down.
    ...(env.smtp ? { smtpIpFamily: env.smtp.ipFamily || 'auto' } : {}),
    authenticated: Boolean(env.apiKey),
  })
})

/**
 * How long to let in-flight requests finish before exiting anyway.
 *
 * `server.close()` waits for every open connection, and a keep-alive socket that
 * nobody is using will happily hold it open past the platform's grace period — at
 * which point the process is SIGKILLed and a clean stop is reported as a failed one.
 */
const SHUTDOWN_GRACE_MS = 5_000

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info('notify.shutdown', { signal, pending: pending() })
    // Anything still queued is lost — see the note in `queue.ts` about why that is an
    // acceptable trade for mail that is always re-requestable.
    server.close(() => process.exit(0))
    setTimeout(() => {
      logger.warn('notify.shutdown.forced', { afterMs: SHUTDOWN_GRACE_MS })
      process.exit(0)
    }, SHUTDOWN_GRACE_MS).unref()
  })
}

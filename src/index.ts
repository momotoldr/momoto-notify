import { env } from './config/env.js'
import { createApp } from './http/app.js'
import { logger } from './lib/logger.js'
import { closeTransport } from './mail/transport.js'
import { flush, pending, pendingByLane } from './queue.js'

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
 * Shutdown sends what's queued before exiting, instead of dropping it.
 *
 * `server.close()` stops new connections at once, so a caller that arrives now is
 * refused and retries against the new instance (momoto-core retries a refused
 * connection once). Meanwhile the queue keeps draining, urgent lane first, for up to
 * `NOTIFY_SHUTDOWN_GRACE_MS`.
 *
 * We exit when the queue is empty or the grace runs out, never on `server.close`'s
 * callback: a keep-alive socket nobody is using would hold that open past the
 * platform's kill deadline.
 *
 * **On Railway this only runs if node is PID 1** — start command `node dist/index.js`,
 * not `npm start`, whose npm process swallows SIGTERM — and only with
 * `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` above the grace. See README.
 */
let shuttingDown = false

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    // A second Ctrl-C means "now", for local development.
    if (shuttingDown) process.exit(1)
    shuttingDown = true

    logger.info('notify.shutdown', { signal, pending: pending(), lanes: pendingByLane() })
    server.close()
    void flush(Date.now() + env.shutdownGraceMs).then((left) => {
      closeTransport()
      if (left === 0) logger.info('notify.shutdown.drained')
      else logger.warn('notify.shutdown.dropped', { left, afterMs: env.shutdownGraceMs })
      process.exit(0)
    })
  })
}

# momoto-notify

The one place any outbound email is rendered and sent.

Before this existed, `momoto-core` sent mail in-process and an operator script ran a
second transport of its own: two copies of the SMTP config, two places to change a
footer, and no shared retry or pacing.

## What it does

- Owns the SMTP credentials. **No other service has them.**
- Owns every template: address verification, password reset, password-changed notice,
  and the payment receipt.
- Accepts a message, answers `202` immediately, and sends on its own schedule with
  retries and a pause between sends, over one pooled SMTP connection.
- Two lanes: `urgent` (verification, reset, password-changed) always goes before
  `bulk` (payment receipts). Each lane holds at most `NOTIFY_MAX_QUEUED`
  messages; past that, new ones are refused with `503 queue_full`.

## What it deliberately does not do

- **No CORS, ever.** Nothing in a browser should call this. The callers are servers
  holding a secret that must never reach a page.
- **No persistence.** The queue is in memory. A redeploy sends what's queued first
  (up to `NOTIFY_SHUTDOWN_GRACE_MS`, see *Deploying* below), but a crash drops whatever
  hasn't gone out. That is an acceptable trade for mail that is re-requestable —
  Resend in Profile, ask for another reset link. **Payment receipts are not**: nothing re-sends
  one, so a receipt queued during a redeploy is lost. When delivery has to be auditable,
  add a table with the shape of `Job` in `src/queue.ts` plus a status column; the HTTP
  API doesn't change.
- **No knowledge of frontend routes.** Callers pass finished URLs. A confirmation link
  living at `/verify-email` is the app's routing, and duplicating it here would mean a
  route change had to ship in two places.

## API

Every route needs `Authorization: Bearer $NOTIFY_API_KEY`.

    POST /notifications          → 202 { id }   queue one message (503 queue_full when its lane is full)
    POST /notifications/preview  → 200 { subject, text, html }   render without sending
    GET  /healthz                → 200 { status, uptime, pending, lanes: { urgent, bulk } }

Body:

```json
{
  "type": "verify_email",
  "to": "someone@example.com",
  "lang": "en",
  "data": { "url": "https://momotoldr.com/verify-email?token=…", "expiresInHours": 24 }
}
```

Types and their `data`:

| type | data |
| --- | --- |
| `verify_email` | `url`, `expiresInHours` |
| `password_reset` | `url`, `expiresInMinutes` |
| `password_changed` | `resetUrl` |
| `payment_receipt` | `orderId`, `grossAmount`, `paidAt`, `method`, `stripCount`, `scrapbookTitles` |

## A note on what crosses the wire

The verification and reset links carry **single-use credentials**. Run this service on a private network, or over HTTPS if it
is reachable publicly — and never point `NOTIFY_URL` at a plain-HTTP host you don't
control the whole path to.

## Templates

All TypeScript in `src/mail/templates/`, sharing one layout (`src/mail/layout.ts`)
rather than drifting apart. `POST /notifications/preview` renders any of them without
sending.

## Deploying

On SIGTERM the service stops accepting connections and keeps sending what's queued —
urgent lane first, retry backoffs skipped — until the queue is empty or
`NOTIFY_SHUTDOWN_GRACE_MS` (default 25 s) passes. On Railway that needs:

- Start command `node dist/index.js`, **not** `npm start` (npm swallows SIGTERM).
- `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30` — the default 0 kills the process at once.
- `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=10` — callers refused by the old instance retry
  against the new one (`momoto-core` retries a refused connection once).

Logs: `notify.shutdown` → `notify.shutdown.drained`, or `notify.dropped` per message
left at the deadline.

## Running it

    npm install
    npm run dev      # tsx watch, port 3002

With no `SMTP_HOST` set it logs each message instead of sending, so local development
needs no mailbox. `momoto-core` behaves the same way when `NOTIFY_URL` is unset, so you
only need this process running when you actually want mail to move.

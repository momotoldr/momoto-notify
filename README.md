# momoto-notify

The one place any outbound email is rendered and sent.

Before this existed, sending was spread across two transports and two template
systems: `momoto-core` had an in-process nodemailer client for verification and reset
mail, and `scripts/sendInvites.ts` built a second transport of its own to mail the
beta invitations from hand-edited HTML at the repo root. Two copies of the SMTP
config, two places to change a footer, and no shared retry or pacing.

## What it does

- Owns the SMTP credentials. **No other service has them.**
- Owns every template: address verification, password reset, password-changed notice,
  and the beta invitation.
- Accepts a message, answers `202` immediately, and sends on its own schedule with
  retries and a pause between sends.

## What it deliberately does not do

- **No CORS, ever.** Nothing in a browser should call this. The callers are servers
  holding a secret that must never reach a page.
- **No persistence.** The queue is in memory: a crash or redeploy drops whatever
  hasn't gone out. That is an acceptable trade because every message here is
  re-requestable — Resend in Profile, ask for another reset link, re-run the invite
  script (it skips anyone already in its sent log). When delivery has to be auditable,
  add a table with the shape of `Job` in `src/queue.ts` plus a status column; the HTTP
  API doesn't change.
- **No knowledge of frontend routes.** Callers pass finished URLs. A confirmation link
  living at `/verify-email` is the app's routing, and duplicating it here would mean a
  route change had to ship in two places.

## API

Every route needs `Authorization: Bearer $NOTIFY_API_KEY`.

    POST /notifications          → 202 { id }   queue one message
    POST /notifications/preview  → 200 { subject, text, html }   render without sending
    GET  /healthz                → 200 { status, uptime, pending }

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
| `beta_invite` | `displayName`, `username`, `password` |

## A note on what crosses the wire

`beta_invite` carries a **plaintext password**, and the two link types carry
**single-use credentials**. Run this service on a private network, or over HTTPS if it
is reachable publicly — and never point `NOTIFY_URL` at a plain-HTTP host you don't
control the whole path to.

## Templates

The transactional ones are TypeScript in `src/mail/templates/` — short, generated,
better off sharing a layout than drifting apart.

The beta invitation is **files** in `templates/` (`beta-invite-email-{en,id}.{html,txt}`),
because it is hand-designed table-layout email HTML that an operator edits and previews
before each wave. `send:invites --dry-run` renders it through `/notifications/preview`,
so the preview is the real thing rather than a copy.

Placeholders: `{{DISPLAY_NAME}}`, `{{USERNAME}}`, `{{PASSWORD}}`.

## Running it

    npm install
    npm run dev      # tsx watch, port 3002

With no `SMTP_HOST` set it logs each message instead of sending, so local development
needs no mailbox. `momoto-core` behaves the same way when `NOTIFY_URL` is unset, so you
only need this process running when you actually want mail to move.

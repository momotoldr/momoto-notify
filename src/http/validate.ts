import type { NotificationRequest, NotificationType } from '../types.js'

/**
 * Validates an untrusted body into a `NotificationRequest`.
 *
 * Every field is checked rather than cast. The service holds the credentials that can
 * send mail as Momoto, so a caller — even an authenticated one — must not be able to
 * steer the template or the recipient into a shape the renderer didn't expect.
 */
const TYPES = new Set<NotificationType>([
  'verify_email',
  'password_reset',
  'password_changed',
  'beta_invite',
  'booth_reminder',
])

/** Loose on purpose, mirroring the backend's own check. Delivery is the real test. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL = 254

function str(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}

function url(value: unknown): string | null {
  const raw = str(value, 2000)
  if (!raw) return null
  // Only http(s). A `javascript:` or `data:` link rendered into an email we sign with
  // our own domain would be a phishing payload wearing our reputation.
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? raw : null
  } catch {
    return null
  }
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** Returns the parsed request, or an error string naming what was wrong. */
export function parseNotification(body: unknown): NotificationRequest | string {
  if (typeof body !== 'object' || body === null) return 'body must be an object'
  const raw = body as Record<string, unknown>

  const type = raw.type as NotificationType
  if (!TYPES.has(type)) return `unknown type: ${String(raw.type)}`

  const to = str(raw.to, MAX_EMAIL)
  if (!to || !EMAIL_RE.test(to)) return 'invalid "to" address'

  const lang = raw.lang === 'id' ? 'id' : 'en'
  const data = (typeof raw.data === 'object' && raw.data !== null ? raw.data : {}) as Record<
    string,
    unknown
  >

  switch (type) {
    case 'verify_email': {
      const link = url(data.url)
      if (!link) return 'verify_email needs a http(s) "data.url"'
      return { type, to, lang, data: { url: link, expiresInHours: positive(data.expiresInHours, 24) } }
    }
    case 'password_reset': {
      const link = url(data.url)
      if (!link) return 'password_reset needs a http(s) "data.url"'
      return {
        type,
        to,
        lang,
        data: { url: link, expiresInMinutes: positive(data.expiresInMinutes, 30) },
      }
    }
    case 'password_changed': {
      const link = url(data.resetUrl)
      if (!link) return 'password_changed needs a http(s) "data.resetUrl"'
      return { type, to, lang, data: { resetUrl: link } }
    }
    case 'beta_invite': {
      const displayName = str(data.displayName, 60)
      const username = str(data.username, 20)
      const password = str(data.password, 200)
      if (!displayName || !username || !password) {
        return 'beta_invite needs "data.displayName", "data.username" and "data.password"'
      }

      // The second login is optional, but half of one is not: a username with no
      // password would render a credentials box nobody can use, and the recipient
      // has no way to tell that from a password they mistyped.
      const partnerUsername = str(data.partnerUsername, 20)
      const partnerPassword = str(data.partnerPassword, 200)
      const wantsPartner = data.partnerUsername !== undefined || data.partnerPassword !== undefined
      if (wantsPartner && (!partnerUsername || !partnerPassword)) {
        return 'beta_invite needs both "data.partnerUsername" and "data.partnerPassword", or neither'
      }

      return {
        type,
        to,
        lang,
        data: {
          displayName,
          username,
          password,
          ...(partnerUsername && partnerPassword ? { partnerUsername, partnerPassword } : {}),
        },
      }
    }
    case 'booth_reminder': {
      const displayName = str(data.displayName, 60)
      const link = url(data.url)
      if (!displayName) return 'booth_reminder needs a "data.displayName"'
      if (!link) return 'booth_reminder needs a http(s) "data.url"'
      return { type, to, lang, data: { displayName, url: link } }
    }
  }
}

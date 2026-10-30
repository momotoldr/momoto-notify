import {
  BUNDLE_STRIPS,
  type NotificationRequest,
  type NotificationType,
  type PaymentMethod,
} from '../types.js'

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
  'payment_receipt',
  'refund_confirmation',
])

const PAYMENT_METHODS = new Set<PaymentMethod>(['gopay', 'shopeepay', 'qris'])

/** A cap on listed scrapbooks, matching nothing in particular — it only bounds the mail. */
const MAX_RECEIPT_SCRAPBOOKS = 20

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

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
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
      return {
        type,
        to,
        lang,
        data: { url: link, expiresInHours: positive(data.expiresInHours, 24) },
      }
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
    case 'payment_receipt': {
      const orderId = str(data.orderId, 100)
      const grossAmount = count(data.grossAmount)
      const stripCount = count(data.stripCount)
      const paidAt = str(data.paidAt, 40)
      if (!orderId || !grossAmount || stripCount === null || !paidAt) {
        return 'payment_receipt needs "data.orderId", "data.grossAmount", "data.stripCount" and "data.paidAt"'
      }
      if (Number.isNaN(Date.parse(paidAt))) return 'payment_receipt "data.paidAt" is not a date'

      const rawTitles = Array.isArray(data.scrapbookTitles) ? data.scrapbookTitles : []
      if (rawTitles.length > MAX_RECEIPT_SCRAPBOOKS) {
        return `payment_receipt lists at most ${MAX_RECEIPT_SCRAPBOOKS} scrapbooks`
      }
      // Empty is allowed — a scrapbook nobody titled — and renders as just "Scrapbook".
      if (rawTitles.some((title) => typeof title !== 'string' || title.length > 120)) {
        return 'payment_receipt "data.scrapbookTitles" must be strings of at most 120 characters'
      }
      const scrapbookTitles = (rawTitles as string[]).map((title) => title.trim())
      // A receipt for nothing is a caller bug, not a message worth sending.
      if (stripCount + scrapbookTitles.length === 0) return 'payment_receipt lists no items'

      const method = PAYMENT_METHODS.has(data.method as PaymentMethod)
        ? (data.method as PaymentMethod)
        : null

      // The promos (momoto-fe docs/PLAN-promos.md). Both optional, so a core that predates
      // them still sends a valid receipt; and kept honest — a bundle needs a scrapbook and
      // 3 strips of the order, and buy 1 get 1 needs two of the strips left after them.
      const bundled = Math.min(
        count(data.bundled) ?? 0,
        scrapbookTitles.length,
        Math.floor(stripCount / BUNDLE_STRIPS),
      )
      const bogo = data.bogo === true && stripCount - bundled * BUNDLE_STRIPS >= 2

      return {
        type,
        to,
        lang,
        data: {
          orderId,
          grossAmount,
          paidAt,
          method,
          stripCount,
          scrapbookTitles,
          bogo,
          bundled,
        },
      }
    }
    case 'refund_confirmation': {
      const orderId = str(data.orderId, 100)
      const amount = count(data.amount)
      const refundedAt = str(data.refundedAt, 40)
      if (!orderId || !amount || !refundedAt) {
        return 'refund_confirmation needs "data.orderId", "data.amount" and "data.refundedAt"'
      }
      if (Number.isNaN(Date.parse(refundedAt))) {
        return 'refund_confirmation "data.refundedAt" is not a date'
      }
      const method = PAYMENT_METHODS.has(data.method as PaymentMethod)
        ? (data.method as PaymentMethod)
        : null
      return { type, to, lang, data: { orderId, amount, refundedAt, method } }
    }
  }
}

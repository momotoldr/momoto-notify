/**
 * The wire contract between callers (momoto-core, the operator scripts) and this
 * service. Kept in one file so the backend's client can mirror it exactly.
 *
 * **Callers supply finished links, not tokens-plus-route-knowledge.** A notification
 * service has no business knowing that a verification link lives at `/verify-email`
 * on the frontend — that is the caller's routing, and baking it in here would mean a
 * frontend route change had to be deployed in two places. So payloads carry a `url`
 * the caller already built.
 */

/** Every kind of message this service can send. */
export type NotificationType =
  'verify_email' | 'password_reset' | 'password_changed' | 'payment_receipt'

/** The locales Momoto ships. Anything else is treated as English. */
export type Lang = 'en' | 'id'

export interface VerifyEmailData {
  /** Finished confirmation link. */
  url: string
  /** How long it stays good, for the copy. */
  expiresInHours: number
}

export interface PasswordResetData {
  url: string
  expiresInMinutes: number
}

export interface PasswordChangedData {
  /** Where someone who did NOT make the change should go, right now. */
  resetUrl: string
}

/** The channels a payment can settle on. Mirrors `PAYMENT_METHODS` in momoto-core. */
export type PaymentMethod = 'gopay' | 'shopeepay' | 'qris'

export interface PaymentReceiptData {
  /** Our Midtrans `order_id` — what support asks for when a payment is queried. */
  orderId: string
  /** What was actually charged, in whole rupiah. */
  grossAmount: number
  /** ISO timestamp of settlement. Rendered in Jakarta time. */
  paidAt: string
  /** Null when the channel isn't one we know; the line is then left out. */
  method: PaymentMethod | null
  /**
   * What the order bought. **No per-line prices, deliberately:** the price is read from
   * config when the order is charged, so re-deriving a line price at settlement could
   * disagree with the total if it changed in between. `grossAmount` is the one number
   * that is certainly what was paid.
   */
  stripCount: number
  /** User-entered titles, possibly empty (untitled) — escaped before they reach the HTML. */
  scrapbookTitles: string[]
}

/** A request to send one message to one person. */
export type NotificationRequest =
  | { type: 'verify_email'; to: string; lang?: Lang; data: VerifyEmailData }
  | { type: 'password_reset'; to: string; lang?: Lang; data: PasswordResetData }
  | { type: 'password_changed'; to: string; lang?: Lang; data: PasswordChangedData }
  | { type: 'payment_receipt'; to: string; lang?: Lang; data: PaymentReceiptData }

/** A rendered message, ready for the transport. */
export interface RenderedMail {
  subject: string
  text: string
  html: string
}

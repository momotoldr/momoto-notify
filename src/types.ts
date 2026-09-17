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
  | 'verify_email'
  | 'password_reset'
  | 'password_changed'
  | 'beta_invite'
  | 'booth_reminder'

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

export interface BetaInviteData {
  displayName: string
  username: string
  /** The generated password. See the transport note in `README.md` about this. */
  password: string
  /**
   * A second login, for the partner, in the same message.
   *
   * The beta seeds two accounts per registrant — theirs and one for whoever they
   * shoot with — but only the registrant's address was ever collected, so there is
   * nobody else to mail the second set to. Both go here and the registrant passes
   * one on.
   *
   * Optional, and both fields move together: a recipient with no second account
   * gets the original single-login mail, and the partner section is dropped from
   * the template entirely rather than rendering blank.
   */
  partnerUsername?: string
  partnerPassword?: string
}

export interface BoothReminderData {
  displayName: string
  /** Finished link to the booth. Built by the caller — see the note at the top. */
  url: string
}

/** A request to send one message to one person. */
export type NotificationRequest =
  | { type: 'verify_email'; to: string; lang?: Lang; data: VerifyEmailData }
  | { type: 'password_reset'; to: string; lang?: Lang; data: PasswordResetData }
  | { type: 'password_changed'; to: string; lang?: Lang; data: PasswordChangedData }
  | { type: 'beta_invite'; to: string; lang?: Lang; data: BetaInviteData }
  | { type: 'booth_reminder'; to: string; lang?: Lang; data: BoothReminderData }

/** A rendered message, ready for the transport. */
export interface RenderedMail {
  subject: string
  text: string
  html: string
}

import type { Lang, NotificationRequest, RenderedMail } from '../types.js'

import { betaInvite } from './templates/betaInvite.js'
import { passwordChanged } from './templates/passwordChanged.js'
import { passwordReset } from './templates/passwordReset.js'
import { verifyEmail } from './templates/verifyEmail.js'

/** Anything that isn't a locale we ship falls back to English. */
export function normalizeLang(raw: unknown): Lang {
  return String(raw ?? '').toLowerCase() === 'id' ? 'id' : 'en'
}

/**
 * Turns a request into a finished message. The switch is exhaustive by construction —
 * `NotificationRequest` is a discriminated union, so adding a type without a template
 * fails to compile rather than failing at send time.
 */
export function render(request: NotificationRequest): RenderedMail {
  const lang = normalizeLang(request.lang)
  switch (request.type) {
    case 'verify_email':
      return verifyEmail(request.data, lang)
    case 'password_reset':
      return passwordReset(request.data, lang)
    case 'password_changed':
      return passwordChanged(request.data, lang)
    case 'beta_invite':
      return betaInvite(request.data, lang)
  }
}

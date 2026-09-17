import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BetaInviteData, Lang, RenderedMail } from '../../types.js'

/**
 * The closed-beta invitation.
 *
 * Unlike the other templates, this one is **files on disk** (`templates/`) rather
 * than code: it is hand-designed, table-layout email HTML that an operator edits and
 * previews before each wave, and burying that in a TypeScript string literal would
 * make it unreadable and unopenable in a browser.
 *
 * Resolved relative to this module rather than the working directory, so it keeps
 * working when the service runs from `dist/` under a process manager.
 */
const TEMPLATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../templates')

const SUBJECTS: Record<Lang, string> = {
  en: "You're in the Momoto closed beta",
  id: 'Kamu ikut beta tertutup Momoto',
}

/** Read once per language and kept — these files don't change while the process runs. */
const cache = new Map<Lang, { html: string; text: string }>()

function load(lang: Lang): { html: string; text: string } {
  const cached = cache.get(lang)
  if (cached) return cached

  const read = (ext: 'html' | 'txt'): string =>
    readFileSync(resolve(TEMPLATE_DIR, `beta-invite-email-${lang}.${ext}`), 'utf8')

  // The .txt files open with a "Subject:" (en) / "Subjek:" (id) line for humans
  // copying them by hand. The real subject comes from SUBJECTS, so strip it rather
  // than mailing it as the first line of the body.
  const loaded = {
    html: read('html'),
    text: read('txt').replace(/^Subj(ect|ek):.*\r?\n+/i, ''),
  }
  cache.set(lang, loaded)
  return loaded
}

/**
 * Keeps or drops a `{{#PARTNER}}…{{/PARTNER}}` block.
 *
 * A block marker rather than a template engine: the only conditional these files
 * will ever need is "did this person get a second login", and the alternative —
 * a fifth and sixth copy of a hand-designed HTML email to keep in sync — is worse
 * than four lines of string work.
 */
function section(template: string, keep: boolean): string {
  // The markers sit on their own line in all four files, so each pattern eats its
  // indentation and trailing newline too. Otherwise keeping the block would leave a
  // stray blank line in the plain-text mail, where whitespace is the only layout there is.
  const open = /[^\S\n]*\{\{#PARTNER\}\}\n?/g
  const close = /[^\S\n]*\{\{\/PARTNER\}\}\n?/g
  const block = /[^\S\n]*\{\{#PARTNER\}\}\n?[\s\S]*?[^\S\n]*\{\{\/PARTNER\}\}\n?/g
  return keep ? template.replace(open, '').replace(close, '') : template.replace(block, '')
}

export function betaInvite(data: BetaInviteData, lang: Lang): RenderedMail {
  // Both or neither — `validate.ts` rejects half a pair, and a direct caller that
  // sends one anyway gets the single-login mail rather than an empty box.
  const partner =
    data.partnerUsername && data.partnerPassword
      ? { username: data.partnerUsername, password: data.partnerPassword }
      : null

  const fill = (template: string): string =>
    section(template, partner !== null)
      .replaceAll('{{DISPLAY_NAME}}', data.displayName)
      .replaceAll('{{USERNAME}}', data.username)
      .replaceAll('{{PASSWORD}}', data.password)
      .replaceAll('{{PARTNER_USERNAME}}', partner?.username ?? '')
      .replaceAll('{{PARTNER_PASSWORD}}', partner?.password ?? '')

  const template = load(lang)
  return {
    subject: SUBJECTS[lang],
    text: fill(template.text),
    html: fill(template.html),
  }
}

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BoothReminderData, Lang, RenderedMail } from '../../types.js'

/**
 * The nudge for someone who has an account but has never made a strip.
 *
 * Files on disk (`templates/`) rather than code, for the same reason as
 * `betaInvite`: this is a mail whose *design* is the point, edited and eyeballed in
 * a browser before a wave goes out, and a TypeScript string literal is neither.
 *
 * Resolved relative to this module rather than the working directory, so it keeps
 * working when the service runs from `dist/`.
 */
const TEMPLATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../templates')

const SUBJECTS: Record<Lang, string> = {
  en: 'Your Momoto booth is still waiting',
  id: 'Booth Momoto kamu masih menunggu',
}

/** Read once per language and kept — these files don't change while the process runs. */
const cache = new Map<Lang, { html: string; text: string }>()

function load(lang: Lang): { html: string; text: string } {
  const cached = cache.get(lang)
  if (cached) return cached

  const read = (ext: 'html' | 'txt'): string =>
    readFileSync(resolve(TEMPLATE_DIR, `booth-reminder-email-${lang}.${ext}`), 'utf8')

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
 * Escapes a value before it goes into the HTML body.
 *
 * Unlike every other merge field in this folder, `displayName` here is **typed by the
 * user**, in Profile — the invite's came off an operator's spreadsheet. An ampersand
 * or an angle bracket in a name would otherwise land raw inside markup we sign with
 * our own domain, which at best breaks the layout and at worst smuggles a tag into a
 * message the reader has every reason to trust.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function boothReminder(data: BoothReminderData, lang: Lang): RenderedMail {
  const template = load(lang)

  // The URL is merged raw: `validate.ts` has already restricted it to http(s), and
  // it goes into an `href` where escaping the query separator would break the link.
  const fill = (raw: string, name: string): string =>
    raw.replaceAll('{{DISPLAY_NAME}}', name).replaceAll('{{BOOTH_URL}}', data.url)

  return {
    subject: SUBJECTS[lang],
    text: fill(template.text, data.displayName),
    html: fill(template.html, escapeHtml(data.displayName)),
  }
}

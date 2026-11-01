import { escapeHtml, layout, textLayout } from '../layout.js'
import type { Lang, RenderedMail, SupportReplyData } from '../../types.js'

/**
 * An admin's answer to a help request sent from the app's support button, written in the
 * admin console. The words are the admin's; this only frames them — a subject the
 * customer recognises, and how to keep talking.
 *
 * The customer answers by replying to the mail: `SMTP_REPLY_TO` routes that to the
 * support mailbox, which also gets a blind copy of this (`copySupport`) so the thread is
 * whole there.
 */

interface Copy {
  subject: (ticket: string) => string
  eyebrow: string
  heading: string
  footnote: (ticket: string) => string
}

const COPY: Record<Lang, Copy> = {
  en: {
    subject: (ticket) => `Re: your Momoto support request ${ticket}`,
    eyebrow: 'Support',
    heading: 'About your request',
    footnote: (ticket) =>
      `This is a reply to support request ${ticket}. Reply to this email to keep the conversation going.`,
  },
  id: {
    subject: (ticket) => `Re: permintaan bantuan Momoto ${ticket}`,
    eyebrow: 'Bantuan',
    heading: 'Tentang permintaanmu',
    footnote: (ticket) =>
      `Ini balasan untuk permintaan bantuan ${ticket}. Balas email ini untuk melanjutkan percakapan.`,
  },
}

/** Blank lines split paragraphs; single line breaks stay line breaks. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function toHtml(paragraph: string): string {
  return escapeHtml(paragraph).replaceAll('\n', '<br />')
}

/** The preview line: the reply's opening, on one line. */
function preheader(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim()
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat
}

export function supportReply(data: SupportReplyData, lang: Lang): RenderedMail {
  const copy = COPY[lang]
  const body = paragraphs(data.message)

  return {
    subject: copy.subject(data.ticket),
    text: textLayout(body, null, copy.footnote(data.ticket)),
    html: layout({
      lang,
      preheader: escapeHtml(preheader(data.message)),
      eyebrow: copy.eyebrow,
      heading: copy.heading,
      paragraphs: body.map(toHtml),
      footnote: copy.footnote(escapeHtml(data.ticket)),
    }),
    copySupport: true,
  }
}

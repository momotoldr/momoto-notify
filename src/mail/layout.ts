/**
 * The shared chrome for the transactional emails, matching the beta invitation.
 *
 * The invitation is hand-written HTML in `templates/`; this is the same design
 * expressed as a function, so verification and reset mail arrive looking like they
 * came from the same product rather than from its error handler. Any visual change
 * has to be made in both places — that is the cost of keeping the invitation
 * hand-editable, and it is deliberate.
 *
 * **Built for email clients, not browsers.** Table layout, inline styles, no external
 * CSS or webfonts, 600px wide. The `<style>` block is progressive enhancement only:
 * every rule that matters is also inlined, because Gmail strips `<style>` in some
 * contexts and Outlook ignores much of it.
 */

/** Absolute, because a mail client has no origin to resolve a relative path against. */
const LOGO_URL = 'https://momotoldr.com/logo-momoto.png'
const TERMS_URL = 'https://momotoldr.com/terms'
const PRIVACY_URL = 'https://momotoldr.com/privacy'

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif"

export interface LayoutOptions {
  /** The grey preview line shown next to the subject. Hidden inside the message. */
  preheader: string
  /** Small uppercase label in the brand bar — the invitation's says "Closed beta". */
  eyebrow: string
  heading: string
  /** Body copy. Inline HTML (a `<strong>`) is fine; anything else should be escaped. */
  paragraphs: string[]
  /** The single action. Omitted for mail that asks nothing of the reader. */
  button?: { href: string; label: string }
  /** Tinted box under the body — where the "if this wasn't you" line belongs. */
  callout?: string
  /** Fine print in the footer, above the Terms/Privacy links. */
  footnote: string
  lang: 'en' | 'id'
}

/** The two footer strings that aren't specific to any one message. */
const FOOTER_TAGLINE: Record<'en' | 'id', string> = {
  en: 'Snap, strip, share.',
  id: 'Snap, strip, share.',
}
const FOOTER_LINKS: Record<'en' | 'id', { terms: string; privacy: string }> = {
  en: { terms: 'Terms', privacy: 'Privacy' },
  id: { terms: 'Ketentuan', privacy: 'Privasi' },
}

export function layout(options: LayoutOptions): string {
  const { preheader, eyebrow, heading, paragraphs, button, callout, footnote, lang } = options
  const links = FOOTER_LINKS[lang]

  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0; font-size:15px; line-height:24px; color:#475569;">${p}</p>`,
    )
    .join('')

  const cta = button
    ? `
            <tr>
              <td class="px" align="center" style="padding:12px 44px 8px 44px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="background-color:#0f172a; border-radius:10px;">
                      <a href="${button.href}" style="display:inline-block; padding:14px 34px; font-family:${FONT}; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none;">${button.label}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0 0; font-family:${FONT}; font-size:12px; line-height:18px; color:#94a3b8; word-break:break-all;">${button.href}</p>
              </td>
            </tr>`
    : ''

  const calloutRow = callout
    ? `
            <tr>
              <td class="px" style="padding:20px 44px 8px 44px; font-family:${FONT};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:14px;">
                  <tr>
                    <td style="padding:18px 22px; font-size:14px; line-height:22px; color:#475569;">${callout}</td>
                  </tr>
                </table>
              </td>
            </tr>`
    : ''

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @media only screen and (max-width: 620px) {
        .container { width: 100% !important; }
        .px { padding-left: 24px !important; padding-right: 24px !important; }
        .h1 { font-size: 24px !important; line-height: 32px !important; }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background-color:#f5f4f7; -webkit-font-smoothing:antialiased;">
    <div style="display:none; font-size:1px; color:#f5f4f7; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">${preheader}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f4f7;">
      <tr>
        <td align="center" style="padding:32px 12px;">

          <table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 2px 8px rgba(15,23,42,0.06);">

            <tr>
              <td align="center" style="background:linear-gradient(160deg,#ffe3ec 0%,#fcf7f0 55%,#d9ffea 100%); background-color:#ffe3ec; padding:32px 24px 28px 24px;">
                <img src="${LOGO_URL}" width="56" height="52" alt="Momoto" style="display:block; border:0; width:56px; height:auto; margin:0 auto 12px auto;" />
                <div style="font-family:${FONT}; font-size:11px; font-weight:700; letter-spacing:1.6px; text-transform:uppercase; color:#8a5a68;">${eyebrow}</div>
              </td>
            </tr>

            <tr>
              <td class="px" style="padding:36px 44px 8px 44px; font-family:${FONT};">
                <h1 class="h1" style="margin:0 0 16px 0; font-size:28px; line-height:36px; font-weight:700; color:#0f172a;">${heading}</h1>
                ${body}
              </td>
            </tr>
${cta}${calloutRow}
            <tr>
              <td class="px" style="padding:22px 44px 30px 44px; background-color:#fafafa; border-top:1px solid #eef2f6; font-family:${FONT};">
                <p style="margin:0 0 6px 0; font-size:13px; font-weight:700; color:#334155;">Momoto</p>
                <p style="margin:0 0 12px 0; font-size:12px; line-height:18px; color:#94a3b8;">${FOOTER_TAGLINE[lang]}</p>
                <p style="margin:0; font-size:11px; line-height:18px; color:#a3aab5;">
                  ${footnote}
                  <br />
                  <a href="${TERMS_URL}" style="color:#94a3b8;">${links.terms}</a> ·
                  <a href="${PRIVACY_URL}" style="color:#94a3b8;">${links.privacy}</a>
                </p>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * The plain-text counterpart, in the invitation's shape: body, then an indented
 * block for anything that has to be copied by hand, then the same sign-off.
 *
 * Not an afterthought — some clients render text only, and spam filters treat a
 * message with no text part as a small red flag.
 */
export function textLayout(paragraphs: string[], block: string | null, footnote: string): string {
  const parts = [...paragraphs]
  if (block) parts.push(block)
  parts.push('— Momoto\nSnap, strip, share.')
  parts.push(`${footnote}\n${TERMS_URL} · ${PRIVACY_URL}`)
  return parts.join('\n\n')
}

import { layout, textLayout } from '../layout.js'
import type { Lang, RenderedMail, VerifyEmailData } from '../../types.js'

/**
 * Proves an address belongs to the account.
 *
 * **Copy rules for everything in this folder.** These land in an inbox next to a lot
 * of phishing that looks exactly like them, so: say plainly what the link does, say
 * how long it lasts, and always tell the reader what to do if they didn't ask for it.
 * Never ask for a password or any other secret in reply.
 */
export function verifyEmail(data: VerifyEmailData, lang: Lang): RenderedMail {
  const { url, expiresInHours: hours } = data

  if (lang === 'id') {
    return {
      subject: 'Konfirmasi email Momoto kamu',
      text: textLayout(
        [
          'Halo!',
          `Konfirmasi alamat email ini untuk akun Momoto kamu dengan membuka tautan berikut. Tautannya berlaku ${hours} jam.`,
          'Setelah dikonfirmasi, kamu bisa memulihkan akun lewat email ini kalau lupa kata sandi.',
        ],
        `KONFIRMASI EMAIL KAMU\n  ${url}`,
        'Kalau kamu tidak meminta ini, abaikan saja email ini — tidak ada yang berubah pada akun mana pun.',
      ),
      html: layout({
        lang,
        preheader: 'Satu klik untuk mengonfirmasi alamat email kamu.',
        eyebrow: 'Konfirmasi email',
        heading: 'Konfirmasi email kamu',
        paragraphs: [
          `Konfirmasi alamat ini untuk akun Momoto kamu. Tautannya berlaku <strong>${hours} jam</strong>.`,
          'Setelah dikonfirmasi, kamu bisa memulihkan akun sendiri lewat email ini kalau lupa kata sandi.',
        ],
        button: { href: url, label: 'Konfirmasi email' },
        footnote:
          'Kalau kamu tidak meminta ini, abaikan saja email ini — tidak ada yang berubah pada akun mana pun.',
      }),
    }
  }

  return {
    subject: 'Confirm your Momoto email',
    text: textLayout(
      [
        'Hi!',
        `Confirm this email address for your Momoto account by opening the link below. It's good for ${hours} hours.`,
        'Once confirmed, you can use this address to get back into your account if you forget your password.',
      ],
      `CONFIRM YOUR EMAIL\n  ${url}`,
      "If you didn't ask for this, you can ignore this email — nothing changes on any account.",
    ),
    html: layout({
      lang,
      preheader: 'One click to confirm your email address.',
      eyebrow: 'Confirm email',
      heading: 'Confirm your email',
      paragraphs: [
        `Confirm this address for your Momoto account. The link is good for <strong>${hours} hours</strong>.`,
        'Once confirmed, you can reset your own password with this address if you ever forget it.',
      ],
      button: { href: url, label: 'Confirm email' },
      footnote:
        "If you didn't ask for this, you can ignore this email — nothing changes on any account.",
    }),
  }
}

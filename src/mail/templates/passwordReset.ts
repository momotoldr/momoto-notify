import { layout, textLayout } from '../layout.js'
import type { Lang, PasswordResetData, RenderedMail } from '../../types.js'

/** The recovery credential. Short-lived and single-use — say both. */
export function passwordReset(data: PasswordResetData, lang: Lang): RenderedMail {
  const { url, expiresInMinutes: minutes } = data

  if (lang === 'id') {
    return {
      subject: 'Atur ulang kata sandi Momoto kamu',
      text: textLayout(
        [
          'Halo!',
          `Kami menerima permintaan untuk mengatur ulang kata sandi akun Momoto kamu. Tautan di bawah berlaku ${minutes} menit dan hanya bisa dipakai sekali.`,
        ],
        `ATUR ULANG KATA SANDI\n  ${url}`,
        'Kalau kamu tidak meminta ini, abaikan email ini — kata sandi kamu tidak berubah. Kami tidak akan pernah meminta kata sandi kamu lewat email.',
      ),
      html: layout({
        lang,
        preheader: 'Tautan untuk membuat kata sandi baru, berlaku singkat.',
        eyebrow: 'Keamanan akun',
        heading: 'Atur ulang kata sandi',
        paragraphs: [
          `Ada permintaan untuk mengatur ulang kata sandi akun Momoto kamu. Tautan ini berlaku <strong>${minutes} menit</strong> dan hanya bisa dipakai sekali.`,
        ],
        button: { href: url, label: 'Atur ulang kata sandi' },
        callout:
          'Bukan kamu yang meminta? Abaikan saja email ini — kata sandi kamu tidak berubah sampai tautan di atas dibuka.',
        footnote: 'Kami tidak akan pernah meminta kata sandi kamu lewat email.',
      }),
    }
  }

  return {
    subject: 'Reset your Momoto password',
    text: textLayout(
      [
        'Hi!',
        `Someone asked to reset the password on your Momoto account. The link below is good for ${minutes} minutes and can only be used once.`,
      ],
      `RESET YOUR PASSWORD\n  ${url}`,
      "If you didn't ask for this, you can ignore this email — your password doesn't change. We will never ask you for your password by email.",
    ),
    html: layout({
      lang,
      preheader: 'A link to choose a new password, good for a short while.',
      eyebrow: 'Account security',
      heading: 'Reset your password',
      paragraphs: [
        `Someone asked to reset the password on your Momoto account. This link is good for <strong>${minutes} minutes</strong> and can only be used once.`,
      ],
      button: { href: url, label: 'Reset password' },
      callout:
        "Didn't ask for this? You can ignore this email — your password doesn't change until that link is opened.",
      footnote: 'We will never ask you for your password by email.',
    }),
  }
}

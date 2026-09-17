import { layout, textLayout } from '../layout.js'
import type { Lang, PasswordChangedData, RenderedMail } from '../../types.js'

/**
 * Sent *after* a password changes. Nothing is asked of the reader — this is the mail
 * that tells someone whose account was taken over that it happened, so it has to
 * arrive even though there is no action in it for the legitimate user.
 *
 * The one button is for the person for whom this is bad news, which is why it reads
 * "This wasn't me" rather than anything reassuring.
 */
export function passwordChanged(data: PasswordChangedData, lang: Lang): RenderedMail {
  const href = data.resetUrl

  if (lang === 'id') {
    return {
      subject: 'Kata sandi Momoto kamu sudah diubah',
      text: textLayout(
        [
          'Kata sandi akun Momoto kamu baru saja diubah, dan semua perangkat yang sedang masuk telah dikeluarkan.',
          'Kalau ini kamu, tidak ada yang perlu dilakukan.',
        ],
        `BUKAN KAMU YANG MENGUBAH?\n  Atur ulang kata sandi sekarang:\n  ${href}`,
        'Email ini dikirim otomatis setiap kali kata sandi berubah, demi keamanan akunmu.',
      ),
      html: layout({
        lang,
        preheader: 'Konfirmasi perubahan kata sandi pada akun Momoto kamu.',
        eyebrow: 'Keamanan akun',
        heading: 'Kata sandi kamu sudah diubah',
        paragraphs: [
          'Kata sandi akun Momoto kamu baru saja diubah, dan semua perangkat yang sedang masuk telah dikeluarkan.',
          'Kalau ini kamu, tidak ada yang perlu dilakukan.',
        ],
        button: { href, label: 'Ini bukan saya' },
        callout:
          'Kalau bukan kamu yang mengubahnya, atur ulang kata sandi sekarang lewat tombol di atas — lalu periksa email yang terhubung ke akunmu.',
        footnote: 'Email ini dikirim otomatis setiap kali kata sandi berubah.',
      }),
    }
  }

  return {
    subject: 'Your Momoto password was changed',
    text: textLayout(
      [
        'The password on your Momoto account was just changed, and every signed-in device was signed out.',
        'If that was you, there is nothing to do.',
      ],
      `WASN'T YOU?\n  Reset your password immediately:\n  ${href}`,
      'This email is sent automatically whenever a password changes, to keep your account safe.',
    ),
    html: layout({
      lang,
      preheader: 'Confirming a password change on your Momoto account.',
      eyebrow: 'Account security',
      heading: 'Your password was changed',
      paragraphs: [
        'The password on your Momoto account was just changed, and every signed-in device was signed out.',
        'If that was you, there is nothing to do.',
      ],
      button: { href, label: "This wasn't me" },
      callout:
        "If you didn't make this change, reset your password now using the button above — then check the email address linked to your account.",
      footnote: 'This email is sent automatically whenever a password changes.',
    }),
  }
}

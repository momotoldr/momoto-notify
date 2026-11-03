import { escapeHtml, layout, textLayout } from '../layout.js'
import type { InactiveWarningData, Lang, RenderedMail } from '../../types.js'

/**
 * Sent twice before an account that hasn't been opened in a while is deleted: about two
 * weeks before, then a few days before (momoto-core lib/inactiveAccounts.ts). The only
 * action is to sign in once, which cancels the deletion, so the button is a plain link
 * to the sign-in page and carries no token.
 *
 * No callout listing what goes with the account (removed, user 2026-11-03): the Terms
 * and Privacy Policy cover that purchases are deleted and not refunded. No unsubscribe
 * link: this is a notice about the account, like `password_changed`.
 */
export function inactiveWarning(data: InactiveWarningData, lang: Lang): RenderedMail {
  const href = data.signInUrl
  const username = escapeHtml(data.username)
  const on = formatDeleteOn(data.deleteOn, lang)
  const final = data.daysLeft <= 3

  if (lang === 'id') {
    const when = data.daysLeft === 1 ? 'besok' : `dalam ${data.daysLeft} hari`
    const intro = `Akun Momoto kamu (<strong>${username}</strong>) sudah lama tidak dibuka. Akun ini akan dihapus ${when}, pada <strong>${on}</strong>.`
    const introText = `Akun Momoto kamu (${data.username}) sudah lama tidak dibuka. Akun ini akan dihapus ${when}, pada ${on}.`
    const keep =
      'Mau tetap menyimpannya? Cukup masuk sekali sebelum tanggal itu, dan penghapusannya batal.'
    return {
      subject: final
        ? `Akun Momoto kamu akan dihapus ${when}`
        : 'Akun Momoto kamu akan dihapus karena tidak aktif',
      text: textLayout(
        [introText, keep],
        `MASUK UNTUK MENYIMPAN AKUNMU:\n  ${href}`,
        'Email ini dikirim otomatis ke akun yang tidak dibuka selama 90 hari.',
      ),
      html: layout({
        lang,
        preheader: `Masuk sebelum ${on} untuk menyimpan akunmu.`,
        eyebrow: 'Akun kamu',
        heading: final ? `Akunmu akan dihapus ${when}` : 'Kami rindu kamu di Momoto',
        paragraphs: [intro, keep],
        button: { href, label: 'Masuk ke Momoto' },
        footnote: 'Email ini dikirim otomatis ke akun yang tidak dibuka selama 90 hari.',
      }),
    }
  }

  const when = data.daysLeft === 1 ? 'tomorrow' : `in ${data.daysLeft} days`
  const intro = `Your Momoto account (<strong>${username}</strong>) hasn't been opened in a while. It will be deleted ${when}, on <strong>${on}</strong>.`
  const introText = `Your Momoto account (${data.username}) hasn't been opened in a while. It will be deleted ${when}, on ${on}.`
  const keep = 'Want to keep it? Just sign in once before then, and the deletion is cancelled.'
  return {
    subject: final
      ? `Your Momoto account will be deleted ${when}`
      : 'Your Momoto account will be deleted for inactivity',
    text: textLayout(
      [introText, keep],
      `SIGN IN TO KEEP YOUR ACCOUNT:\n  ${href}`,
      "This email is sent automatically to accounts that haven't been opened in 90 days.",
    ),
    html: layout({
      lang,
      preheader: `Sign in before ${on} to keep your account.`,
      eyebrow: 'Your account',
      heading: final ? `Your account will be deleted ${when}` : 'We miss you at Momoto',
      paragraphs: [intro, keep],
      button: { href, label: 'Sign in to Momoto' },
      footnote: "This email is sent automatically to accounts that haven't been opened in 90 days.",
    }),
  }
}

/** A date, not a time: the job runs hourly, so the exact hour isn't a promise. Jakarta's day. */
function formatDeleteOn(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'long',
  }).format(new Date(iso))
}

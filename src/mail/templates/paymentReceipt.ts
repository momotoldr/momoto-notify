import { escapeHtml, layout, textLayout } from '../layout.js'
import type { Lang, PaymentMethod, PaymentReceiptData, RenderedMail } from '../../types.js'

/**
 * Sent once, when a payment settles — the moment the strips and scrapbooks it covers
 * unlock. It is a confirmation, not an invoice: the reader has already paid and has
 * usually already seen the app flip, so the job is to say what was bought, for how
 * much, and where it now is.
 *
 * The order id is printed because it is the one thing support needs to find a payment,
 * and the footnote says how to query one the reader doesn't recognise.
 */

const METHOD_LABEL: Record<PaymentMethod, string> = {
  gopay: 'GoPay',
  shopeepay: 'ShopeePay',
  qris: 'QRIS',
}

/** Rupiah has no minor unit in practice — "Rp 24.999", not "Rp 24.999,00". */
function formatIdr(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Jakarta time, labelled, because that is where the payer is and where Midtrans is. */
function formatPaidAt(iso: string, lang: Lang): string {
  const formatted = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
  return `${formatted} WIB`
}

interface Copy {
  subject: string
  preheader: string
  eyebrow: string
  heading: string
  intro: string
  where: string
  labels: { order: string; date: string; method: string; items: string; total: string }
  strips: (n: number) => string
  scrapbook: (title: string) => string
  footnote: string
}

const COPY: Record<Lang, Copy> = {
  en: {
    subject: 'Your Momoto payment is complete',
    preheader: 'Payment received — your items are unlocked.',
    eyebrow: 'Payment receipt',
    heading: 'Payment received',
    intro: 'Thank you! Your payment went through and everything in this order is unlocked.',
    where: 'They are on your account now, ready to download whenever you like.',
    labels: { order: 'Order', date: 'Paid', method: 'Method', items: 'Items', total: 'Total' },
    strips: (n) => (n === 1 ? '1 strip print' : `${n} strip prints`),
    scrapbook: (title) => (title ? `Scrapbook: ${title}` : 'Scrapbook'),
    footnote:
      "Don't recognise this payment? Use Contact support in the app and include the order id above.",
  },
  id: {
    subject: 'Pembayaran Momoto kamu berhasil',
    preheader: 'Pembayaran diterima — item kamu sudah terbuka.',
    eyebrow: 'Bukti pembayaran',
    heading: 'Pembayaran diterima',
    intro: 'Terima kasih! Pembayaranmu berhasil dan semua item dalam pesanan ini sudah terbuka.',
    where: 'Semuanya sudah ada di akunmu, siap diunduh kapan saja.',
    labels: { order: 'Pesanan', date: 'Dibayar', method: 'Metode', items: 'Item', total: 'Total' },
    strips: (n) => `${n} cetak strip`,
    scrapbook: (title) => (title ? `Scrapbook: ${title}` : 'Scrapbook'),
    footnote:
      'Tidak merasa melakukan pembayaran ini? Pilih Hubungi bantuan di aplikasi dan sertakan nomor pesanan di atas.',
  },
}

export function paymentReceipt(data: PaymentReceiptData, lang: Lang): RenderedMail {
  const copy = COPY[lang]
  const items = [
    ...(data.stripCount > 0 ? [copy.strips(data.stripCount)] : []),
    ...data.scrapbookTitles.map(copy.scrapbook),
  ]
  const rows: [string, string][] = [
    [copy.labels.order, data.orderId],
    [copy.labels.date, formatPaidAt(data.paidAt, lang)],
    ...(data.method ? [[copy.labels.method, METHOD_LABEL[data.method]] as [string, string]] : []),
  ]
  const total = formatIdr(data.grossAmount)

  const text = textLayout(
    [copy.intro, copy.where],
    [
      ...rows.map(([label, value]) => `  ${label}: ${value}`),
      `  ${copy.labels.items}:`,
      ...items.map((item) => `    - ${item}`),
      `  ${copy.labels.total}: ${total}`,
    ].join('\n'),
    copy.footnote,
  )

  const cell = 'padding:4px 0; vertical-align:top;'
  const labelCell = `${cell} width:96px; color:#94a3b8;`
  const summary = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="${labelCell}">${label}</td><td style="${cell} color:#334155; word-break:break-all;">${escapeHtml(value)}</td></tr>`,
  )
  .join('\n')}
<tr><td style="${labelCell}">${copy.labels.items}</td><td style="${cell} color:#334155;">${items.map(escapeHtml).join('<br />')}</td></tr>
<tr><td style="${labelCell} padding-top:10px; border-top:1px solid #e2e8f0;">${copy.labels.total}</td><td style="${cell} padding-top:10px; border-top:1px solid #e2e8f0; font-weight:700; color:#0f172a;">${total}</td></tr>
</table>`

  return {
    subject: copy.subject,
    text,
    html: layout({
      lang,
      preheader: copy.preheader,
      eyebrow: copy.eyebrow,
      heading: copy.heading,
      paragraphs: [copy.intro, copy.where],
      callout: summary,
      footnote: copy.footnote,
    }),
  }
}

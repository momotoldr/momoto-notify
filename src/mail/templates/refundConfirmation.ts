import { escapeHtml, layout, textLayout } from '../layout.js'
import type { Lang, PaymentMethod, RefundConfirmationData, RenderedMail } from '../../types.js'

/**
 * Sent once, when an admin refunds an order Midtrans settled but Momoto never recorded
 * as paid — the "it said failed but I was charged" case. Nothing in such an order was
 * unlocked, so this mail closes the loop the payer opened with support: the money is
 * back, and where it went.
 *
 * It names no arrival time on purpose: how fast a refund lands is up to the wallet, and
 * a promise we can't keep would only bring the payer back to support. The order id is
 * printed for the same reason as on the receipt — it is what support needs.
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
function formatRefundedAt(iso: string, lang: Lang): string {
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
  /** Where the money went: the wallet by name, or — for QRIS, payable from any wallet — generically. */
  destination: (method: PaymentMethod | null) => string
  intro: (destination: string) => string
  again: string
  labels: { order: string; date: string; method: string; amount: string }
  footnote: string
}

const COPY: Record<Lang, Copy> = {
  en: {
    subject: 'We refunded your Momoto payment',
    preheader: 'Your payment has been returned in full.',
    eyebrow: 'Refund',
    heading: 'Payment refunded',
    destination: (method) =>
      method === 'gopay' || method === 'shopeepay'
        ? `your ${METHOD_LABEL[method]}`
        : 'the wallet you paid with',
    intro: (destination) =>
      `We received your payment, but your order didn't go through on our side, so nothing in it was unlocked. We've refunded the full amount to ${destination}. Sorry for the trouble.`,
    again: 'If you still want those items, you can check out again from your cart.',
    labels: { order: 'Order', date: 'Refunded', method: 'Method', amount: 'Amount' },
    footnote:
      "Don't see the refund in your wallet? Use Contact support in the app and include the order id above.",
  },
  id: {
    subject: 'Pembayaran Momoto kamu sudah dikembalikan',
    preheader: 'Pembayaranmu sudah kami kembalikan sepenuhnya.',
    eyebrow: 'Pengembalian dana',
    heading: 'Dana dikembalikan',
    destination: (method) =>
      method === 'gopay' || method === 'shopeepay'
        ? `${METHOD_LABEL[method]} kamu`
        : 'dompet digital yang kamu pakai untuk membayar',
    intro: (destination) =>
      `Pembayaranmu sudah kami terima, tetapi pesananmu tidak berhasil diproses di sistem kami, jadi tidak ada item yang terbuka. Kami sudah mengembalikan seluruh dananya ke ${destination}. Mohon maaf atas ketidaknyamanannya.`,
    again: 'Kalau masih ingin membeli item tersebut, kamu bisa checkout lagi dari keranjang.',
    labels: { order: 'Pesanan', date: 'Dikembalikan', method: 'Metode', amount: 'Jumlah' },
    footnote:
      'Dana belum masuk ke dompet digitalmu? Pilih Hubungi bantuan di aplikasi dan sertakan nomor pesanan di atas.',
  },
}

export function refundConfirmation(data: RefundConfirmationData, lang: Lang): RenderedMail {
  const copy = COPY[lang]
  const intro = copy.intro(copy.destination(data.method))
  const rows: [string, string][] = [
    [copy.labels.order, data.orderId],
    [copy.labels.date, formatRefundedAt(data.refundedAt, lang)],
    ...(data.method ? [[copy.labels.method, METHOD_LABEL[data.method]] as [string, string]] : []),
  ]
  const amount = formatIdr(data.amount)

  const text = textLayout(
    [intro, copy.again],
    [
      ...rows.map(([label, value]) => `  ${label}: ${value}`),
      `  ${copy.labels.amount}: ${amount}`,
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
<tr><td style="${labelCell} padding-top:10px; border-top:1px solid #e2e8f0;">${copy.labels.amount}</td><td style="${cell} padding-top:10px; border-top:1px solid #e2e8f0; font-weight:700; color:#0f172a;">${amount}</td></tr>
</table>`

  return {
    subject: copy.subject,
    text,
    html: layout({
      lang,
      preheader: copy.preheader,
      eyebrow: copy.eyebrow,
      heading: copy.heading,
      paragraphs: [intro, copy.again],
      callout: summary,
      calloutSpaceBelow: 28,
      footnote: copy.footnote,
    }),
  }
}

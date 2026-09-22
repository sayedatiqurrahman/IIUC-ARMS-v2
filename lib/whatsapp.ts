// WhatsApp deep-links for instructor phone numbers shown on routine views.
// Faculty phones arrive in mixed formats ("01812-345678", "+8801712...", "01712345678"),
// so numbers are normalized to international digits (no "+") before building a
// wa.me link. Returns '' when no usable number exists — callers must render the
// plain text instead of a link in that case.

// Normalize a phone number to WhatsApp's required international digit form.
// e.g. "01812-345678" → "8801812345678", "+880 1712 345678" → "8801712345678".
export function toWhatsAppNumber(phone: string): string {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  // "00..." is the IDD prefix for an international call.
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('880')) return digits;
  // Local BD numbers: 01XXXXXXXXX (11 digits) → drop leading 0, prefix 880.
  if (digits.startsWith('0') && digits.length === 11) return `880${digits.slice(1)}`;
  // 10-digit BD mobile (0-less form: 1XXXXXXXXX) → prefix 880.
  if (digits.startsWith('1') && digits.length === 10) return `880${digits}`;
  // Already international (other countries) — pass through as-is.
  return digits;
}

// Full wa.me deep link, or '' when the phone can't be normalized.
export function toWhatsAppLink(phone: string): string {
  const n = toWhatsAppNumber(phone);
  return n ? `https://wa.me/${n}` : '';
}

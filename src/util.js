export const $ = id => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const uid = p => p + '_' + Math.random().toString(36).slice(2, 8);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n), s = n < -0.05 ? '−' : '';
  if (a >= 10000) return s + (a / 1000).toFixed(0) + 'k';
  if (a >= 1000) return s + (a / 1000).toFixed(1) + 'k';
  if (a >= 10) return s + a.toFixed(0);
  return s + a.toFixed(1);
}
export const signed = n => (n > 0.05 ? '+' : '') + fmt(n);

let toastTimer = null;
export function toast(html, ms = 3500) {
  const el = $('toast'); if (!el) return;
  el.innerHTML = html; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

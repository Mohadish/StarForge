// DETERMINISTIC MATHS (2026-10-17): a replay must be the same game in every engine, and V8's Math.atan / atan2 / cbrt / tanh give
// different last bits in Chrome 152 and node 24 (sin, cos, tan, exp, log, pow, sqrt, hypot measured identical). These are built from
// + − × ÷ and sqrt only — every one correctly rounded by IEEE 754, so the result is bit-identical everywhere. Accuracy ~1e-15.
const PI = Math.PI, HALF = PI / 2;
// atan on |x| ≤ 1: halve the argument twice (atan x = 2·atan(x / (1 + √(1 + x²)))) so |x| ≤ 0.27, then the Taylor series to x²³
function atanSmall(x) {
  let k = 1;
  for (let i = 0; i < 2; i++) { x = x / (1 + Math.sqrt(1 + x * x)); k *= 2; }
  const x2 = x * x; let term = x, sum = x;
  for (let n = 3; n <= 25; n += 2) { term *= -x2; sum += term / n; }
  return k * sum;
}
export function atan(x) {
  if (x !== x) return NaN;
  if (x === Infinity) return HALF; if (x === -Infinity) return -HALF;
  const neg = x < 0, a = neg ? -x : x;
  const r = a > 1 ? HALF - atanSmall(1 / a) : atanSmall(a);
  return neg ? -r : r;
}
export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF; if (y < 0) return -HALF;                                 // x = 0
  return Object.is(x, -0) ? (Object.is(y, -0) ? -PI : PI) : (Object.is(y, -0) ? -0 : 0);   // the origin, by the signs of the zeros (as Math.atan2)
}
// tanh and cbrt through exp and Newton's step (exp is identical across the engines)
export function tanh(x) { if (x !== x) return NaN; if (x > 20) return 1; if (x < -20) return -1; const e = Math.exp(2 * x); return (e - 1) / (e + 1); }
export function cbrt(x) {
  if (x !== x || x === 0 || !Number.isFinite(x)) return x;
  const neg = x < 0, a = neg ? -x : x; let r = Math.exp(Math.log(a) / 3);
  for (let i = 0; i < 3; i++) r = r - (r * r * r - a) / (3 * r * r);                   // Newton: exact to the last bit after a step or two
  return neg ? -r : r;
}

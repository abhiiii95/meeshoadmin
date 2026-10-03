// Helpers to spot the same person behind different names / addresses,
// and names that don't look like a real person.

const ADDRESS_WORDS = new Set([
  'road', 'rd', 'nagar', 'colony', 'street', 'gali', 'sector', 'village', 'vill', 'post', 'near', 'house',
  'flat', 'block', 'mohalla', 'chowk', 'market', 'district', 'tehsil', 'ward', 'apartment', 'society', 'marg',
  'lane', 'phase', 'gate', 'temple', 'mandir', 'school', 'opp', 'opposite', 'behind', 'bazar', 'bazaar',
]);
const FAKE_WORDS = new Set([
  'test', 'testing', 'fake', 'abc', 'xyz', 'asdf', 'qwerty', 'unknown', 'customer', 'sample', 'demo', 'null',
  'none', 'nobody', 'buyer', 'user',
]);

export function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns a short reason if the name looks fake, otherwise null
export function suspiciousName(name) {
  const raw = String(name || '').trim();
  const n = normalizeName(raw);
  if (!n) return 'no name';
  if (/\d/.test(raw)) return 'has numbers';
  const letters = n.replace(/ /g, '');
  if (letters.length < 3) return 'too short';
  const words = n.split(' ');
  if (words.some((w) => FAKE_WORDS.has(w))) return 'looks like a fake name';
  if (words.some((w) => ADDRESS_WORDS.has(w))) return 'looks like an address, not a person';
  if (/(.)\1\1/.test(letters)) return 'repeated letters';
  if (words.some((w) => w.length >= 4 && !/[aeiouy]/.test(w))) return 'no vowels';
  return null;
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// "Aarushi Bainsla" ~ "Arushi Bainsla", "Kumar Santosh" ~ "Santosh Kumar", "Santosh" ~ "Santosh Kumar"
export function nameSimilar(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y || x === y) return false;
  const sx = x.split(' ').sort().join(' ');
  const sy = y.split(' ').sort().join(' ');
  if (sx === sy) return true;
  if (Math.min(sx.length, sy.length) < 4) return false;
  if (1 - levenshtein(sx, sy) / Math.max(sx.length, sy.length) >= 0.8) return true;
  const wx = new Set(x.split(' '));
  const wy = new Set(y.split(' '));
  const [small, big] = wx.size <= wy.size ? [wx, wy] : [wy, wx];
  return [...small].every((w) => w.length >= 4 && big.has(w));
}

function addressTokens(address, pincode) {
  return String(address || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && t !== pincode);
}

// Same house written the same way → same key (pincode-scoped)
export function addressKey(customer) {
  const pin = customer?.pincode || '';
  const tokens = addressTokens(customer?.address, pin);
  return tokens.length ? `${pin}|${tokens.join(' ')}` : '';
}

// Same house written slightly differently
export function addressSimilar(a, b) {
  const ta = new Set(addressTokens(a));
  const tb = new Set(addressTokens(b));
  if (ta.size < 3 || tb.size < 3) return false;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / (ta.size + tb.size - common) >= 0.75;
}

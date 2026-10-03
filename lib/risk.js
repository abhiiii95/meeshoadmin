// Customer risk scoring: fraud flags, return history, COD refusals, suspicious
// names, and links to other customers (same/similar address or similar name).
import { CUSTOMER_GROUP } from '@/lib/agg';
import { addressSimilar, nameSimilar, suspiciousName } from '@/lib/identity';
import CustomerFlag from '@/models/CustomerFlag';
import Order from '@/models/Order';

export const LEVELS = ['low', 'medium', 'high', 'fraud'];
export const levelRank = (l) => LEVELS.indexOf(l);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// groups: CUSTOMER_GROUP rows; flags: CustomerFlag docs; onlyKeys: Set to limit output
export function computeRisk(groups, flags, onlyKeys) {
  const byPin = new Map();
  for (const g of groups) {
    g.addressKeys = (g.addressKeys || []).filter(Boolean);
    const list = byPin.get(g.pincode) || [];
    list.push(g);
    byPin.set(g.pincode, list);
  }
  const flagByKey = new Map(flags.map((f) => [f.customerKey, f]));
  const flagByAddress = new Map();
  for (const f of flags) for (const k of f.addressKeys || []) flagByAddress.set(k, f);

  const out = new Map();
  for (const g of groups) {
    if (onlyKeys && !onlyKeys.has(g._id)) continue;
    const reasons = [];
    let score = 0;
    const flag = flagByKey.get(g._id);
    if (flag) reasons.push(`Marked as fraud${flag.reason ? `: ${flag.reason}` : ''}`);

    // Other customers in the same pincode who may be the same person
    const links = [];
    for (const o of byPin.get(g.pincode) || []) {
      if (o._id === g._id) continue;
      let why = null;
      if (o.addressKeys.some((k) => g.addressKeys.includes(k))) why = 'same address';
      else if (addressSimilar(o.address, g.address)) why = 'similar address';
      else if (nameSimilar(o.name, g.name)) why = 'similar name';
      if (!why) continue;
      links.push({
        customerKey: o._id,
        name: o.name,
        why,
        orders: o.orders,
        returns: o.customerReturns + o.rto,
        wrongProducts: o.wrongProducts,
        flagged: flagByKey.has(o._id),
      });
    }

    // Linked to someone marked as fraud
    const fraudLinks = new Map();
    for (const k of g.addressKeys) {
      const f = flagByAddress.get(k);
      if (f && f.customerKey !== g._id) fraudLinks.set(f.customerKey, { name: f.name, why: 'same address' });
    }
    for (const l of links) if (l.flagged && !fraudLinks.has(l.customerKey)) fraudLinks.set(l.customerKey, l);
    for (const l of fraudLinks.values()) {
      score += l.why === 'similar name' ? 30 : 60;
      reasons.push(`Possible same person as fraud customer "${l.name}" (${l.why})`);
    }

    if (g.wrongProducts) {
      score += 60 * g.wrongProducts;
      reasons.push(`${plural(g.wrongProducts, 'wrong product return')} (our product lost)`);
    }
    if (g.customerReturns) {
      score += 15 * g.customerReturns;
      reasons.push(`${plural(g.customerReturns, 'customer return')} (₹157 charge each)`);
    }
    if (g.rto) {
      score += 10 * g.rto + 10 * g.codRto;
      reasons.push(g.codRto ? `${plural(g.rto, 'RTO')}, ${g.codRto} COD refused at door` : plural(g.rto, 'RTO'));
    }
    if (g.orders >= 2 && g.returnedOrders / g.orders >= 0.5) {
      score += 20;
      reasons.push(`Returned ${g.returnedOrders} of ${g.orders} orders`);
    }
    const sus = suspiciousName(g.name);
    if (sus) {
      score += 20;
      reasons.push(`Name looks suspicious (${sus})`);
    }
    const linkedBad = links.filter((l) => !l.flagged && (l.returns || l.wrongProducts));
    if (linkedBad.length) {
      score += Math.min(40, linkedBad.reduce((s, l) => s + 10 * l.returns + 30 * l.wrongProducts, 0));
      reasons.push(
        `Possible same person as ${linkedBad.map((l) => `"${l.name}" (${l.why}, ${plural(l.returns, 'return')})`).join(', ')}`
      );
    }

    const level = flag ? 'fraud' : score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low';
    out.set(g._id, { level, score, reasons, links, flagged: Boolean(flag), flagReason: flag?.reason || '' });
  }
  return out;
}

export function loadGroups(match = {}) {
  return Order.aggregate([{ $match: match }, { $sort: { orderDate: 1 } }, { $group: CUSTOMER_GROUP }]);
}

// Risk for a few customers (only loads their pincodes)
export async function riskForKeys(keys) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return { risk: new Map(), groups: new Map() };
  const pins = await Order.distinct('customer.pincode', { customerKey: { $in: unique } });
  const [groups, flags] = await Promise.all([
    loadGroups({ 'customer.pincode': { $in: pins } }),
    CustomerFlag.find({ pincode: { $in: pins } }).lean(),
  ]);
  return { risk: computeRisk(groups, flags, new Set(unique)), groups: new Map(groups.map((g) => [g._id, g])) };
}

export async function allRisk() {
  const [groups, flags] = await Promise.all([loadGroups(), CustomerFlag.find().lean()]);
  return { groups, risk: computeRisk(groups, flags) };
}

// ?risk=medium|high|fraud → customerKeys at or above that level (null if not filtering)
export async function riskKeysFor(sp) {
  const level = sp.get('risk');
  if (!LEVELS.includes(level) || level === 'low') return null;
  const { risk } = await allRisk();
  return [...risk].filter(([, r]) => levelRank(r.level) >= levelRank(level)).map(([k]) => k);
}

export const withRiskKeys = (filter, keys) => (keys ? { $and: [filter, { customerKey: { $in: keys } }] } : filter);

// Small version for tables
export const briefRisk = (r) =>
  r && { level: r.level, score: r.score, reasons: r.reasons, flagged: r.flagged, links: r.links.length };

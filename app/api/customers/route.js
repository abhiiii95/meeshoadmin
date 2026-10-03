import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { escapeRegex } from '@/lib/format';
import { LEVELS, allRisk, briefRisk, levelRank } from '@/lib/risk';

const by = (fn, dir = -1) => (a, b) => {
  const x = fn(a);
  const y = fn(b);
  return x < y ? -dir : x > y ? dir : 0;
};
const time = (d) => (d ? new Date(d).getTime() : 0);

const SORTS = {
  orders: (a, b) => b.orders - a.orders || time(b.lastOrder) - time(a.lastOrder),
  risk: (a, b) =>
    levelRank(b.risk.level) - levelRank(a.risk.level) || b.risk.score - a.risk.score || b.orders - a.orders,
  returns: (a, b) => b.returnedOrders - a.returnedOrders || b.orders - a.orders,
  returnRate: (a, b) => b.returnRate - a.returnRate || b.returnedOrders - a.returnedOrders,
  spent: (a, b) => b.totalSpent - a.totalSpent,
  last: (a, b) => time(b.lastOrder) - time(a.lastOrder),
  name: by((c) => (c.name || '').toLowerCase(), 1),
};

export async function GET(req) {
  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '25', 10)));
  const minOrders = parseInt(sp.get('minOrders') || '0', 10);
  const minReturns = parseInt(sp.get('minReturns') || '0', 10);
  const riskLevel = sp.get('risk');
  const q = (sp.get('q') || '').trim();
  const re = q ? new RegExp(escapeRegex(q), 'i') : null;

  const { groups, risk } = await allRisk();
  let rows = groups.map((g) => ({
    ...g,
    returnRate: g.orders ? g.returnedOrders / g.orders : 0,
    risk: briefRisk(risk.get(g._id)),
  }));

  // Counts per risk level (before filtering by risk)
  const levels = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const r of rows) levels[r.risk.level]++;

  rows = rows.filter(
    (c) =>
      (!re || [c.name, c.pincode, c.city, c.state].some((v) => re.test(v || ''))) &&
      (!minOrders || c.orders >= minOrders) &&
      (!minReturns || c.returnedOrders >= minReturns) &&
      (!LEVELS.includes(riskLevel) || levelRank(c.risk.level) >= levelRank(riskLevel))
  );
  rows.sort(SORTS[sp.get('sort')] || SORTS.orders);

  const total = rows.length;
  return NextResponse.json({
    customers: rows.slice((page - 1) * limit, page * limit),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    levels,
  });
}

import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { escapeRegex } from '@/lib/format';
import { riskForKeys } from '@/lib/risk';
import Order from '@/models/Order';

// Quick customer check.
//   ?customerKey=...   full details for one customer (with recent orders)
//   ?q=...             name / pincode / AWB / order no → up to 10 matching customers
export async function GET(req) {
  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const customerKey = sp.get('customerKey');
  const q = (sp.get('q') || '').trim();

  let keys = [];
  if (customerKey) keys = [customerKey];
  else if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    const found = await Order.find({
      $or: [
        { 'customer.name': re },
        { 'customer.address': re },
        { 'customer.pincode': q },
        { awb: q },
        { orderNo: q },
        { 'items.subOrderNo': q },
      ],
    })
      .sort({ orderDate: -1 })
      .limit(300)
      .select('customerKey')
      .lean();
    keys = [...new Set(found.map((o) => o.customerKey))].slice(0, 10);
  }
  if (!keys.length) return NextResponse.json({ customers: [] });

  const { risk, groups } = await riskForKeys(keys);
  const customers = keys
    .map((k) => {
      const g = groups.get(k);
      if (!g) return null;
      return { ...g, returnRate: g.orders ? g.returnedOrders / g.orders : 0, risk: risk.get(k) };
    })
    .filter(Boolean);

  if (customerKey && customers[0]) {
    customers[0].recentOrders = await Order.find({ customerKey })
      .sort({ orderDate: -1 })
      .limit(10)
      .select('orderNo orderDate status totalAmount paymentType items.sku items.returned items.returnType items.wrongProduct')
      .lean();
  }
  return NextResponse.json({ customers });
}

import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import Order from '@/models/Order';

// Bulk mark returns. Body: { codes: string[], returnType, returnReason }
// A code can be an AWB, an order number (whole order) or a sub order number (one item).
export async function POST(req) {
  await dbConnect();
  const { codes = [], returnType = 'Customer Return', returnReason = '' } = await req.json();
  const list = [...new Set(codes.map((c) => String(c).trim()).filter(Boolean))];

  const results = [];
  for (const code of list) {
    const order = await Order.findOne({
      $or: [{ awb: code }, { orderNo: code }, { 'items.subOrderNo': code }],
    });
    if (!order) {
      results.push({ code, found: false });
      continue;
    }
    const targets = order.items.filter((i) => i.subOrderNo === code);
    for (const item of targets.length ? targets : order.items) {
      item.returned = true;
      item.returnType = returnType;
      item.returnReason = returnReason;
      item.returnedAt = new Date();
    }
    order.refreshStatus();
    await order.save();
    results.push({ code, found: true, orderNo: order.orderNo, customer: order.customer?.name });
  }
  return NextResponse.json({ results });
}

import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import CustomerFlag from '@/models/CustomerFlag';
import Order from '@/models/Order';

// Mark a customer as fraud. Body: { customerKey, reason? }
export async function POST(req) {
  const { customerKey, reason = '' } = await req.json().catch(() => ({}));
  if (!customerKey) return NextResponse.json({ error: 'customerKey is required' }, { status: 400 });

  await dbConnect();
  const orders = await Order.find({ customerKey }).sort({ orderDate: 1 }).select('customer addressKey').lean();
  if (!orders.length) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const last = orders[orders.length - 1];
  const flag = await CustomerFlag.findOneAndUpdate(
    { customerKey },
    {
      customerKey,
      name: last.customer?.name,
      pincode: last.customer?.pincode,
      addressKeys: [...new Set(orders.map((o) => o.addressKey).filter(Boolean))],
      reason: String(reason).trim(),
    },
    { upsert: true, new: true }
  );
  return NextResponse.json({ flag });
}

// Remove the fraud mark: /api/customers/flag?customerKey=...
export async function DELETE(req) {
  const customerKey = req.nextUrl.searchParams.get('customerKey');
  if (!customerKey) return NextResponse.json({ error: 'customerKey is required' }, { status: 400 });
  await dbConnect();
  await CustomerFlag.deleteOne({ customerKey });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import Order from '@/models/Order';

async function findOrder(params) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  return Order.findById(id);
}

// Mark / unmark returns. Body: { subOrderNo?, returned, returnType?, returnReason? }
// Without subOrderNo every item in the order is updated.
export async function PATCH(req, { params }) {
  const order = await findOrder(params);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { subOrderNo, returned, returnType = 'Customer Return', returnReason = '' } = await req.json();
  const targets = subOrderNo ? order.items.filter((i) => i.subOrderNo === subOrderNo) : order.items;
  if (!targets.length) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  for (const item of targets) {
    item.returned = Boolean(returned);
    item.returnType = returned ? returnType : '';
    item.returnReason = returned ? returnReason : '';
    item.returnedAt = returned ? new Date() : undefined;
  }
  order.refreshStatus();
  await order.save();
  return NextResponse.json({ order });
}

export async function DELETE(req, { params }) {
  const order = await findOrder(params);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  await order.deleteOne();
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { applyReturn } from '@/lib/returns';
import Order from '@/models/Order';

async function findOrder(params) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return null;
  await dbConnect();
  return Order.findById(id);
}

// Mark / unmark returns.
// Body: { subOrderNo?, returned, returnType?, returnReason?, returnCharge?, wrongProduct?, lostValue? }
// Without subOrderNo every item in the order is updated.
export async function PATCH(req, { params }) {
  const order = await findOrder(params);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { subOrderNo, ...data } = await req.json();
  const targets = subOrderNo ? order.items.filter((i) => i.subOrderNo === subOrderNo) : order.items;
  if (!targets.length) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  if (data.returned && data.wrongProduct && !(Number(data.lostValue) > 0)) {
    return NextResponse.json({ error: 'Enter the purchase value of the lost product' }, { status: 400 });
  }

  for (const item of targets) applyReturn(item, data);
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

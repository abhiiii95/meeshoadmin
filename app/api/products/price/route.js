import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import Product from '@/models/Product';

// Body: { sku, purchasePrice } — empty purchasePrice clears it
export async function POST(req) {
  const { sku, purchasePrice } = await req.json().catch(() => ({}));
  if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });

  const empty = purchasePrice === '' || purchasePrice === null || purchasePrice === undefined;
  const value = Number(purchasePrice);
  if (!empty && (!Number.isFinite(value) || value < 0)) {
    return NextResponse.json({ error: 'Enter a valid price' }, { status: 400 });
  }

  await dbConnect();
  const product = await Product.findOneAndUpdate(
    { sku },
    empty ? { $unset: { purchasePrice: 1 } } : { purchasePrice: value },
    { upsert: true, new: true }
  );
  return NextResponse.json({ product });
}

import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { cloudinaryEnabled, deleteAsset, uploadBuffer } from '@/lib/cloudinary';
import Product from '@/models/Product';

export const runtime = 'nodejs';

export async function POST(req) {
  if (!cloudinaryEnabled) {
    return NextResponse.json({ error: 'Cloudinary is not configured in .env.local' }, { status: 400 });
  }
  const form = await req.formData();
  const sku = String(form.get('sku') || '').trim();
  const file = form.get('file');
  if (!sku || !file || typeof file !== 'object') {
    return NextResponse.json({ error: 'sku and file are required' }, { status: 400 });
  }
  if (!file.type?.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
  }

  await dbConnect();
  const up = await uploadBuffer(Buffer.from(await file.arrayBuffer()), {
    folder: 'meesho-products',
    resource_type: 'image',
  });

  const existing = await Product.findOne({ sku });
  if (existing?.imagePublicId) await deleteAsset(existing.imagePublicId);

  const product = await Product.findOneAndUpdate(
    { sku },
    { imageUrl: up.secure_url, imagePublicId: up.public_id },
    { upsert: true, new: true }
  );
  return NextResponse.json({ product });
}

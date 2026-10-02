import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { extractPages } from '@/lib/pdf';
import { parsePage } from '@/lib/parser';
import { cloudinaryEnabled, uploadBuffer } from '@/lib/cloudinary';
import Order from '@/models/Order';
import Upload from '@/models/Upload';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  await dbConnect();
  const uploads = await Upload.find().sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json({ uploads });
}

export async function POST(req) {
  await dbConnect();
  const form = await req.formData();
  const files = form.getAll('files').filter((f) => typeof f === 'object' && f.size > 0);
  if (!files.length) return NextResponse.json({ error: 'No PDF files received' }, { status: 400 });

  const results = [];
  for (const file of files) {
    const result = { fileName: file.name, pages: 0, inserted: 0, updated: 0, failed: [] };
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const pages = await extractPages(buffer);
      result.pages = pages.length;

      let pdfUrl = '';
      let pdfPublicId = '';
      if (cloudinaryEnabled) {
        try {
          const up = await uploadBuffer(buffer, {
            folder: 'meesho-labels',
            resource_type: 'raw',
            public_id: `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`,
          });
          pdfUrl = up.secure_url;
          pdfPublicId = up.public_id;
        } catch (err) {
          result.cloudinaryError = err.message;
        }
      }

      const upload = await Upload.create({ fileName: file.name, pdfUrl, pdfPublicId, pages: pages.length });

      for (let i = 0; i < pages.length; i++) {
        const pageNo = i + 1;
        let parsed;
        try {
          parsed = parsePage(pages[i]);
        } catch (err) {
          result.failed.push({ page: pageNo, reason: `Parse error: ${err.message}` });
          continue;
        }
        if (!parsed) continue; // page without a label (e.g. blank)
        if (!parsed.orderNo) {
          result.failed.push({ page: pageNo, reason: 'Order number not found' });
          continue;
        }
        try {
          const data = { ...parsed, upload: upload._id, pdfUrl, page: pageNo };
          const existing = await Order.findOne({ orderNo: parsed.orderNo });
          if (existing) {
            // Re-upload refreshes the PDF data but keeps return marks
            const prev = new Map(existing.items.map((i) => [i.subOrderNo, i]));
            data.items = data.items.map((it) => {
              const p = prev.get(it.subOrderNo);
              return p
                ? { ...it, returned: p.returned, returnType: p.returnType, returnReason: p.returnReason, returnedAt: p.returnedAt }
                : it;
            });
            existing.set(data);
            existing.refreshStatus();
            await existing.save();
            result.updated++;
          } else {
            await Order.create(data);
            result.inserted++;
          }
        } catch (err) {
          result.failed.push({ page: pageNo, reason: err.message });
        }
      }

      upload.inserted = result.inserted;
      upload.updated = result.updated;
      upload.failed = result.failed;
      await upload.save();
    } catch (err) {
      result.failed.push({ page: 0, reason: `Could not read PDF: ${err.message}` });
    }
    results.push(result);
  }

  return NextResponse.json({ results });
}

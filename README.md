# Meesho Admin Panel

Next.js (JavaScript) + MongoDB + Cloudinary admin panel. Upload Meesho shipping-label PDFs; every page
is read into an order (customer, address, AWB, courier, SKU, size, color, qty, invoice, amounts) and saved
to MongoDB. Mark items as returned, see how many times each customer shopped / returned, export CSV.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

`.env.local`:

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The only login that works |
| `SESSION_SECRET` | Long random string used to sign the login cookie |
| `MONGODB_URI` | MongoDB connection string |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Stores uploaded PDFs and product images (optional; uploads still work without it) |

## Pages

- **Dashboard** – totals, return rate, top returning customers and SKUs
- **Upload PDF** – drop one or more label PDFs; duplicates (same order no.) are skipped
- **Orders** – search + filters (status, payment, courier, date, customer, SKU), mark/undo returns per item, CSV export
- **Customers** – times shopped, times returned, return rate, spend; filter by min orders / min returns
- **Returns** – bulk mark returns by scanning AWB / order / sub-order numbers
- **Products** – per-SKU sales and returns, upload a product image

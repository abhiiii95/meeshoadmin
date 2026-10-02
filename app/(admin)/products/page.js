'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fmtDate, inr, pct } from '@/lib/format';

export default function ProductsPage() {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState(null);
  const [uploadingSku, setUploadingSku] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const targetSku = useRef('');

  const load = (query = q) =>
    fetch(`/api/products?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .catch(() => setProducts([]));

  useEffect(() => {
    load('');
  }, []);

  function chooseImage(sku) {
    targetSku.current = sku;
    fileRef.current?.click();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingSku(targetSku.current);
    setError('');
    const form = new FormData();
    form.append('sku', targetSku.current);
    form.append('file', file);
    const res = await fetch('/api/products/image', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setUploadingSku('');
    if (!res.ok) setError(data.error || 'Image upload failed');
    else load();
  }

  return (
    <>
      <div className="page-head">
        <h1>Products (SKUs)</h1>
      </div>

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input type="search" placeholder="Search SKU or product name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary">Search</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

      <div className="table-wrap">
        <table className="cards">
          <thead>
            <tr>
              <th>Image</th>
              <th>SKU / Product</th>
              <th className="num">Orders</th>
              <th className="num">Qty sold</th>
              <th className="num">Qty returned</th>
              <th className="num">Return rate</th>
              <th className="num">Revenue</th>
              <th>Last order</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!products ? (
              <tr>
                <td colSpan={9} className="empty">Loading…</td>
              </tr>
            ) : !products.length ? (
              <tr>
                <td colSpan={9} className="empty">No products yet</td>
              </tr>
            ) : (
              products.map((p) => {
                const rate = p.qty ? p.returnedQty / p.qty : 0;
                return (
                  <tr key={p._id} className="product-row">
                    <td className="product-img">
                      <button
                        type="button"
                        onClick={() => chooseImage(p._id)}
                        title="Upload image"
                        style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer' }}
                      >
                        {p.imageUrl ? (
                          <img className="thumb thumb-lg" src={p.imageUrl} alt={p._id} />
                        ) : (
                          <div className="thumb thumb-lg thumb-empty">
                            {uploadingSku === p._id ? 'Uploading…' : '+ Image'}
                          </div>
                        )}
                      </button>
                    </td>
                    <td>
                      <div className="mono">{p._id}</div>
                      <div className="small muted" style={{ maxWidth: 360 }}>{p.description}</div>
                    </td>
                    <td className="num half" data-label="Orders">{p.orders}</td>
                    <td className="num half" data-label="Qty sold">{p.qty}</td>
                    <td className="num half" data-label="Qty returned">{p.returnedQty}</td>
                    <td className="num half" data-label="Return rate">
                      <span className={`badge ${rate >= 0.3 ? 'badge-red' : rate > 0 ? 'badge-amber' : 'badge-green'}`}>
                        {pct(rate)}
                      </span>
                    </td>
                    <td className="num half" data-label="Revenue">{inr(p.revenue)}</td>
                    <td className="nowrap half" data-label="Last order">{fmtDate(p.lastOrder)}</td>
                    <td className="row-actions">
                      <Link className="btn btn-sm" href={`/orders?sku=${encodeURIComponent(p._id)}`}>
                        Orders
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

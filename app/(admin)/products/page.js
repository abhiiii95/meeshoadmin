'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fmtDate, inr, pct } from '@/lib/format';

// Saves on blur / Enter
function PriceInput({ sku, value }) {
  const initial = value ?? '';
  const [v, setV] = useState(String(initial));
  const [state, setState] = useState(''); // '', 'saving', 'saved', 'error'

  async function save() {
    if (v === String(initial) && state !== 'error') return;
    setState('saving');
    const res = await fetch('/api/products/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, purchasePrice: v.trim() }),
    });
    setState(res.ok ? 'saved' : 'error');
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span className="muted">₹</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={v}
        placeholder="Not set"
        onChange={(e) => {
          setV(e.target.value);
          setState('');
        }}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        style={{ width: 100 }}
      />
      <span className="small" style={{ color: state === 'error' ? 'var(--red)' : 'var(--green)' }}>
        {state === 'saving' ? '…' : state === 'saved' ? '✓' : state === 'error' ? 'Error' : ''}
      </span>
    </div>
  );
}

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

      <p className="muted small" style={{ marginTop: -4 }}>
        Enter the purchase price of each SKU. Profit &amp; Loss uses it to work out your profit.
      </p>
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
              <th>Purchase price / pc</th>
              <th>Last order</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!products ? (
              <tr>
                <td colSpan={10} className="empty">Loading…</td>
              </tr>
            ) : !products.length ? (
              <tr>
                <td colSpan={10} className="empty">No products yet</td>
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
                    <td className="half" data-label="Purchase price / pc">
                      <PriceInput sku={p._id} value={p.purchasePrice} />
                    </td>
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

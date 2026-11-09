'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { inr, pct } from '@/lib/format';

export default function TopProductsPage() {
  const [month, setMonth] = useState('');
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setProducts(null);
    setError('');
    fetch(`/api/products?sort=top${month ? `&month=${month}` : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setProducts(d.products || []))
      .catch(() => setError('Could not load products'));
  }, [month]);

  return (
    <>
      <div className="page-head">
        <h1>Top Products</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} title="Order month" />
          {month && (
            <button className="btn btn-sm btn-clear" onClick={() => setMonth('')}>
              ✕ All time
            </button>
          )}
        </div>
      </div>
      <p className="muted small" style={{ marginTop: -8 }}>
        Highest selling first, by pieces customers actually kept (returns and RTO removed, cancelled orders not
        counted).
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="cards">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th className="num">Pieces sold</th>
              <th className="num">Shipped</th>
              <th className="num">Came back</th>
              <th className="num">Return rate</th>
              <th className="num">Sales (kept)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!products && !error ? (
              <tr>
                <td colSpan={8} className="empty">Loading…</td>
              </tr>
            ) : !products?.length ? (
              <tr>
                <td colSpan={8} className="empty">No orders in this month</td>
              </tr>
            ) : (
              products.map((p, i) => {
                const rate = p.qty ? p.returnedQty / p.qty : 0;
                return (
                  <tr key={p._id} className="product-row">
                    <td className="product-img">
                      <span className="rank">{i + 1}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        {p.imageUrl ? (
                          <img className="thumb" src={p.imageUrl} alt={p._id} />
                        ) : (
                          <div className="thumb thumb-empty">No img</div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div className="mono" style={{ wordBreak: 'break-all' }}>{p._id}</div>
                          <div className="small muted" style={{ maxWidth: 360 }}>{p.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num half" data-label="Pieces sold"><strong>{p.keptQty}</strong></td>
                    <td className="num half" data-label="Shipped">{p.qty}</td>
                    <td className="num half" data-label="Came back">{p.returnedQty}</td>
                    <td className="num half" data-label="Return rate">
                      <span className={`badge ${rate >= 0.3 ? 'badge-red' : rate > 0 ? 'badge-amber' : 'badge-green'}`}>
                        {pct(rate)}
                      </span>
                    </td>
                    <td className="num half" data-label="Sales (kept)">{inr(p.keptRevenue)}</td>
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

'use client';

import { useState } from 'react';

// Asks for the purchase price of SKUs that don't have one yet.
// items: [{ sku, description }]
export default function CostPrompt({ items, title = 'Enter product cost', onSaved }) {
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pending = items.filter((i) => !saved.has(i.sku));
  if (!pending.length) {
    return saved.size ? <div className="alert alert-ok">✓ Product cost saved.</div> : null;
  }

  async function save(e) {
    e.preventDefault();
    const toSave = pending.filter((i) => String(values[i.sku] ?? '').trim() !== '');
    if (!toSave.length) {
      setError('Enter at least one cost');
      return;
    }
    setSaving(true);
    setError('');
    const done = new Set(saved);
    for (const i of toSave) {
      const res = await fetch('/api/products/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: i.sku, purchasePrice: values[i.sku] }),
      });
      if (res.ok) done.add(i.sku);
      else setError(`Could not save ${i.sku}`);
    }
    setSaved(done);
    setSaving(false);
    onSaved?.();
  }

  return (
    <form className="card cost-prompt" onSubmit={save}>
      <h2>💰 {title}</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        {pending.length} product{pending.length > 1 ? 's have' : ' has'} no purchase price. Profit &amp; Loss needs it
        to show your real profit.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {pending.map((i) => (
        <div className="cost-row" key={i.sku}>
          <div style={{ minWidth: 0 }}>
            <div className="mono">{i.sku}</div>
            {i.description && <div className="muted small cost-desc">{i.description}</div>}
          </div>
          <div className="cost-input">
            <span className="muted">₹</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Cost / pc"
              value={values[i.sku] ?? ''}
              onChange={(e) => setValues({ ...values, [i.sku]: e.target.value })}
            />
          </div>
        </div>
      ))}
      <button className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : 'Save cost'}
      </button>
    </form>
  );
}

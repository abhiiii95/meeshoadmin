'use client';

import { useState } from 'react';
import { RETURN_TYPES, defaultReturnCharge } from '@/lib/constants';

export { RETURN_TYPES };

// defaultLostValue: SKU purchase price (if saved) to pre-fill the wrong-product loss
export default function ReturnModal({ title, defaultLostValue, onClose, onSubmit }) {
  const [returnType, setReturnType] = useState(RETURN_TYPES[0]);
  const [returnCharge, setReturnCharge] = useState(String(defaultReturnCharge(RETURN_TYPES[0])));
  const [wrongProduct, setWrongProduct] = useState(false);
  const [lostValue, setLostValue] = useState(defaultLostValue ? String(defaultLostValue) : '');
  const [returnReason, setReturnReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function changeType(t) {
    setReturnType(t);
    setReturnCharge(String(defaultReturnCharge(t)));
  }

  async function submit(e) {
    e.preventDefault();
    if (wrongProduct && !(Number(lostValue) > 0)) {
      setError('Enter the purchase value of your product');
      return;
    }
    setSaving(true);
    setError('');
    const err = await onSubmit({
      returnType,
      returnReason,
      returnCharge: Number(returnCharge) || 0,
      wrongProduct,
      lostValue: wrongProduct ? Number(lostValue) : 0,
    });
    setSaving(false);
    if (err) setError(err);
  }

  const loss = (Number(returnCharge) || 0) + (wrongProduct ? Number(lostValue) || 0 : 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{title}</h3>
        {error && <div className="alert alert-error">{error}</div>}

        <label>
          Return type
          <div className="segmented">
            {RETURN_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={returnType === t ? 'on' : ''}
                onClick={() => changeType(t)}
              >
                {t === 'RTO' ? 'RTO (courier return)' : t}
              </button>
            ))}
          </div>
        </label>

        <label>
          Meesho return charge (₹)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={returnCharge}
            onChange={(e) => setReturnCharge(e.target.value)}
          />
          <span className="hint">
            {returnType === 'RTO' ? 'RTO: no charge' : 'Customer return: Meesho deducts ₹157 by default'}
          </span>
        </label>

        <label className="check">
          <input type="checkbox" checked={wrongProduct} onChange={(e) => setWrongProduct(e.target.checked)} />
          Wrong / different product came back (our product is lost)
        </label>

        {wrongProduct && (
          <label>
            Purchase value of our product (₹)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={lostValue}
              onChange={(e) => setLostValue(e.target.value)}
              placeholder="What it cost you to buy"
              autoFocus
              required
            />
          </label>
        )}

        <label>
          Reason / note (optional)
          <input
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder="e.g. Wrong size, damaged, customer not available"
          />
        </label>

        <div className="alert alert-error" style={{ margin: 0 }}>
          Loss on this return: <strong>₹{loss.toLocaleString('en-IN')}</strong>
        </div>

        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Mark returned'}
          </button>
        </div>
      </form>
    </div>
  );
}

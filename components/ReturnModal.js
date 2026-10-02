'use client';

import { useState } from 'react';

export const RETURN_TYPES = ['Customer Return', 'RTO'];

export default function ReturnModal({ title, onClose, onSubmit }) {
  const [returnType, setReturnType] = useState(RETURN_TYPES[0]);
  const [returnReason, setReturnReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSubmit({ returnType, returnReason });
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{title}</h3>
        <label>
          Return type
          <select value={returnType} onChange={(e) => setReturnType(e.target.value)}>
            {RETURN_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Reason (optional)
          <input
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder="e.g. Wrong size, damaged, customer not available"
          />
        </label>
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

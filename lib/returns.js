import { defaultReturnCharge } from '@/lib/constants';

const money = (v) => Math.max(0, Math.round((Number(v) || 0) * 100) / 100);

// Applies a return (or undo) to one order item
export function applyReturn(item, { returned, returnType, returnReason, returnCharge, wrongProduct, lostValue }) {
  if (!returned) {
    item.returned = false;
    item.returnType = '';
    item.returnReason = '';
    item.returnedAt = undefined;
    item.returnCharge = 0;
    item.wrongProduct = false;
    item.lostValue = 0;
    return;
  }
  const type = returnType || 'Customer Return';
  item.returned = true;
  item.returnType = type;
  item.returnReason = returnReason || '';
  item.returnedAt = new Date();
  item.returnCharge =
    returnCharge === undefined || returnCharge === null || returnCharge === ''
      ? defaultReturnCharge(type)
      : money(returnCharge);
  item.wrongProduct = Boolean(wrongProduct);
  item.lostValue = item.wrongProduct ? money(lostValue) : 0;
}

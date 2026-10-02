// Shared MongoDB aggregation expressions for order status
export const IS_RETURNED = { $in: ['$status', ['partial', 'returned']] };
export const IS_CANCELLED = { $eq: ['$status', 'cancelled'] };
export const NOT_CANCELLED = { $ne: ['$status', 'cancelled'] };

export const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
export const sumIf = (cond, expr) => ({ $sum: { $cond: [cond, expr, 0] } });

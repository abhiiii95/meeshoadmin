// Shared MongoDB aggregation expressions for order status
export const IS_RETURNED = { $in: ['$status', ['partial', 'returned']] };
export const IS_CANCELLED = { $eq: ['$status', 'cancelled'] };
export const NOT_CANCELLED = { $ne: ['$status', 'cancelled'] };
export const IS_DELIVERED = { $eq: ['$status', 'active'] };

// Order has at least one item returned with this return type
export const hasReturnType = (type) => ({
  $and: [
    NOT_CANCELLED,
    {
      $anyElementTrue: [
        {
          $map: {
            input: { $ifNull: ['$items', []] },
            as: 'i',
            in: { $and: [{ $eq: ['$$i.returned', true] }, { $eq: ['$$i.returnType', type] }] },
          },
        },
      ],
    },
  ],
});

export const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
export const sumIf = (cond, expr) => ({ $sum: { $cond: [cond, expr, 0] } });

// Sum of a per-item field over returned items of one type
export const sumItemsOfType = (type, field) => ({
  $sum: {
    $sum: {
      $map: {
        input: {
          $filter: {
            input: { $ifNull: ['$items', []] },
            as: 'i',
            cond: { $and: [{ $eq: ['$$i.returned', true] }, { $eq: ['$$i.returnType', type] }] },
          },
        },
        as: 'i',
        in: { $ifNull: [`$$i.${field}`, 0] },
      },
    },
  },
});

// Counts + amounts per Orders tab
export const TAB_GROUP = {
  all: { $sum: 1 },
  delivered: countIf(IS_DELIVERED),
  deliveredAmount: sumIf(IS_DELIVERED, '$totalAmount'),
  customerReturn: countIf(hasReturnType('Customer Return')),
  customerReturnCharges: sumItemsOfType('Customer Return', 'returnCharge'),
  customerReturnAmount: sumItemsOfType('Customer Return', 'total'),
  rto: countIf(hasReturnType('RTO')),
  rtoAmount: sumItemsOfType('RTO', 'total'),
  cancelled: countIf(IS_CANCELLED),
  cancelledAmount: sumIf(IS_CANCELLED, '$totalAmount'),
};

export const EMPTY_TABS = Object.fromEntries(Object.keys(TAB_GROUP).map((k) => [k, 0]));

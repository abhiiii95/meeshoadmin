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

const itemsWhere = (cond) => ({ $filter: { input: { $ifNull: ['$items', []] }, as: 'i', cond } });
const isRetType = (type) => ({ $and: [{ $eq: ['$$i.returned', true] }, { $eq: ['$$i.returnType', type] }] });
const itemCount = (cond) => ({ $size: itemsWhere(cond) });
export const countItemsOfType = (type) => ({ $sum: itemCount(isRetType(type)) });

// Everything we know about one customer (customerKey = name + pincode).
// Use after { $sort: { orderDate: 1 } } so $last gives the latest details.
export const CUSTOMER_GROUP = {
  _id: '$customerKey',
  name: { $last: '$customer.name' },
  address: { $last: '$customer.address' },
  city: { $last: '$customer.city' },
  state: { $last: '$customer.state' },
  pincode: { $last: '$customer.pincode' },
  addressKeys: { $addToSet: '$addressKey' },
  orders: countIf(NOT_CANCELLED),
  cancelledOrders: countIf(IS_CANCELLED),
  returnedOrders: countIf(IS_RETURNED),
  items: sumIf(NOT_CANCELLED, { $size: { $ifNull: ['$items', []] } }),
  returnedItems: { $sum: itemCount({ $eq: ['$$i.returned', true] }) },
  customerReturns: countItemsOfType('Customer Return'),
  rto: countItemsOfType('RTO'),
  codRto: sumIf({ $eq: ['$paymentType', 'COD'] }, itemCount(isRetType('RTO'))),
  wrongProducts: {
    $sum: itemCount({ $and: [{ $eq: ['$$i.returned', true] }, { $eq: ['$$i.wrongProduct', true] }] }),
  },
  codOrders: countIf({ $and: [NOT_CANCELLED, { $eq: ['$paymentType', 'COD'] }] }),
  totalSpent: sumIf(NOT_CANCELLED, '$totalAmount'),
  returnedAmount: { $sum: '$returnedAmount' },
  // Money lost on returns: Meesho charges + products lost to wrong returns
  lossAmount: {
    $sum: {
      $sum: {
        $map: {
          input: itemsWhere({ $eq: ['$$i.returned', true] }),
          as: 'i',
          in: { $add: [{ $ifNull: ['$$i.returnCharge', 0] }, { $ifNull: ['$$i.lostValue', 0] }] },
        },
      },
    },
  },
  firstOrder: { $min: '$orderDate' },
  lastOrder: { $max: '$orderDate' },
};

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

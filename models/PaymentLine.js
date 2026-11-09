import mongoose from 'mongoose';

// One row of Meesho's payment report. An order can have several rows,
// e.g. a return in one payment and its reversal in a later one.
const PaymentLineSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // subOrderNo|transactionId|nth row, so re-uploads don't double count
    subOrderNo: { type: String, required: true, index: true },
    orderDate: { type: Date, index: true },
    month: { type: String, index: true }, // order month, YYYY-MM
    dispatchDate: Date,
    productName: String,
    sku: { type: String, index: true },
    catalogId: String,
    status: String, // as written by Meesho; blank on claim-only rows
    priceType: String,
    listingPrice: { type: Number, default: 0 },
    qty: { type: Number, default: 1 },
    transactionId: { type: String, default: '' }, // blank = not paid yet
    paymentDate: { type: Date, index: true },
    settlement: { type: Number, default: 0 },
    saleAmount: { type: Number, default: 0 },
    saleReturnAmount: { type: Number, default: 0 },
    returnCharge: { type: Number, default: 0 }, // negative = deducted, positive = given back
    shippingCharge: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    tcs: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    compensation: { type: Number, default: 0 },
    claims: { type: Number, default: 0 },
    recovery: { type: Number, default: 0 },
    compensationReason: { type: String, default: '' },
    claimReason: { type: String, default: '' },
    recoveryReason: { type: String, default: '' },
    raw: mongoose.Schema.Types.Mixed, // every column of the row, as in the report
    upload: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentUpload' },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== 'production' && mongoose.models.PaymentLine) mongoose.deleteModel('PaymentLine');

export default mongoose.models.PaymentLine || mongoose.model('PaymentLine', PaymentLineSchema);

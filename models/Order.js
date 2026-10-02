import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema(
  {
    sku: String,
    size: String,
    color: String,
    qty: { type: Number, default: 1 },
    subOrderNo: { type: String, index: true },
    description: String,
    grossAmount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    returned: { type: Boolean, default: false },
    returnType: { type: String, enum: ['RTO', 'Customer Return', ''], default: '' },
    returnReason: { type: String, default: '' },
    returnedAt: Date,
    // Amount Meesho deducted for this return (157 for customer return, 0 for RTO)
    returnCharge: { type: Number, default: 0 },
    // Customer sent back a wrong/different product, so our product is lost
    wrongProduct: { type: Boolean, default: false },
    lostValue: { type: Number, default: 0 }, // purchase value of our lost product
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true },
    invoiceNo: String,
    orderDate: { type: Date, index: true },
    invoiceDate: Date,
    customer: {
      name: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
    },
    customerKey: { type: String, index: true },
    returnTo: String,
    // Shipping label
    paymentType: { type: String, enum: ['Prepaid', 'COD'], default: 'Prepaid' },
    paymentText: String,
    courier: String,
    serviceType: String, // Pickup / Drop
    pickupCode: String,
    destinationCode: String,
    returnCode: String,
    sortCodes: [String],
    awb: { type: String, index: true },
    // Invoice
    invoiceTitle: String,
    invoiceCopy: String,
    billTo: String,
    placeOfSupply: String,
    soldBy: String,
    sellerAddress: String,
    enrolmentNo: String,
    gstin: String,
    items: [ItemSchema],
    otherChargesGross: { type: Number, default: 0 },
    otherChargesDiscount: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    invoiceNote: String,
    returnedAmount: { type: Number, default: 0 },
    // Order cancelled before delivery (label may already be printed): no sale, no charge
    cancelled: { type: Boolean, default: false },
    cancelReason: { type: String, default: '' },
    cancelledAt: Date,
    // active = nothing returned, partial = some items returned, returned = all items returned,
    // cancelled = cancelled before delivery
    status: {
      type: String,
      enum: ['active', 'partial', 'returned', 'cancelled'],
      default: 'active',
      index: true,
    },
    upload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload' },
    pdfUrl: String,
    page: Number,
    rawText: { type: String, select: false },
  },
  { timestamps: true }
);

OrderSchema.methods.refreshStatus = function () {
  const returned = this.cancelled ? [] : this.items.filter((i) => i.returned);
  this.status = this.cancelled
    ? 'cancelled'
    : returned.length === 0
      ? 'active'
      : returned.length === this.items.length
        ? 'returned'
        : 'partial';
  this.returnedAmount = returned.reduce((s, i) => s + (i.total || 0), 0);
};

// In dev, drop the cached model so schema edits apply after hot reload
if (process.env.NODE_ENV !== 'production' && mongoose.models.Order) mongoose.deleteModel('Order');

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);

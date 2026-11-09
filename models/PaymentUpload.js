import mongoose from 'mongoose';

const PaymentUploadSchema = new mongoose.Schema(
  {
    fileName: String,
    lines: Number,
    inserted: Number,
    updated: Number,
    warnings: [String],
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== 'production' && mongoose.models.PaymentUpload) mongoose.deleteModel('PaymentUpload');

export default mongoose.models.PaymentUpload || mongoose.model('PaymentUpload', PaymentUploadSchema);

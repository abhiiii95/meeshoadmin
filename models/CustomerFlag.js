import mongoose from 'mongoose';

// Customers marked as fraud. addressKeys let us catch them under a new name.
const CustomerFlagSchema = new mongoose.Schema(
  {
    customerKey: { type: String, required: true, unique: true },
    name: String,
    pincode: { type: String, index: true },
    addressKeys: [String],
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== 'production' && mongoose.models.CustomerFlag) mongoose.deleteModel('CustomerFlag');

export default mongoose.models.CustomerFlag || mongoose.model('CustomerFlag', CustomerFlagSchema);

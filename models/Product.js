import mongoose from 'mongoose';

// Extra info per SKU (image stored on Cloudinary)
const ProductSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true },
    imageUrl: String,
    imagePublicId: String,
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== 'production' && mongoose.models.Product) mongoose.deleteModel('Product');

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);

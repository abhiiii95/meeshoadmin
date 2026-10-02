import mongoose from 'mongoose';

const UploadSchema = new mongoose.Schema(
  {
    fileName: String,
    pdfUrl: String,
    pdfPublicId: String,
    pages: Number,
    inserted: Number,
    updated: Number,
    duplicates: Number, // older uploads
    labels: Number,
    failed: [{ page: String, reason: String }],
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== 'production' && mongoose.models.Upload) mongoose.deleteModel('Upload');

export default mongoose.models.Upload || mongoose.model('Upload', UploadSchema);

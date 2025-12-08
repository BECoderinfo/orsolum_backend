import mongoose from "mongoose";

const TempSellerPasswordSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour expiry
    index: { expireAfterSeconds: 0 }, // Auto-delete expired documents
  }
}, { timestamps: true });

const TempSellerPassword = mongoose.model('tempSellerPassword', TempSellerPasswordSchema);

export default TempSellerPassword;





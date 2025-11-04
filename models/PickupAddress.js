// orsolum_backend/models/PickupAddress.js
import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const PickupAddressSchema = new mongoose.Schema({
    storeId: {
        type: ObjectId,
        ref: 'store',
        required: true
    },
    nickname: {
        type: String,
        required: true,
        trim: true
    },
    isPrimary: {
        type: Boolean,
        default: false
    },
    verificationStatus: {
        type: String,
        enum: ["PENDING", "VERIFIED", "REJECTED"],
        default: "PENDING"
    },
    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE"],
        default: "ACTIVE"
    },
    // Shiprocket Integration
    shiprocket: {
        pickup_address_id: { type: String },
        pickup_location: {
            name: { type: String, required: true },
            phone: { type: String, required: true },
            address: { type: String, required: true },
            address_2: { type: String },
            city: { type: String, required: true },
            state: { type: String, required: true },
            pincode: { type: String, required: true },
            country: { type: String, default: "India" }
        }
    },
    // Warehouse SPOC Details
    spocDetails: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        email: { type: String }
    },
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    updatedBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    }
}, { timestamps: true });

// Index for efficient queries
PickupAddressSchema.index({ storeId: 1, isPrimary: 1 });
PickupAddressSchema.index({ storeId: 1, status: 1 });

const PickupAddress = mongoose.model('PickupAddress', PickupAddressSchema);
export default PickupAddress;
import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const StoreSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    category: {
        type: ObjectId,
        ref: 'store_category',
        required: true
    },
    information: {
        type: String,
        required: true
    },
    phone: {
        type: String
    },
    address: {
        type: String
    },
    email: {
        type: String
    },
    directMe: {
        type: String
    },
    coverImage: {
        type: String
    },
    images: [
        {
            type: String
        }
    ],
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    updatedBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    status: {
        type: String,
        enum: ["P", "A", "R"], // P = Pending, A = Accepted, R = Rejected
        default: "P"
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },
    shiprocket: {
        pickup_address_id: { type: String }, 
        pickup_location: {
            name: { type: String },
            phone: { type: String },
            address: { type: String },
            city: { type: String },
            state: { type: String },
            pincode: { type: String },
            country: { type: String, default: "India" }
        },
        pickup_addresses: [{
            type: ObjectId,
            ref: 'PickupAddress'
        }],
        default_pickup_address: {
            type: ObjectId,
            ref: 'PickupAddress'
        }
    },
    objectives: [{
        type: String
    }],
    license: {
        type: String
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    ratingCount: {
        type: Number,
        default: 0
    },
    onboardingCompleted: {
        type: Boolean,
        default: false,
      },
    platformFee: { type: Number, default: null }, // per-store override; falls back to env PLATFORM_FEE
    extraCharges: [{
        label: { type: String, trim: true },
        amount: { type: Number, default: 0 },
        type: { type: String, enum: ["flat", "percent"], default: "flat" } // percent applied on products subtotal
    }]


}, { timestamps: true });

StoreSchema.index({ location: "2dsphere" });

const Store = mongoose.model('store', StoreSchema);

export default Store;
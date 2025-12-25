import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const CouponCodeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    discountType: {
        type: String,
        enum: ["flat", "percentage"],
        default: "flat",
        required: true
    },
    discountValue: {
        type: Number,
        required: true
    },
    use: {
        type: String,
        enum: ["one", "many"],
        default: "one"
    },
    minOrderValue: {
        type: Number,
        default: 0
    },
    maxDiscountAmount: {
        type: Number // For percentage discounts, max discount cap
    },
    validFrom: {
        type: Date,
        required: true
    },
    validUntil: {
        type: Date,
        required: true
    },
    usageLimit: {
        type: Number, // Total usage limit
        default: 0 // 0 means unlimited
    },
    usageCount: {
        type: Number,
        default: 0
    },
    userEligibility: {
        type: String,
        enum: ["all", "new_user", "existing_user"],
        default: "all"
    },
    ownerType: {
        type: String,
        enum: ["admin", "seller", "retailer"],
        required: true
    },
    ownerId: {
        type: ObjectId,
        refPath: 'ownerType', // Dynamic reference based on ownerType
        required: true
    },
    storeId: {
        type: ObjectId,
        ref: 'store'
    },
    deleted: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    }
}, { timestamps: true });

const CouponCode = mongoose.model('coupon_code', CouponCodeSchema);

export default CouponCode;
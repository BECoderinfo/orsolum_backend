import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const CouponHistorySchema = new mongoose.Schema({
    couponId: {
        type: ObjectId,
        ref: 'coupon_code',
        required: true
    },
    userId: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    orderId: {
        type: ObjectId,
        ref: 'order'
    },
    discountAmount: {
        type: Number,
        required: true
    },
    orderTotalBeforeDiscount: {
        type: Number,
        required: true
    },
    orderTotalAfterDiscount: {
        type: Number,
        required: true
    },
    usedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const CouponHistory = mongoose.model('coupon_history', CouponHistorySchema);

export default CouponHistory;
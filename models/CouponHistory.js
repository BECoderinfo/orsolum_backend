import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const CouponHistorySchema = new mongoose.Schema({
    couponId: {
        type: ObjectId,
        ref: 'counpon_code',
        required: true
    },
    userId: {
        type: ObjectId,
        ref: 'user',
        required: true
    }
}, { timestamps: true });

const CounponCodeHistory = mongoose.model('counpon_history', CouponHistorySchema);

export default CounponCodeHistory;
import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const RefundSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ["LocalStore", "OnlineStore"]
    },
    cfOrderId: {
        type: String,
        required: true
    },
    cfOrderResponseId: {
        type: String,
        required: true
    },
    refundResponse: {},
    userId: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    orderId: {
        type: ObjectId,
        ref: 'order'
    },
    onlineOrderId: {
        type: ObjectId,
        ref: 'order'
    },
    amount: {
        type: Number,
        required: true
    },
    refundId: {
        type: String
    },
    cancelled: {
        type: Boolean,
        default: false
    },
    rejected: {
        type: Boolean,
        default: false
    },
    retailerId: {
        type: ObjectId,
        ref: 'user'
    },
    adminId: {
        type: ObjectId,
        ref: 'admin'
    }
}, { timestamps: true });

const Refund = mongoose.model('refund', RefundSchema);

export default Refund;
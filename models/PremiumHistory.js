import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const PremiumHistorySchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    perMonth: {
        type: Number,
        required: true
    },
    paymentId: {
        type: ObjectId,
        ref: "payment",
        required: true
    }
}, { timestamps: true });

const PremiumHistory = mongoose.model('premium_history', PremiumHistorySchema);

export default PremiumHistory;
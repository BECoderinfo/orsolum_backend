import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const CoinHistorySchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    coins: {
        type: Number,
        required: true
    },
    orderId: {
        type: ObjectId,
        ref: 'online_order',
        required: true
    },
    type: {
        type: String,
        enum: ["Added", "Deducted", "Used"]
    }
}, { timestamps: true });

const CoinHistory = mongoose.model('coin_history', CoinHistorySchema);

export default CoinHistory;
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
        refPath: 'orderModel',
        required: false // Not required initially, can be set later
    },
    orderModel: {
        type: String,
        enum: ['online_order', 'order'],
        default: 'online_order'
    },
    type: {
        type: String,
        enum: ["Added", "Deducted", "Used", "Refunded"]
    },
    description: {
        type: String,
        default: ""
    },
    orderType: {
        type: String,
        enum: ["OnlineStore", "LocalStore"],
        default: "OnlineStore"
    }
}, { timestamps: true });

const CoinHistory = mongoose.model('coin_history', CoinHistorySchema);

export default CoinHistory;
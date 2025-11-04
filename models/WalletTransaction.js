import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const WalletTransactionSchema = new mongoose.Schema({
    deliveryBoyId: { type: ObjectId, ref: "DeliveryBoy", required: true },
    type: { type: String, enum: ["CREDIT", "DEBIT"], required: true },
    source: { type: String, enum: ["DELIVERY", "INCENTIVE", "DEDUCTION", "SETTLEMENT", "ADJUSTMENT"], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    meta: {},
}, { timestamps: true });

const WalletTransaction = mongoose.model("wallet_transaction", WalletTransactionSchema);
export default WalletTransaction;
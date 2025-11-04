import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const SettlementSchema = new mongoose.Schema({
    deliveryBoyId: { type: ObjectId, ref: "DeliveryBoy", required: true },
    payments: [{ type: ObjectId, ref: "payment", required: true }],
    amount: { type: Number, required: true },
    method: { type: String, enum: ["cash", "bank_transfer", "upi"], default: "cash" },
    status: { type: String, enum: ["PENDING", "PAID", "RECONCILED"], default: "PENDING" },
    referenceId: { type: String },
    settledAt: { type: Date }
}, { timestamps: true });

const Settlement = mongoose.model("settlement", SettlementSchema);
export default Settlement;
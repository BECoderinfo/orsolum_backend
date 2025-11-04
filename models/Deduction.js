import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const DeductionSchema = new mongoose.Schema({
    deliveryBoyId: { type: ObjectId, ref: "DeliveryBoy", required: true },
    orderId: { type: ObjectId, ref: "order" },
    items: [{ label: String, amount: Number }],
    total: { type: Number, required: true },
    status: { type: String, enum: ["OPEN", "ACKNOWLEDGED", "REVERSED"], default: "OPEN" }
}, { timestamps: true });

const Deduction = mongoose.model("deduction", DeductionSchema);
export default Deduction;
import mongoose from "mongoose";

const workLogSchema = new mongoose.Schema({
    deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: "DeliveryBoy" },
    checkIn: Date,
    checkOut: Date,
    totalMinutes: Number
}, { timestamps: true });

const WorkLog = mongoose.model("WorkLog", workLogSchema);

export default WorkLog;


import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const SlotBookingSchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    storeId: {
        type: ObjectId,
        ref: 'store',
        required: true
    },
    productId: {
        type: ObjectId,
        ref: 'product',
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    userPhone: {
        type: String,
        required: true
    },
    userEmail: {
        type: String
    },
    preferredDate: {
        type: Date,
        required: true
    },
    preferredTime: {
        type: String,
        required: true
    },
    message: {
        type: String
    },
    status: {
        type: String,
        enum: ["pending", "contacted", "done", "cancelled"],
        default: "pending"
    },
    sellerNotes: {
        type: String
    },
    contactedAt: {
        type: Date
    },
    completedAt: {
        type: Date
    }
}, { timestamps: true });

const SlotBooking = mongoose.model('slot_booking', SlotBookingSchema);

export default SlotBooking;


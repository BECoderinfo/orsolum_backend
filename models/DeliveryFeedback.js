import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const DeliveryFeedbackSchema = new mongoose.Schema({
    orderId: {
        type: ObjectId,
        ref: 'order',
        required: true,
        index: true
    },
    deliveryBoyId: {
        type: ObjectId,
        ref: 'DeliveryBoy',
        required: true,
        index: true
    },
    customerId: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    tags: [{
        type: String,
        trim: true
    }],
    comments: {
        type: String,
        trim: true
    },
    submittedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

DeliveryFeedbackSchema.index({ orderId: 1, deliveryBoyId: 1 }, { unique: true });

const DeliveryFeedback = mongoose.model('DeliveryFeedback', DeliveryFeedbackSchema);

export default DeliveryFeedback;


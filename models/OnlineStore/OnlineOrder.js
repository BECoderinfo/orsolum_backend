import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const OnlineOrderSchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    cf_order_id: {
        type: String
    },
    invoiceUrl: {
        type: String
    },
    productDetails: [
        {   
            productId: {
                type: ObjectId,
                ref: 'product',
                required: true
            },
            mrp: {
                type: Number,
                required: true
            },
            qty: {
                type: String,
                required: true
            },
            productPrice: {
                type: Number,
                required: true
            },
            quantity: {
                type: Number,
                required: true
            }
        }
    ],
    address: {},
    orderId: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ["Pending", "Accepted", "Rejected", "Product shipped", "On the way", "Your Destination", "Delivered", "Cancelled"],
        default: "Pending"
    },
    isReturn: {
        type: Boolean,
        default: false
    },
    returnStatus: {
        type: String,
        enum: ["Pending", "Approved", "Rejected", "PickedUp", "Success", "Cancelled", "non"],
        default: "non"
    },
    paymentStatus: {
        type: String,
        enum: ["SUCCESS", "FAILED", "PENDING"],
        default: "PENDING"
    },
    estimatedDate: {
        type: Date
    },
    deliverdTime: {
        type: Date
    },
    summary: {
        totalAmount: { type: Number, required: true },
        discountAmount: { type: Number, required: true, default: 0 },
        shippingFee: { type: Number, required: true, default: 0 },
        donate: { type: Number, required: true },
        grandTotal: { type: Number, required: true },
        coinUsed: { type: Number, default: 0 }
    },
    refund: {
        type: Boolean,
        default: false
    },
    refundId: {
        type: String
    },
    isPremiumPurchase: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const OnlineOrder = mongoose.model('online_order', OnlineOrderSchema);

export default OnlineOrder;
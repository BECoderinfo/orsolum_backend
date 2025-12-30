import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const OrderSchema = new mongoose.Schema({
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
            productPrice: {
                type: Number,
                required: true
            },
            quantity: {
                type: Number,
                required: true
            },
            freeQuantity: {
                type: Number,
                default: 0
            },
            appliedOffers: [ // ✅ Fix: Correctly define appliedOffers as an array of objects
                {
                    type: { type: String },
                    description: { type: String }
                }
            ]
        }
    ],
    address: {},
    orderId: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ["Pending", "Accepted", "Rejected", "Product shipped", "On the way", "Out for delivery", "Your Destination", "Delivered", "Cancelled"],
        default: "Pending"
    },
    paymentStatus: {
        type: String,
        enum: ["SUCCESS", "FAILED", "PENDING"],
        default: "PENDING"
    },
    estimatedDate: {
        type: Date
    },
    deliveredTime: {
        type: Date
    },
    summary: {
        totalAmount: { type: Number, required: true },
        discountAmount: { type: Number, required: true, default: 0 },
        shippingFee: { type: Number, required: true, default: 0 },
        donate: { type: Number, required: true },
        grandTotal: { type: Number, required: true },
        coinUsed: { type: Number, default: 0 },
        coinsEarned: { type: Number, default: 0 },
        coinsCredited: { type: Boolean, default: false }
    },
    refund: {
        type: Boolean,
        default: false
    },
    refundId: {
        type: String
    },
    assignedDeliveryBoy: {
        type: ObjectId,
        ref: 'DeliveryBoy'
    },
    skippedBy: [{
        type: ObjectId,
        ref: 'DeliveryBoy',
        default: []
    }],
    acceptedAt: {
        type: Date
    },
    pickedUpAt: {
        type: Date
    },
    navigationStartedAt: {
        type: Date
    },
    reachedAt: {
        type: Date
    },
    deliveryNotes: {
        type: String
    },
    shiprocket: {
        shipment_id: { type: String },
        order_id: { type: String },
        awb_code: { type: String },
        awb: { type: String },
        status: { type: String },
        last_updated: { type: Date },
        pickup_addresses: [{
            type: ObjectId,
            ref: 'PickupAddress'
        }],
        default_pickup_address: {
            type: ObjectId,
            ref: 'PickupAddress'
        }
    }
}, { timestamps: true });

const Order = mongoose.model('order', OrderSchema);

export default Order;
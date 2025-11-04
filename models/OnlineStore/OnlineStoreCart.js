import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const OnlineStoreCartSchema = new mongoose.Schema({
    productId: {
        type: ObjectId,
        ref: 'online_product',
        required: true
    },
    unitId: {
        type: ObjectId,
        ref: 'product_unit',
        required: true
    },
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const OnlineStoreCart = mongoose.model('online_store_cart', OnlineStoreCartSchema);

export default OnlineStoreCart;
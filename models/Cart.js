import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const CartSchema = new mongoose.Schema({
    productId: {
        type: ObjectId,
        ref: 'product',
        required: true
    },
    storeId: {
        type: ObjectId,
        ref: 'store',
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

const Cart = mongoose.model('cart', CartSchema);

export default Cart;
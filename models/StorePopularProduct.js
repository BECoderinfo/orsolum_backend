import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const StorePopularProductSchema = new mongoose.Schema({
    productId: {
        type: ObjectId,
        ref: 'product',
        required: true
    },
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    storeId: {
        type: ObjectId,
        ref: 'store',
        required: true
    }
}, { timestamps: true });

const StorePopularProduct = mongoose.model('store_popular_product', StorePopularProductSchema);

export default StorePopularProduct;
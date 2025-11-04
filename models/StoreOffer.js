import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

// const StoreOfferSchema = new mongoose.Schema({
//     offer: {
//         type: String,
//         required: true
//     },
//     deleted: {
//         type: Boolean,
//         default: false
//     },
//     createdBy: {
//         type: ObjectId,
//         ref: 'user',
//         required: true
//     },
//     storeId: {
//         type: ObjectId,
//         ref: 'store',
//         required: true
//     }
// }, { timestamps: true });

const StoreOfferSchema = new mongoose.Schema({
    storeId: { type: ObjectId, ref: 'store', required: true },
    createdBy: { type: ObjectId, ref: 'user', required: true },
    title: { type: String, required: true },
    offerType: { type: String, enum: ['percentage_discount', 'buy_one_get_one', 'flat_discount'], required: true },
    discountValue: {
        type: Number,
        required: function () { return this.offerType !== 'buy_one_get_one'; }
    }, // Not required for BOGO
    minOrderValue: { type: Number, default: 0 }, // Minimum order value for discount
    selectedProducts: [{ type: ObjectId, ref: 'Product' }], // For product-specific offers
    deleted: { type: Boolean, default: false } // Soft delete flag
}, { timestamps: true });

const StoreOffer = mongoose.model('store_offer', StoreOfferSchema);

export default StoreOffer;
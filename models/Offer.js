import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const OfferSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    image: {
        type: String,
        default: null
    },
    isGlobal: {
        type: Boolean,
        default: true
    },
    storeId: {
        type: ObjectId,
        ref: 'store',
        default: null
    },
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    updatedBy: {
        type: ObjectId,
        ref: 'admin',
        default: null
    }
}, { timestamps: true });

const Offer = mongoose.model('offer', OfferSchema);

export default Offer;


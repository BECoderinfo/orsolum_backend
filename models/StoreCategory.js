import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const StoreCategorySchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    updatedBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const StoreCategory = mongoose.model('store_category', StoreCategorySchema);

export default StoreCategory;
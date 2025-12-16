import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const ProductSubCategorySchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    image: {
        type: String,
        required: true
    },
    icon: {
        type: String,
        default: null
    },
    categoryId: {
        type: ObjectId,
        ref: 'product_category',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    storeType: {
        type: String,
        enum: ['online', 'local'],
        default: 'online',
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    },
    percentageOff: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

const ProductSubCategory = mongoose.model('product_sub_category', ProductSubCategorySchema);

export default ProductSubCategory;
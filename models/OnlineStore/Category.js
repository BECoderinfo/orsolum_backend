import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const ProductCategorySchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    image: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const ProductCategory = mongoose.model('product_category', ProductCategorySchema);

export default ProductCategory;
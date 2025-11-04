import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const ProductBrandSchema = new mongoose.Schema({
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

const ProductBrand = mongoose.model('product_brand', ProductBrandSchema);

export default ProductBrand;
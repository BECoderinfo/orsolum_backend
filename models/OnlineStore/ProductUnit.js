import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

// Define the Unit Schema
const ProductUnitSchema = new mongoose.Schema({
    qty: {
        type: String,
        required: true
    },
    mrp: {
        type: Number,
        required: true
    },
    sellingPrice: {
        type: Number,
        required: true
    },
    offPer: {
        type: String
    },
    parentProduct: {
        type: ObjectId,
        ref: 'online_product',
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const ProductUnit = mongoose.model('product_unit', ProductUnitSchema);

export default ProductUnit;
import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const ProductSchema = new mongoose.Schema({
    productImages: [
        {
            type: String
        }
    ],
    productName: {
        type: String,
        required: true
    },
    qty: {
        type: String
    },
    companyName: {
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
    information: {
        type: String,
        required: true
    },
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    updatedBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    storeId: {
        type: ObjectId,
        ref: 'store',
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ["P", "A", "R"], // P = Pending, A = Accepted, R = Rejected
        default: "P"
    },
    details: [
        {
            title: String,
            details: String,
            icon: String
        }
    ],
    offPer: {
        type: String
    }
}, { timestamps: true });

const Product = mongoose.model('product', ProductSchema);

export default Product;
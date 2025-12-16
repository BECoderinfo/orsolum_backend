import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const OnlineProductSchema = new mongoose.Schema({
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
    deleted: {
        type: Boolean,
        default: false
    },
    trending: {
        type: Boolean,
        default: false
    },
    images: [{
        type: String
    }],
    name: {
        type: String,
        required: true
    },
    information: {
        type: String,
        required: true
    },
    manufacturer: {
        type: String,
        required: true
    },
    details: [
        {
            title: String,
            details: String
        }
    ],
    categoryId: {
        type: ObjectId,
        ref: 'product_category',
        required: true
    },
    subCategoryId: {
        type: ObjectId,
        ref: 'product_sub_category',
        required: true
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    ratingCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

const OnlineProduct = mongoose.model('online_product', OnlineProductSchema);

export default OnlineProduct;
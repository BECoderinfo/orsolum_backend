import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const CouponCodeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    use: {
        type: String,
        enum: ["one", "many"],
        default: "one"
    },
    minPrice: {
        type: Number
    },
    upto: {
        type: Number
    },
    discount: {
        type: Number,
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    }
}, { timestamps: true });

const CounponCode = mongoose.model('counpon_code', CouponCodeSchema);

export default CounponCode;
import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const ReturnSchema = new mongoose.Schema({
    order: {
        type: ObjectId,
        ref: "Order",
        required: true,
    },
    reason: {
        type: String,
        required: true,
    },
    returnImage : {
        type: String
    },
    comment: {
        type: String,
    }
}, { timestamps: true });

const Return = mongoose.model('return', ReturnSchema);

export default Return;

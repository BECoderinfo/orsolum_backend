import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const CropSchema = new mongoose.Schema({
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

const CropModel = mongoose.model('crop', CropSchema);

export default CropModel;
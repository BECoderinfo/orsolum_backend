import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const UserCropSchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    crop: {
        type: ObjectId,
        ref: 'crop',
        required: true
    },
    farmId: {
        type: ObjectId,
        ref: 'farm',
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    },
    sownTheCrop: {
        type: Boolean
    },
    sowingType: {
        type: String
    },
    sowingDate: {
        type: Date
    },
    plotName: {
        type: String
    },
    plotArea: {
        type: String
    },
    plotAreaUnit: {
        type: String
    },
    plotSoilTexture: {
        type: String
    },
    irrigationInfo: {
        type: String
    }
}, { timestamps: true });

const UserCropModel = mongoose.model('user_crop', UserCropSchema);

export default UserCropModel;
import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const FarmSchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    village: {
        type: String,
        required: true
    },
    taluka: {
        type: String,
        required: true
    },
    district: {
        type: String,
        required: false
    },
    surveyNumber: {
        type: String,
        required: false
    },
    landArea: {
        type: Number,
        required: false
    },
    cultivatedLand: {
        type: Number,
        required: false
    },
    irrigatedLand: {
        type: Number,
        required: false
    },
    soilQuality: {
        type: String,
        required: false
    },
    waterQuality: {
        type: String,
        required: false
    },
    expenditureOnTractors: {
        type: Number,
        required: false
    },
    expenditureOnFerilizer: {
        type: Number,
        required: false
    },
    otherExpense: {
        type: Number,
        required: false
    },
    productionPerAcre: {
        type: Number,
        required: false
    },
    totalTrees: {
        type: Number,
        required: false
    }
}, { timestamps: true });

const FarmModel = mongoose.model('farm', FarmSchema);

export default FarmModel;
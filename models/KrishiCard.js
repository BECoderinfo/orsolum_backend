import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const KrishuSchema = new mongoose.Schema({
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
    farmerName: {
        type: String,
        required: false
    },
    dob: {
        type: Date,
        required: false
    },
    totalLand: {
        type: Number,
        required: false
    },
    landPiece: {
        type: Number,
        required: false
    },
    cultivableLand: {
        type: Number,
        required: false
    },
    farmingExpense: {
        type: Number,
        required: false
    },
    farmingIncome: {
        type: Number,
        required: false
    },
    krishiCardBalance: {
        type: Number,
        required: false
    }
}, { timestamps: true });

const KrishiModel = mongoose.model('krishi_card', KrishuSchema);

export default KrishiModel;
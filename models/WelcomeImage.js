import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const WelcomeImageSchema = new mongoose.Schema({
    imagePath: {
        type: String,
        required: true
    },
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    updatedBy: {
        type: ObjectId,
        ref: 'admin',
        default: null
    }
}, { timestamps: true });

const WelcomeImage = mongoose.model('welcome_image', WelcomeImageSchema);

export default WelcomeImage;


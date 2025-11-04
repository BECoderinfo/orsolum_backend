import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const ReelsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    video: {
        type: String,
        required: true
    },
    thumbnail: {
        type: String,
        required: true
    },
    likes: [
        {
            type: ObjectId,
            ref: 'user'
        }
    ],
    saved: [
        {
            type: ObjectId,
            ref: 'user'
        }
    ],
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

const Reel = mongoose.model('reel', ReelsSchema);

export default Reel;
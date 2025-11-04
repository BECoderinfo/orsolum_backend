import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const ArticleSchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    },
    title: {
        type: String
    },
    description: {
        type: String
    },
    image: {
        type: String
    }
}, { timestamps: true });

const ArticleModel = mongoose.model('article', ArticleSchema);

export default ArticleModel;
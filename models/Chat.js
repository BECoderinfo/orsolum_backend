import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const ChatSchema = new mongoose.Schema({
    user: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    admin: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    chatType: {
        type: String,
        enum: ['general', 'farming_tools', 'agriculture_advice'],
        default: 'general'
    },
    analysisStatus: {
        type: String,
        enum: ['in_progress', 'completed'],
        default: 'in_progress'
    },
    analysisSummary: {
        type: String,
        trim: true,
        default: null
    },
    analysisCompletedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

const Chat = mongoose.model('chat', ChatSchema);

export default Chat;
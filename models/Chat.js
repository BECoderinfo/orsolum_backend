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
    }
}, { timestamps: true });

const Chat = mongoose.model('chat', ChatSchema);

export default Chat;
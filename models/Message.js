import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const MessageSchema = new mongoose.Schema({
    senderUser: {
        type: ObjectId,
        ref: 'user'
    },
    senderAdmin: {
        type: ObjectId,
        ref: 'admin'
    },
    senderType: {
        type: String,
        enum: ['user', 'admin']
    },
    chat: {
        type: ObjectId,
        ref: 'chat',
        required: true
    },
    message: {
        type: String,
        trim: true,
        required: true
    },
    messageType: {
        type: String,
        enum: ['image', 'gif', 'video', 'text']
    }
}, { timestamps: true });

const Message = mongoose.model('message', MessageSchema);

export default Message;
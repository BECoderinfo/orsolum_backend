import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import mongoose from 'mongoose';
import { signedUrl } from '../helper/s3.config.js';

const { ObjectId } = mongoose.Types;

export const uploadChatImage = async (req, res) => {
    try {
        signedUrl(req, res, 'chat/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadChatImage', error, req, res);
    }
}

export const createChat = async (io, socket, body, callback) => {
    try {

        const user = await User.findById(socket.user._id);
        if (!user) {
            return callback("Something went wrong")
        }

        // check chat is exist or not
        const isChatExist = await Chat.aggregate([
            {
                $match: {
                    user: new ObjectId(socket.user._id)
                }
            }
        ]);

        if (isChatExist[0]) {
            return callback({ data: isChatExist[0] })
        }

        const data = {
            user: socket.user._id,
            admin: "672358eb4ef46ad834446c8e"
        };

        let newChat = new Chat(data);
        newChat = await newChat.save();

        return callback({ data: newChat })
    } catch (error) {
        console.error("error", error);
        return callback('Something went wrong error.')
    }
};

export const sendMessage = async (io, socket, body, callback) => {
    try {
        const { message, chat, senderType, messageType } = body;

        const chatDetail = await Chat.findById(chat);
        if (!chatDetail) {
            return callback('chat not found');
        }

        let senderUser;
        let senderAdmin;
        if (senderType === "user") {
            senderUser = socket.user._id;
            senderAdmin = "672358eb4ef46ad834446c8e";
        } else {
            senderUser = "672358eb4ef46ad834446c8e";
            senderAdmin = socket.user._id;
        }

        let sendMessageDB = new Message({ senderUser, senderAdmin, senderType, message, chat, messageType });
        sendMessageDB = await sendMessageDB.save();

        await sendMessageDB.populate("chat");
        sendMessageDB.sender = socket.user._id;
        console.log('sendMessageDB', sendMessageDB)

        return callback({ data: sendMessageDB })
    } catch (error) {
        return callback('Something went wrong.')
    }
};

export const getMessages = async (io, socket, body, callback) => {
    try {
        const { id } = body;

        const chat = await Chat.findById(id);
        if (!chat) {
            return callback("Chat not found.")
        }

        const findMessages = await Message.aggregate([
            {
                $match: {
                    chat: new ObjectId(id)
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]);

        return callback({ data: findMessages })
    } catch (error) {
        return callback('Something went wrong.')
    }
};
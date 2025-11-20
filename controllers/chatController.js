import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import mongoose from 'mongoose';
import { signedUrl } from '../helper/s3.config.js';
import { sendAdminChatReply } from './agriAdviceAdminReply.js';

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

// REST API: Create or get chat
export const createOrGetChat = async (req, res) => {
    try {
        const userId = req.user._id;

        // Check if chat already exists
        const existingChat = await Chat.findOne({ user: userId });
        if (existingChat) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                data: existingChat
            });
        }

        // Create new chat
        const adminId = "672358eb4ef46ad834446c8e"; // Default admin ID
        const newChat = new Chat({
            user: userId,
            admin: adminId
        });

        await newChat.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: newChat
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('createOrGetChat', error, req, res);
    }
};

// REST API: Send message
export const sendMessageRest = async (req, res) => {
    try {
        const { message, chatId, messageType } = req.body;
        const userId = req.user._id;

        if (!message || !chatId) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Message and chatId are required"
            });
        }

        // Verify chat exists and belongs to user
        const chat = await Chat.findOne({ _id: chatId, user: userId });
        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Chat not found"
            });
        }

        const adminId = "672358eb4ef46ad834446c8e";

        // Create message
        const newMessage = new Message({
            senderUser: userId,
            senderAdmin: adminId,
            senderType: "user",
            message,
            chat: chatId,
            messageType: messageType || "text"
        });

        await newMessage.save();
        await newMessage.populate("chat");

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: newMessage
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('sendMessageRest', error, req, res);
    }
};

// REST API: Get messages
export const getMessagesRest = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user._id;

        // Verify chat belongs to user
        const chat = await Chat.findOne({ _id: chatId, user: userId });
        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Chat not found"
            });
        }

        const messages = await Message.find({ chat: chatId })
            .sort({ createdAt: 1 })
            .populate("senderUser", "name image")
            .populate("senderAdmin", "name image");

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: messages
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getMessagesRest', error, req, res);
    }
};

// REST API: Get user's chat
export const getUserChat = async (req, res) => {
    try {
        const userId = req.user._id;

        const chat = await Chat.findOne({ user: userId })
            .populate("user", "name image phone")
            .populate("admin", "name image");

        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Chat not found. Please create a chat first."
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: chat
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getUserChat', error, req, res);
    }
};

// ==================== FARMING TOOLS CHAT APIs ====================

// REST API: Create or get farming tools chat
export const createOrGetFarmingToolsChat = async (req, res) => {
    try {
        const userId = req.user._id;

        // Check if farming tools chat already exists
        const existingChat = await Chat.findOne({ 
            user: userId, 
            chatType: 'farming_tools' 
        });
        
        if (existingChat) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                data: existingChat
            });
        }

        // Create new farming tools chat
        const adminId = "672358eb4ef46ad834446c8e";
        const newChat = new Chat({
            user: userId,
            admin: adminId,
            chatType: 'farming_tools'
        });

        await newChat.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: newChat
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('createOrGetFarmingToolsChat', error, req, res);
    }
};

// REST API: Get user's farming tools chat
export const getUserFarmingToolsChat = async (req, res) => {
    try {
        const userId = req.user._id;

        const chat = await Chat.findOne({ 
            user: userId, 
            chatType: 'farming_tools' 
        })
            .populate("user", "name image phone")
            .populate("admin", "name image");

        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Farming tools chat not found. Please create a chat first."
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: chat
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getUserFarmingToolsChat', error, req, res);
    }
};

// REST API: Send message in farming tools chat
export const sendFarmingToolsMessage = async (req, res) => {
    try {
        const { message, chatId, messageType } = req.body;
        const userId = req.user._id;

        if (!message || !chatId) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Message and chatId are required"
            });
        }

        // Verify chat exists, belongs to user, and is farming_tools type
        const chat = await Chat.findOne({ 
            _id: chatId, 
            user: userId, 
            chatType: 'farming_tools' 
        });
        
        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Farming tools chat not found"
            });
        }

        const adminId = "672358eb4ef46ad834446c8e";

        // Create message
        const newMessage = new Message({
            senderUser: userId,
            senderAdmin: adminId,
            senderType: "user",
            message,
            chat: chatId,
            messageType: messageType || "text"
        });

        await newMessage.save();
        await newMessage.populate("chat");

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: newMessage
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('sendFarmingToolsMessage', error, req, res);
    }
};

// REST API: Get messages from farming tools chat
export const getFarmingToolsMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user._id;

        // Verify chat belongs to user and is farming_tools type
        const chat = await Chat.findOne({ 
            _id: chatId, 
            user: userId, 
            chatType: 'farming_tools' 
        });
        
        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Farming tools chat not found"
            });
        }

        const messages = await Message.find({ chat: chatId })
            .sort({ createdAt: 1 })
            .populate("senderUser", "name image")
            .populate("senderAdmin", "name image");

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: messages
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getFarmingToolsMessages', error, req, res);
    }
};

// ==================== AGRICULTURE ADVICE CHAT APIs ====================

// REST API: Create or get agriculture advice chat
export const createOrGetAgricultureAdviceChat = async (req, res) => {
    try {
        const userId = req.user._id;

        // Check if agriculture advice chat already exists
        const existingChat = await Chat.findOne({ 
            user: userId, 
            chatType: 'agriculture_advice' 
        });
        
        if (existingChat) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                data: existingChat
            });
        }

        // Create new agriculture advice chat
        const adminId = "672358eb4ef46ad834446c8e";
        const newChat = new Chat({
            user: userId,
            admin: adminId,
            chatType: 'agriculture_advice'
        });

        await newChat.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: newChat
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('createOrGetAgricultureAdviceChat', error, req, res);
    }
};

// REST API: Get user's agriculture advice chat
export const getUserAgricultureAdviceChat = async (req, res) => {
    try {
        const userId = req.user._id;

        const chat = await Chat.findOne({ 
            user: userId, 
            chatType: 'agriculture_advice' 
        })
            .populate("user", "name image phone")
            .populate("admin", "name image");

        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Agriculture advice chat not found. Please create a chat first."
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: chat
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getUserAgricultureAdviceChat', error, req, res);
    }
};

// Helper function to detect if message is an image URL
const isImageUrl = (message) => {
    if (!message) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const urlPattern = /^https?:\/\/.+/i;
    return urlPattern.test(message) || imageExtensions.some(ext => message.toLowerCase().includes(ext));
};

// Helper function to build smart auto-reply message based on content
const buildAutoReplyMessage = (userMessage = "", messageType = "text") => {
    const rawMessage = (userMessage || "").trim();
    const message = rawMessage.toLowerCase();

    // Quick acknowledgement for short confirmations
    const acknowledgementKeywords = ['ok', 'okay', 'thanks', 'thank you', 'noted', 'done', 'wait', 'update', 'please update', 'sure'];
    if (acknowledgementKeywords.some((keyword) => message.includes(keyword))) {
        return "Thank you for the update! Our agri doctor is working on your case. We will notify you as soon as the analysis and recommendations are ready. Meanwhile, feel free to share more details or images if available.";
    }
    
    // If message type is image or message is an image URL
    if (messageType === "image" || isImageUrl(userMessage)) {
        return "Thank you for sharing the image! Our agri doctor is reviewing your crop/soil image. We'll provide detailed analysis and recommendations shortly. Please wait for our expert advice.";
    }
    
    // If message is empty or very short
    if (message.length < 3) {
        return "Thank you for your message! Please describe your agricultural problem in detail or share images of your crop/soil for better assistance.";
    }
    
    // Keyword-based smart replies
    const keywordReplies = {
        // Pest related
        pest: {
            keywords: ['pest', 'insect', 'bug', 'कीड़े', 'कीट', 'pests', 'insects'],
            reply: "For pest control, I recommend:\n1. Use neem oil spray (2-3ml per liter water) - effective and organic\n2. Apply chemical pesticides like Imidacloprid or Chlorpyriphos if infestation is severe\n3. Remove affected leaves/parts immediately\n4. Maintain proper spacing between plants for air circulation\n5. Use yellow sticky traps for monitoring\n\nPlease share images of the affected crop for specific treatment recommendations."
        },
        // Disease related
        disease: {
            keywords: ['disease', 'sick', 'infected', 'fungus', 'bacterial', 'rot', 'wilt', 'blight', 'रोग', 'बीमारी'],
            reply: "For crop diseases, here's what you can do:\n1. Identify the disease type (fungal/bacterial/viral) - share images for accurate diagnosis\n2. Remove and destroy infected plant parts\n3. Apply fungicides like Mancozeb or Carbendazim for fungal diseases\n4. Use copper-based fungicides for bacterial issues\n5. Ensure proper drainage and avoid over-watering\n6. Maintain crop rotation to prevent disease buildup\n\nPlease upload clear images of affected areas for precise treatment."
        },
        // Fertilizer related
        fertilizer: {
            keywords: ['fertilizer', 'fertiliser', 'nutrient', 'npk', 'manure', 'compost', 'खाद', 'उर्वरक'],
            reply: "For fertilizer recommendations:\n1. **NPK Balance**: Use 19:19:19 for balanced nutrition, or specific ratios based on crop stage\n2. **Organic Options**: Compost, vermicompost, or farmyard manure (FYM)\n3. **Application**: Apply during early morning or evening, avoid direct sunlight\n4. **Frequency**: Every 15-20 days during growing season\n5. **Soil Testing**: Get soil tested to know exact nutrient requirements\n\nWhich crop are you growing? Share crop name and growth stage for specific fertilizer recommendations."
        },
        // Watering related
        water: {
            keywords: ['water', 'irrigation', 'watering', 'dry', 'wilt', 'moisture', 'पानी', 'सिंचाई'],
            reply: "For proper irrigation:\n1. **Frequency**: Most crops need water every 2-3 days in summer, 4-5 days in winter\n2. **Timing**: Early morning (6-8 AM) or evening (5-7 PM) is best\n3. **Amount**: Water until soil is moist 6-8 inches deep\n4. **Signs of Over-watering**: Yellow leaves, root rot\n5. **Signs of Under-watering**: Dry soil, drooping leaves\n6. **Drip Irrigation**: Most efficient method - saves 40-60% water\n\nWhat crop are you growing? Share details for crop-specific watering schedule."
        },
        // Harvest related
        harvest: {
            keywords: ['harvest', 'harvesting', 'ripe', 'mature', 'कटाई', 'फसल'],
            reply: "For harvesting:\n1. **Timing**: Harvest at right maturity stage - too early or late affects quality\n2. **Morning Harvest**: Best time is early morning when temperature is cool\n3. **Signs of Readiness**: Check color, size, and firmness based on crop type\n4. **Tools**: Use clean, sharp tools to avoid damage\n5. **Storage**: Store in cool, dry place immediately after harvest\n\nWhich crop are you harvesting? Share crop name for specific harvesting guidelines."
        },
        // Soil related
        soil: {
            keywords: ['soil', 'land', 'earth', 'fertility', 'ph', 'मिट्टी', 'भूमि'],
            reply: "For soil health:\n1. **Soil Testing**: Get pH and nutrient levels tested\n2. **pH Level**: Most crops prefer 6.0-7.5 pH range\n3. **Organic Matter**: Add compost or FYM to improve soil structure\n4. **Drainage**: Ensure proper drainage - waterlogged soil harms roots\n5. **Crop Rotation**: Rotate crops to maintain soil fertility\n6. **Cover Crops**: Plant legumes to fix nitrogen naturally\n\nShare your soil type (clay/sandy/loamy) and crop for specific recommendations."
        },
        // General protection
        protect: {
            keywords: ['protect', 'save', 'prevent', 'safety', 'care', 'बचाएं', 'सुरक्षा'],
            reply: "To protect your crops:\n1. **Regular Monitoring**: Check crops daily for early problem detection\n2. **Preventive Measures**: Use organic sprays before problems appear\n3. **Proper Spacing**: Maintain recommended spacing for air circulation\n4. **Weed Control**: Remove weeds regularly - they compete for nutrients\n5. **Mulching**: Use organic mulch to retain moisture and prevent weeds\n6. **Net Protection**: Use nets for bird/insect protection if needed\n\nWhat specific problem are you facing? Share details or images for targeted solutions."
        }
    };
    
    // Check for keywords and return relevant reply
    for (const [category, data] of Object.entries(keywordReplies)) {
        const foundKeyword = data.keywords.some(keyword => message.includes(keyword));
        if (foundKeyword) {
            return data.reply;
        }
    }
    
    // Default reply for general questions
    return `Thank you for your question! Our agri expert is analyzing your query: "${rawMessage}".

For better assistance, please:
1. Share clear images of your crop/soil
2. Mention your crop name and growth stage
3. Describe the problem in detail

We'll provide detailed recommendations shortly.`;
};

// REST API: Send message in agriculture advice chat
export const sendAgricultureAdviceMessage = async (req, res) => {
    try {
        const { message, chatId, messageType, autoReply = true } = req.body;
        
        // Validate user authentication
        if (!req.user || !req.user._id) {
            return res.status(status.Unauthorized).json({
                status: jsonStatus.Unauthorized,
                success: false,
                message: "User authentication required"
            });
        }

        const userId = req.user._id;

        if (!message) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Message is required"
            });
        }

        let chat = null;

        // If chatId is provided, try to find it (only if it belongs to this user and is agriculture_advice type)
        if (chatId) {
            try {
                chat = await Chat.findOne({ 
                    _id: chatId, 
                    user: userId, 
                    chatType: 'agriculture_advice' 
                });
            } catch (findError) {
                // Silently continue - will find/create user's chat below
            }
        }

        // If chat not found, try to find existing agriculture_advice chat for this user
        if (!chat) {
            try {
                // Convert userId to ObjectId if it's a string
                const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
                    ? (typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId)
                    : userId;
                
                chat = await Chat.findOne({ 
                    user: userObjectId, 
                    chatType: 'agriculture_advice' 
                });
            } catch (findError) {
                // Silently continue - will create new chat below
            }
        }

        // If still no chat found, create a new one
        if (!chat) {
            try {
                const adminId = "672358eb4ef46ad834446c8e";
                chat = new Chat({
                    user: userId,
                    admin: adminId,
                    chatType: 'agriculture_advice'
                });
                await chat.save();
            } catch (createError) {
                console.error(`[AgriAdvice] Error creating chat for user ${userId}:`, createError.message);
                return res.status(status.InternalServerError).json({
                    status: jsonStatus.InternalServerError,
                    success: false,
                    message: `Failed to create chat: ${createError.message}`
                });
            }
        }

        // Ensure chat exists and has required fields
        if (!chat || !chat._id) {
            return res.status(status.InternalServerError).json({
                status: jsonStatus.InternalServerError,
                success: false,
                message: "Failed to resolve chat. Please try again."
            });
        }

        const chatIdToUse = chat._id.toString();
        const adminId = (chat.admin && chat.admin.toString()) || "672358eb4ef46ad834446c8e";

        // Create user message
        const newMessage = new Message({
            senderUser: userId,
            senderAdmin: adminId,
            senderType: "user",
            message,
            chat: chatIdToUse,
            messageType: messageType || "text"
        });

        await newMessage.save();
        await newMessage.populate("chat");

        // Auto-reply from admin
        let adminReplyMessage = null;
        if (autoReply) {
            try {
                const autoReplyText = buildAutoReplyMessage(message, messageType || "text");
                const adminReplyResult = await sendAdminChatReply({
                    chatId: chatIdToUse,
                    message: autoReplyText,
                    type: "text"
                });
                adminReplyMessage = adminReplyResult.data?.data || null;
            } catch (adminErr) {
                console.error("Auto admin reply failed:", adminErr.message || adminErr);
                // Don't fail the request if auto-reply fails, just log it
            }
        }

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: newMessage,
            chatId: chatIdToUse,
            adminReply: adminReplyMessage
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('sendAgricultureAdviceMessage', error, req, res);
    }
};

// REST API: Get messages from agriculture advice chat
export const getAgricultureAdviceMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user._id;

        // Verify chat belongs to user and is agriculture_advice type
        const chat = await Chat.findOne({ 
            _id: chatId, 
            user: userId, 
            chatType: 'agriculture_advice' 
        });
        
        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Agriculture advice chat not found"
            });
        }

        const messages = await Message.find({ chat: chatId })
            .sort({ createdAt: 1 })
            .populate("senderUser", "name image")
            .populate("senderAdmin", "name image");

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: messages
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getAgricultureAdviceMessages', error, req, res);
    }
};

// ==================== WELCOME SCREEN & SUGGESTED QUESTIONS APIs ====================

// Get suggested questions for farming tools
export const getFarmingToolsSuggestedQuestions = async (req, res) => {
    try {
        const suggestedQuestions = [
            "Which farming tools are best for wheat cultivation?",
            "What fertilizer is best for rice crops?",
            "How often should I water my crops?",
            "What are the best tools for soil preparation?",
            "How can I protect my crops from pests?",
            "What is the best time to harvest wheat?",
            "Which tools are needed for organic farming?",
            "How to maintain farming equipment?"
        ];

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                questions: suggestedQuestions,
                chatType: "farming_tools"
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getFarmingToolsSuggestedQuestions', error, req, res);
    }
};

// Get suggested questions for agriculture advice
export const getAgricultureAdviceSuggestedQuestions = async (req, res) => {
    try {
        const suggestedQuestions = [
            "How can I protect my crops from pests?",
            "What fertilizer is best for my crops?",
            "How often should I water my wheat field?",
            "What are the symptoms of crop diseases?",
            "How to improve soil fertility?",
            "What is the best time to sow rice in North India?",
            "How to identify nutrient deficiency in plants?",
            "What are organic farming practices?"
        ];

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                questions: suggestedQuestions,
                chatType: "agriculture_advice"
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getAgricultureAdviceSuggestedQuestions', error, req, res);
    }
};

// Get welcome content for farming tools
export const getFarmingToolsWelcomeContent = async (req, res) => {
    try {
        const welcomeContent = {
            title: "Welcome To Farming Tools Of Orsolum",
            description: "Tell about your farming tools requirements by writing down below and you can upload images of your tools for better understanding.",
            chatType: "farming_tools",
            callToAction: "START BY ASKING"
        };

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: welcomeContent
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getFarmingToolsWelcomeContent', error, req, res);
    }
};

// Get welcome content for agriculture advice
export const getAgricultureAdviceWelcomeContent = async (req, res) => {
    try {
        const welcomeContent = {
            title: "Welcome To Agricultural Advice Of Orsolum",
            description: "Tell about your agricultural problems by writing down below and you can upload images of your crop for better understand for your crop doctors.",
            chatType: "agriculture_advice",
            callToAction: "START BY ASKING"
        };

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: welcomeContent
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getAgricultureAdviceWelcomeContent', error, req, res);
    }
};

// Helper function to format date for date separators
const formatDateForSeparator = (date) => {
    const today = new Date();
    const messageDate = new Date(date);
    
    // Reset time to compare only dates
    today.setHours(0, 0, 0, 0);
    messageDate.setHours(0, 0, 0, 0);
    
    const diffTime = today - messageDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    if (diffDays === 0) {
        return "Today";
    } else if (diffDays === 1) {
        return "Yesterday";
    } else if (diffDays < 7) {
        return days[messageDate.getDay()];
    } else {
        return `${days[messageDate.getDay()]}, ${messageDate.getDate()} ${months[messageDate.getMonth()]}`;
    }
};

// Helper function to format time for message timestamps
const formatMessageTime = (date) => {
    const messageDate = new Date(date);
    const hours = messageDate.getHours();
    const minutes = messageDate.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${displayHours}:${displayMinutes} ${ampm}`;
};

// Update getFarmingToolsMessages to include formatted timestamps and date separators
export const getFarmingToolsMessagesFormatted = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user._id;

        // Verify chat belongs to user and is farming_tools type
        const chat = await Chat.findOne({ 
            _id: chatId, 
            user: userId, 
            chatType: 'farming_tools' 
        });
        
        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Farming tools chat not found"
            });
        }

        const messages = await Message.find({ chat: chatId })
            .sort({ createdAt: 1 })
            .populate("senderUser", "name image")
            .populate("senderAdmin", "name image");

        // Format messages with timestamps and add date separators
        const formattedMessages = [];
        let lastDate = null;

        messages.forEach((message, index) => {
            const messageDate = new Date(message.createdAt);
            const currentDate = messageDate.toDateString();
            
            // Add date separator if date changed
            if (lastDate !== currentDate) {
                formattedMessages.push({
                    type: 'date_separator',
                    date: formatDateForSeparator(message.createdAt),
                    rawDate: message.createdAt
                });
                lastDate = currentDate;
            }

            // Format message with timestamp
            formattedMessages.push({
                _id: message._id,
                senderUser: message.senderUser,
                senderAdmin: message.senderAdmin,
                senderType: message.senderType,
                message: message.message,
                chat: message.chat,
                messageType: message.messageType,
                createdAt: message.createdAt,
                updatedAt: message.updatedAt,
                formattedTime: formatMessageTime(message.createdAt),
                timestamp: message.createdAt
            });
        });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: formattedMessages
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getFarmingToolsMessagesFormatted', error, req, res);
    }
};

// Update getAgricultureAdviceMessages to include formatted timestamps and date separators
export const getAgricultureAdviceMessagesFormatted = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user._id;

        // Verify chat belongs to user and is agriculture_advice type
        const chat = await Chat.findOne({ 
            _id: chatId, 
            user: userId, 
            chatType: 'agriculture_advice' 
        });
        
        if (!chat) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Agriculture advice chat not found"
            });
        }

        const messages = await Message.find({ chat: chatId })
            .sort({ createdAt: 1 })
            .populate("senderUser", "name image")
            .populate("senderAdmin", "name image");

        // Format messages with timestamps and add date separators
        const formattedMessages = [];
        let lastDate = null;

        messages.forEach((message, index) => {
            const messageDate = new Date(message.createdAt);
            const currentDate = messageDate.toDateString();
            
            // Add date separator if date changed
            if (lastDate !== currentDate) {
                formattedMessages.push({
                    type: 'date_separator',
                    date: formatDateForSeparator(message.createdAt),
                    rawDate: message.createdAt
                });
                lastDate = currentDate;
            }

            // Format message with timestamp
            formattedMessages.push({
                _id: message._id,
                senderUser: message.senderUser,
                senderAdmin: message.senderAdmin,
                senderType: message.senderType,
                message: message.message,
                chat: message.chat,
                messageType: message.messageType,
                createdAt: message.createdAt,
                updatedAt: message.updatedAt,
                formattedTime: formatMessageTime(message.createdAt),
                timestamp: message.createdAt
            });
        });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: formattedMessages
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getAgricultureAdviceMessagesFormatted', error, req, res);
    }
};

// Update createOrGetFarmingToolsChat to send auto welcome message
export const createOrGetFarmingToolsChatWithWelcome = async (req, res) => {
    try {
        const userId = req.user._id;

        // Check if farming tools chat already exists
        const existingChat = await Chat.findOne({ 
            user: userId, 
            chatType: 'farming_tools' 
        });
        
        if (existingChat) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                data: existingChat,
                isNewChat: false
            });
        }

        // Create new farming tools chat
        const adminId = "672358eb4ef46ad834446c8e";
        const newChat = new Chat({
            user: userId,
            admin: adminId,
            chatType: 'farming_tools'
        });

        await newChat.save();

        // Send auto welcome message from admin
        const welcomeMessage = new Message({
            senderUser: userId,
            senderAdmin: adminId,
            senderType: "admin",
            message: "Hi, I am Eileen Altenwer. How can I help you?",
            chat: newChat._id,
            messageType: "text"
        });

        await welcomeMessage.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: newChat,
            isNewChat: true,
            welcomeMessage: welcomeMessage
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('createOrGetFarmingToolsChatWithWelcome', error, req, res);
    }
};

// Update createOrGetAgricultureAdviceChat to send auto welcome message
export const createOrGetAgricultureAdviceChatWithWelcome = async (req, res) => {
    try {
        const userId = req.user._id;

        // Check if agriculture advice chat already exists
        const existingChat = await Chat.findOne({ 
            user: userId, 
            chatType: 'agriculture_advice' 
        });
        
        if (existingChat) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                data: existingChat,
                isNewChat: false
            });
        }

        // Create new agriculture advice chat
        const adminId = "672358eb4ef46ad834446c8e";
        const newChat = new Chat({
            user: userId,
            admin: adminId,
            chatType: 'agriculture_advice'
        });

        await newChat.save();

        // Send auto welcome message from admin
        const welcomeMessage = new Message({
            senderUser: userId,
            senderAdmin: adminId,
            senderType: "admin",
            message: "Hi, I am Eileen Altenwer. How can I help you?",
            chat: newChat._id,
            messageType: "text"
        });

        await welcomeMessage.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: newChat,
            isNewChat: true,
            welcomeMessage: welcomeMessage
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('createOrGetAgricultureAdviceChatWithWelcome', error, req, res);
    }
};
import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import mongoose from 'mongoose';
import { signedUrl } from '../helper/s3.config.js';
import { sendAdminChatReply } from './agriAdviceAdminReply.js';
import { generateAgriAdviceAiReply } from '../helper/agriAdviceAi.js';

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
    const acknowledgementKeywords = ['ok', 'okay', 'thanks', 'thank you', 'noted', 'done', 'wait', 'update', 'please update', 'sure', 'noted', 'waiting'];
    if (acknowledgementKeywords.some((keyword) => message.includes(keyword))) {
        return "Thank you for the update! Our agri doctor is working on your case. We will notify you as soon as the analysis and recommendations are ready. Meanwhile, feel free to share more details or images if available.";
    }

    const timelineKeywords = ['how long', 'time', 'when', 'status', 'progress', 'analysis', 'update me', 'waiting for', 'ready'];
    if (timelineKeywords.some((keyword) => message.includes(keyword))) {
        return "Thanks for checking in! Our agri doctor usually takes 15‑30 minutes to review shared details. We'll notify you as soon as the analysis is ready. Please keep the chat open and feel free to share more images or information while you wait.";
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
            reply: "For pest control: 1) Spray neem oil 2-3 ml per liter for an organic start. 2) If infestation is heavy, use Imidacloprid or Chlorpyriphos as per label dose. 3) Remove badly affected leaves/pods and destroy them. 4) Keep proper spacing for airflow and avoid waterlogging. 5) Install yellow sticky traps to monitor adults. Share clear images so we can fine-tune the treatment."
        },
        // Disease related
        disease: {
            keywords: ['disease', 'diseases', 'sick', 'ill', 'illness', 'infected', 'fungus', 'bacterial', 'rot', 'wilt', 'blight', 'रोग', 'बीमारी'],
            reply: "Thanks for sharing the concern. Please: 1) Send close-up images so we can identify the pathogen. 2) Remove and dispose of heavily infected leaves/pods. 3) Spray Mancozeb 2.5–3 g per liter for fungal issues or Copper Oxychloride 3 g per liter for bacterial cases every 7 days. 4) Keep the plot well-drained and avoid overhead irrigation. 5) After control, apply Trichoderma or neem-cake to rebuild soil health. Share crop stage and symptoms for exact doses."
        },
        // Fertilizer related
        fertilizer: {
            keywords: ['fertilizer', 'fertiliser', 'nutrient', 'npk', 'manure', 'compost', 'खाद', 'उर्वरक'],
            reply: "For fertilizer planning: 1) Use NPK 19:19:19 foliar spray for balanced feeding unless crop stage demands another ratio. 2) Improve soil with compost, vermicompost or FYM. 3) Apply fertilizers early morning or evening to avoid burn. 4) Repeat every 15–20 days during active growth. 5) Conduct a soil test to fine-tune nutrients. Tell us the crop and stage for exact recommendations."
        },
        // Watering related
        water: {
            keywords: ['water', 'irrigation', 'watering', 'dry', 'wilt', 'moisture', 'पानी', 'सिंचाई'],
            reply: "For irrigation: 1) In summer water every 2–3 days; in winter every 4–5 days unless rain occurs. 2) Prefer early morning or evening slots. 3) Ensure moisture reaches 6–8 inches depth. 4) Watch for over-watering signs like yellow leaves and root rot. 5) Wilting or dry soil indicates under-watering. 6) If possible, switch to drip irrigation to save 40–60% water. Tell us your crop for a precise schedule."
        },
        // Harvest related
        harvest: {
            keywords: ['harvest', 'harvesting', 'ripe', 'mature', 'कटाई', 'फसल'],
            reply: "For harvesting: 1) Wait for proper maturity; harvesting too early or late reduces quality. 2) Prefer early morning when produce is cool and crisp. 3) Check crop-specific indicators like pod color, grain hardness or fruit aroma. 4) Use sharp, sanitized tools to avoid bruising. 5) Move produce to a cool, dry place immediately. Share your crop for detailed tips."
        },
        // Soil related
        soil: {
            keywords: ['soil', 'land', 'earth', 'fertility', 'ph', 'मिट्टी', 'भूमि'],
            reply: "For soil health: 1) Do a soil test to know pH and nutrients. 2) Most crops thrive at pH 6.0–7.5; amend if needed. 3) Add compost/FYM to build organic matter and structure. 4) Ensure drainage so roots don’t sit in water. 5) Practice crop rotation to avoid nutrient mining and disease buildup. 6) Use legume cover crops for natural nitrogen. Share your soil type for custom advice."
        },
        // General protection
        protect: {
            keywords: ['protect', 'save', 'prevent', 'safety', 'care', 'बचाएं', 'सुरक्षा'],
            reply: "To protect crops: 1) Inspect fields daily for early pest or disease signs. 2) Apply preventive sprays like neem or bio-controls before outbreaks. 3) Maintain spacing for airflow and sunlight. 4) Keep weeds under control so they don’t steal nutrients. 5) Use mulch to conserve moisture and stop new weeds. 6) Install bird/insect nets if needed. Describe your issue for a targeted plan."
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

        if (chat.analysisStatus !== 'in_progress') {
            chat.analysisStatus = 'in_progress';
            chat.analysisCompletedAt = null;
            chat.analysisSummary = null;
            await chat.save();
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

        // Auto-reply from admin (AI + fallback)
        let adminReplyMessage = null;
        if (autoReply) {
            try {
                let aiReplyText = null;
                if (process.env.OPENAI_API_KEY) {
                    const recentMessages = await Message.find({ chat: chatIdToUse })
                        .sort({ createdAt: -1 })
                        .limit(8)
                        .select("message messageType senderType")
                        .lean();

                    aiReplyText = await generateAgriAdviceAiReply({
                        userMessage: message,
                        messageType: messageType || "text",
                        history: recentMessages,
                    });
                }

                const autoReplyText =
                    aiReplyText || buildAutoReplyMessage(message, messageType || "text");

                const adminReplyResult = await sendAdminChatReply({
                    chatId: chatIdToUse,
                    message: autoReplyText,
                    type: "text",
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
import express from "express";
import { body } from 'express-validator';
import { userAuthentication } from "../middlewares/middleware.js";
import { 
    uploadChatImage, 
    createOrGetChat, 
    sendMessageRest, 
    getMessagesRest, 
    getUserChat,
    createOrGetFarmingToolsChat,
    getUserFarmingToolsChat,
    sendFarmingToolsMessage,
    getFarmingToolsMessages,
    createOrGetAgricultureAdviceChat,
    getUserAgricultureAdviceChat,
    sendAgricultureAdviceMessage,
    getAgricultureAdviceMessages,
    getFarmingToolsSuggestedQuestions,
    getAgricultureAdviceSuggestedQuestions,
    getFarmingToolsWelcomeContent,
    getAgricultureAdviceWelcomeContent,
    getFarmingToolsMessagesFormatted,
    getAgricultureAdviceMessagesFormatted,
    createOrGetFarmingToolsChatWithWelcome,
    createOrGetAgricultureAdviceChatWithWelcome
} from "../controllers/chatController.js";
const chatRouter = express.Router();

// Upload chat image
chatRouter.post('/user/upload/chat/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], userAuthentication, uploadChatImage);

// ==================== GENERAL CHAT APIs ====================
chatRouter.post('/create-or-get/v1', userAuthentication, createOrGetChat);
chatRouter.get('/user/chat/v1', userAuthentication, getUserChat);
chatRouter.post('/send/message/v1', [
    body('message').not().isEmpty().withMessage('Message is required'),
    body('chatId').not().isEmpty().withMessage('Chat ID is required')
], userAuthentication, sendMessageRest);
chatRouter.get('/messages/:chatId/v1', userAuthentication, getMessagesRest);

// ==================== FARMING TOOLS CHAT APIs ====================
// Welcome Screen APIs
chatRouter.get('/farming-tools/welcome-content/v1', userAuthentication, getFarmingToolsWelcomeContent);
chatRouter.get('/farming-tools/suggested-questions/v1', userAuthentication, getFarmingToolsSuggestedQuestions);

// Chat Management APIs
chatRouter.post('/farming-tools/create-or-get/v1', userAuthentication, createOrGetFarmingToolsChat);
chatRouter.post('/farming-tools/create-or-get-with-welcome/v1', userAuthentication, createOrGetFarmingToolsChatWithWelcome);
chatRouter.get('/farming-tools/user/chat/v1', userAuthentication, getUserFarmingToolsChat);

// Message APIs
chatRouter.post('/farming-tools/send/message/v1', [
    body('message').not().isEmpty().withMessage('Message is required'),
    body('chatId').not().isEmpty().withMessage('Chat ID is required')
], userAuthentication, sendFarmingToolsMessage);
chatRouter.get('/farming-tools/messages/:chatId/v1', userAuthentication, getFarmingToolsMessages);
chatRouter.get('/farming-tools/messages-formatted/:chatId/v1', userAuthentication, getFarmingToolsMessagesFormatted);

// ==================== AGRICULTURE ADVICE CHAT APIs ====================
// Welcome Screen APIs
chatRouter.get('/agriculture-advice/welcome-content/v1', userAuthentication, getAgricultureAdviceWelcomeContent);
chatRouter.get('/agriculture-advice/suggested-questions/v1', userAuthentication, getAgricultureAdviceSuggestedQuestions);

// Chat Management APIs
chatRouter.post('/agriculture-advice/create-or-get/v1', userAuthentication, createOrGetAgricultureAdviceChat);
chatRouter.post('/agriculture-advice/create-or-get-with-welcome/v1', userAuthentication, createOrGetAgricultureAdviceChatWithWelcome);
chatRouter.get('/agriculture-advice/user/chat/v1', userAuthentication, getUserAgricultureAdviceChat);

// Message APIs
chatRouter.post('/agriculture-advice/send/message/v1', [
    body('message').not().isEmpty().withMessage('Message is required'),
    body('chatId').not().isEmpty().withMessage('Chat ID is required')
], userAuthentication, sendAgricultureAdviceMessage);
chatRouter.get('/agriculture-advice/messages/:chatId/v1', userAuthentication, getAgricultureAdviceMessages);
chatRouter.get('/agriculture-advice/messages-formatted/:chatId/v1', userAuthentication, getAgricultureAdviceMessagesFormatted);

export default chatRouter;
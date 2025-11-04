import express from "express";
import { body } from 'express-validator';
import { userAuthentication } from "../middlewares/middleware.js";
import { uploadChatImage } from "../controllers/chatController.js";
const chatRouter = express.Router();

// Upload crop image
chatRouter.post('/user/upload/chat/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], userAuthentication, uploadChatImage);

export default chatRouter;
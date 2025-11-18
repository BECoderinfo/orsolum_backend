import express from "express";
import { sendUserMessage } from "../controllers/agriAdviceUserController.js";

const router = express.Router();

router.post("/user/agri-advice/send", sendUserMessage);

export default router;


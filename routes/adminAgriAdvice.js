import express from "express";
import { replyToUser } from "../controllers/agriAdviceAdminReply.js";

const router = express.Router();

router.post("/admin/agri-advice/reply", replyToUser);

export default router;
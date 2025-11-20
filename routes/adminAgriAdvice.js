import express from "express";
import { replyToUser } from "../controllers/agriAdviceAdminReply.js";
import { adminAuthentication } from "../middlewares/middleware.js";

const router = express.Router();

router.post("/admin/agri-advice/reply", adminAuthentication, replyToUser);

export default router;
import express from "express";
import {
  replyToUser,
  updateAgricultureAdviceAnalysis,
} from "../controllers/agriAdviceAdminReply.js";
import { adminAuthentication } from "../middlewares/middleware.js";

const router = express.Router();

router.post("/admin/agri-advice/reply", adminAuthentication, replyToUser);
router.post(
  "/admin/agri-advice/analysis/status",
  adminAuthentication,
  updateAgricultureAdviceAnalysis
);

export default router;
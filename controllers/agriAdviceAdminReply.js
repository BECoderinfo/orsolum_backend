import Chat from "../models/Chat.js";
import Message from "../models/Message.js";
import { jsonStatus, status } from "../helper/api.responses.js";

const DEFAULT_ADMIN_ID = process.env.ORSOLUM_AGRI_ADVICE_ADMIN_ID;

const buildAdminSuccessResponse = (messageDoc) => ({
  status: status.Create,
  data: {
    status: jsonStatus.Create,
    success: true,
    data: messageDoc,
  },
});

export const sendAdminChatReply = async ({
  chatId,
  message,
  type = "text",
  adminIdOverride,
}) => {
  if (!chatId || !message) {
    throw new Error("chatId and message are required");
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    const error = new Error("Chat not found");
    error.statusCode = status.NotFound;
    throw error;
  }

  if (chat.chatType !== "agriculture_advice") {
    const error = new Error("Chat is not an agriculture advice conversation");
    error.statusCode = status.BadRequest;
    throw error;
  }

  const senderAdminId = adminIdOverride || chat.admin || DEFAULT_ADMIN_ID;
  if (!senderAdminId) {
    const error = new Error("Unable to resolve admin for agriculture advice chat");
    error.statusCode = status.InternalServerError;
    throw error;
  }

  const replyMessage = await Message.create({
    senderUser: chat.user,
    senderAdmin: senderAdminId,
    senderType: "admin",
    message,
    chat: chatId,
    messageType: type,
  });

  return buildAdminSuccessResponse(replyMessage);
};

export const replyToUser = async (req, res) => {
  try {
    const { chatId, message, type = "text" } = req.body;
    if (!chatId || !message) {
      return res
        .status(status.BadRequest)
        .json({ error: "chatId and message are required" });
    }

    const { status: statusCode, data } = await sendAdminChatReply({
      chatId,
      message,
      type,
      adminIdOverride: req.user?._id,
    });

    return res.status(statusCode).json(data);
  } catch (err) {
    console.error("Admin reply failed:", err.message || err);
    const errorStatus =
      err.statusCode || err.response?.status || status.InternalServerError;
    const errorPayload =
      err.response?.data || { error: err.message || "Failed to send admin reply" };
    return res.status(errorStatus).json(errorPayload);
  }
};

export const updateAgricultureAdviceAnalysis = async (req, res) => {
  try {
    const {
      chatId,
      status: analysisStatus = "in_progress",
      summary,
      notifyUser = true,
      message: customMessage,
    } = req.body || {};

    if (!chatId) {
      return res
        .status(status.BadRequest)
        .json({ error: "chatId is required" });
    }

    if (!["in_progress", "completed"].includes(analysisStatus)) {
      return res
        .status(status.BadRequest)
        .json({ error: "status must be in_progress or completed" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat || chat.chatType !== "agriculture_advice") {
      return res
        .status(status.NotFound)
        .json({ error: "Agriculture advice chat not found" });
    }

    chat.analysisStatus = analysisStatus;
    if (analysisStatus === "completed") {
      chat.analysisCompletedAt = new Date();
      if (summary) {
        chat.analysisSummary = summary;
      }
    } else {
      chat.analysisCompletedAt = null;
      chat.analysisSummary = summary || chat.analysisSummary;
    }
    await chat.save();

    let adminReply = null;
    if (notifyUser && analysisStatus === "completed") {
      const replyMessage =
        (customMessage && customMessage.trim()) ||
        summary ||
        "Your agriculture analysis is complete. Please review the recommendations and let us know if you have any follow-up questions.";

      const { data } = await sendAdminChatReply({
        chatId,
        message: replyMessage,
        adminIdOverride: req.user?._id,
      });
      adminReply = data?.data || null;
    }

    return res.status(status.OK).json({
      success: true,
      status: jsonStatus.OK,
      data: {
        chatId,
        analysisStatus: chat.analysisStatus,
        analysisSummary: chat.analysisSummary,
        analysisCompletedAt: chat.analysisCompletedAt,
        adminReply,
      },
    });
  } catch (err) {
    console.error("Update analysis status failed:", err.message || err);
    return res
      .status(status.InternalServerError)
      .json({ error: err.message || "Failed to update analysis status" });
  }
};
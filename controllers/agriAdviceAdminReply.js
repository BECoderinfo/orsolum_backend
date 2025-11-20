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
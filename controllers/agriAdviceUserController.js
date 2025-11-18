import axios from "axios";
import { sendAdminChatReply } from "./agriAdviceAdminReply.js";

const BASE_URL = process.env.ORSOLUM_BASE_URL || "http://localhost:5000/api";

const getUserToken = (authorizationHeader = "") => {
  if (!authorizationHeader.startsWith("Bearer ")) return null;
  return authorizationHeader.split(" ")[1];
};

const ensureChatId = async (userToken, existingChatId) => {
  if (existingChatId) return existingChatId;

  const response = await axios.post(
    `${BASE_URL}/agriculture-advice/create-or-get-with-welcome/v1`,
    {},
    {
      headers: {
        Authorization: `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  const chatId = response.data?.data?._id;
  if (!chatId) {
    throw new Error("Unable to resolve agricultureAdviceChatId");
  }
  return chatId;
};

const sendUserMessageToOrsolum = async ({
  userToken,
  chatId,
  message,
  messageType,
}) => {
  return axios.post(
    `${BASE_URL}/agriculture-advice/send/message/v1`,
    {
      chatId,
      message,
      messageType,
    },
    {
      headers: {
        Authorization: `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
    }
  );
};

const buildAutoReply = (incomingMessage = "") =>
  `Thanks for your message${
    incomingMessage ? ` about "${incomingMessage}"` : ""
  }. Please upload crop & soil images so our agri doctor can review quickly.`;

export const sendUserMessage = async (req, res) => {
  try {
    const {
      message,
      chatId: providedChatId,
      messageType = "text",
      autoReply = true,
      autoReplyMessage,
    } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const userToken = getUserToken(req.headers.authorization || "");
    if (!userToken) {
      return res.status(401).json({ error: "User bearer token is required" });
    }

    const chatId = await ensureChatId(userToken, providedChatId);

    const userMessageResponse = await sendUserMessageToOrsolum({
      userToken,
      chatId,
      message,
      messageType,
    });

    let adminReply = null;
    if (autoReply) {
      try {
        const replyText =
          autoReplyMessage && autoReplyMessage.trim().length > 0
            ? autoReplyMessage.trim()
            : buildAutoReply(message);
        const { data } = await sendAdminChatReply({
          chatId,
          message: replyText,
        });
        adminReply = data;
      } catch (adminErr) {
        console.error(
          "Auto admin reply failed:",
          adminErr.response?.data || adminErr.message
        );
      }
    }

    return res.status(userMessageResponse.status).json({
      success: true,
      chatId,
      userMessage: userMessageResponse.data,
      adminReply,
    });
  } catch (err) {
    console.error("User message proxy failed:", err.response?.data || err);
    return res
      .status(err.response?.status || 500)
      .json(err.response?.data || { error: "Failed to send user message" });
  }
};


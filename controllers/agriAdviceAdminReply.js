import axios from "axios";

const BASE_URL = process.env.ORSOLUM_BASE_URL || "http://localhost:5000/api";
const ADMIN_TOKEN = process.env.ORSOLUM_ADMIN_JWT; // admin JWT यहाँ रखें

export const sendAdminChatReply = async ({
  chatId,
  message,
  type = "text",
}) => {
  if (!ADMIN_TOKEN) {
    throw new Error("Admin token not configured (ORSOLUM_ADMIN_JWT missing)");
  }
  const response = await axios.post(
    `${BASE_URL}/agriculture-advice/send/message/v1`,
    {
      chatId,
      message,
      messageType: type, // text | image
    },
    {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  return { status: response.status, data: response.data };
};

export const replyToUser = async (req, res) => {
  try {
    const { chatId, message, type = "text" } = req.body;
    if (!chatId || !message) {
      return res
        .status(400)
        .json({ error: "chatId and message are required" });
    }

    const { status, data } = await sendAdminChatReply({ chatId, message, type });

    return res.status(status).json(data);
  } catch (err) {
    console.error("Admin reply failed:", err.response?.data || err.message);
    return res
      .status(err.response?.status || 500)
      .json(err.response?.data || { error: "Failed to send admin reply" });
  }
};
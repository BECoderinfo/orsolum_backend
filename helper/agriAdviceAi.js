import OpenAI from "openai";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

const buildSystemPrompt = () =>
  `You are "Orsolum Agri Doctor", a professional agronomist helping Indian farmers in simple, friendly language. 
Provide concise, actionable advice about crop protection, soil health, irrigation, fertilizers, and disease management. 
Always list practical steps, include both organic and chemical options when relevant, and mention safety precautions. 
If the user uploads an image, acknowledge that the image is being reviewed virtually (you do NOT really see the image; rely on the description). 
If information is insufficient, politely request more details (crop name, growth stage, symptoms, soil type, etc.). 
Never invent facts. Never mention that you are an AI model.`;

const buildHistoryMessages = (history = []) =>
  history
    .map((msg) => {
      const role = msg.senderType === "admin" ? "assistant" : "user";
      return {
        role,
        content:
          msg.messageType === "image"
            ? `${role === "user" ? "User" : "Assistant"} shared an image and said: ${msg.message}`
            : msg.message,
      };
    })
    .reverse(); // ensure chronological order

export const generateAgriAdviceAiReply = async ({
  userMessage,
  messageType = "text",
  history = [],
}) => {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const baseMessages = [
      { role: "system", content: buildSystemPrompt() },
      ...buildHistoryMessages(history),
    ];

    const userContent =
      messageType === "image"
        ? `User uploaded crop/soil images and described: ${userMessage}`
        : userMessage;

    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.4,
      messages: [
        ...baseMessages,
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("Agri advice AI generation failed:", err.message);
    return null;
  }
};


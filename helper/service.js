import fs from "fs";
import { status, jsonStatus } from "./api.responses.js";

const errorLogs = fs.createWriteStream("error.log", { flags: "a" });

export const catchError = (name, error, req, res) => {
  const logMessage = `${name} => ${new Date().toString()} => ${error.stack || error.toString()}\r\n`;
  errorLogs.write(logMessage);
  console.error(`❌ [${name}]`, error);

  // Check if response has already been sent
  if (res.headersSent) {
    console.warn(`⚠️ [${name}] Response already sent, skipping catchError()`);
    return;
  }

  // Handle specific error types
  if (error.name === 'JsonWebTokenError') {
    return res.status(status.Unauthorized).json({
      status: jsonStatus.Unauthorized,
      success: false,
      message: "Invalid token",
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(status.Unauthorized).json({
      status: jsonStatus.Unauthorized,
      success: false,
      message: "Token expired",
    });
  }

  if (error.name === 'ValidationError') {
    return res.status(status.BadRequest).json({
      status: jsonStatus.BadRequest,
      success: false,
      message: error.message,
    });
  }

  if (error.name === 'CastError') {
    return res.status(status.BadRequest).json({
      status: jsonStatus.BadRequest,
      success: false,
      message: "Invalid ID format",
    });
  }

  // Default error response
  return res.status(status.InternalServerError || 500).json({
    status: jsonStatus.InternalServerError,
    success: false,
    message: error?.message || "Something went wrong.",
  });
};

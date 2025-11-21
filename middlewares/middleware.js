import jwt from "jsonwebtoken";
import { jsonStatus, status } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import DeliveryBoy from "../models/DeliveryBoy.js";

const sanitizeTokenValue = (token) => {
  if (!token || typeof token !== "string") return "";
  let cleaned = token.trim();
  if (!cleaned) return "";

  if (cleaned.startsWith("Bearer ")) {
    cleaned = cleaned.slice(7).trim();
  }

  cleaned = cleaned.replace(/^['"]+|['"]+$/g, "").trim();

  if (!cleaned || cleaned.toLowerCase() === "null" || cleaned.toLowerCase() === "undefined") {
    return "";
  }

  return cleaned;
};

/**
 * Safely extract token from multiple possible locations.
 * Tries Authorization header first, then custom headers,
 * then falls back to body/query parameters for older clients.
 */
const extractToken = (req) => {
  const headerToken =
    req.header("Authorization") ||
    req.header("authorization") ||
    req.headers["token"] ||
    req.headers["Token"] ||
    req.headers["TOKEN"] ||
    "";

  let token = sanitizeTokenValue(headerToken);

  if (!token) {
    const fallbackToken =
      req.body?.token ||
      req.query?.token ||
      req.headers["x-access-token"] ||
      "";
    token = sanitizeTokenValue(fallbackToken);
  }

  return token;
};

/* -------------------------- USER AUTHENTICATION -------------------------- */
export const userAuthentication = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "No Token. Authorization Denied",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      // Provide specific error messages for token issues
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Token expired",
        });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Invalid token",
        });
      }
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Invalid or expired token",
      });
    }

    const user = await User.findById(decoded._id);
    if (!user || user.role !== "user" || user.deleted || !user.active) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: !user
          ? "Authorization Denied"
          : user.deleted
            ? "Your account was deleted!"
            : !user.active
              ? "Your account is inactive! Please contact admin"
              : "Authorization Denied",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    catchError("userAuthentication", error, req, res);
  }
};

/* ------------------------- RETAILER AUTHENTICATION ------------------------ */
export const retailerAuthentication = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "No Token. Authorization Denied",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      // Provide specific error messages for token issues
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Token expired",
        });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Invalid token",
        });
      }
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Invalid or expired token",
      });
    }

    const user = await User.findById(decoded._id);
    // ✅ Allow both "retailer" and "seller" roles to use retailer APIs
    if (
      !user ||
      (user.role !== "retailer" && user.role !== "seller") ||
      user.deleted ||
      !user.active
    ) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: !user
          ? "Authorization Denied"
          : user.deleted
          ? "Your account was deleted!"
          : !user.active
          ? "Your account is inactive! Please contact admin"
          : "Authorization Denied",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    catchError("retailerAuthentication", error, req, res);
  }
};

/* --------------------------- ADMIN AUTHENTICATION ------------------------- */
export const adminAuthentication = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "No Token. Authorization Denied",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      // Provide specific error messages for token issues
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Token expired",
        });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Invalid token",
        });
      }
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Invalid or expired token",
      });
    }

    const admin = await Admin.findById(decoded._id);
    if (!admin) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Authorization Denied",
      });
    }

    req.user = admin;
    next();
  } catch (error) {
    catchError("adminAuthentication", error, req, res);
  }
};

/* ------------------------- DELIVERY BOY AUTHENTICATION -------------------- */
export const deliveryBoyAuthentication = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Token missing",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Provide specific error messages for token issues
      if (err.name === 'TokenExpiredError') {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Token expired",
        });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Invalid token",
        });
      }
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Invalid or expired token",
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(decoded._id || decoded.id);
    if (!deliveryBoy) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "DeliveryBoy not found",
      });
    }

    req.user = deliveryBoy;
    next();
  } catch (error) {
    catchError("deliveryBoyAuthentication", error, req, res);
  }
};

/* --------------------------- SOCKET AUTHENTICATION ------------------------ */
export const isSocketAuthenticated = async (socket, next) => {
  try {
    let token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.request.headers?.token;

    if (!token) return next(new Error("Token missing"));
    if (token.startsWith("Bearer ")) token = token.slice(7);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return next(new Error("Invalid or expired token"));
    }

    let user = await User.findById(decoded._id);
    let deliveryBoy = null;

    if (!user) {
      deliveryBoy = await DeliveryBoy.findById(decoded._id);
      if (!deliveryBoy) return next(new Error("Invalid token"));
    }

    socket.role = user ? "user" : "deliveryBoy";
    socket.user = user || null;
    socket.deliveryBoy = deliveryBoy || null;

    next();
  } catch (err) {
    console.error("Socket auth failed:", err.message);
    return next(new Error("Unauthorized"));
  }
};

export const sellerAuthentication = async (req, res, next) => {
  try {
    let token = extractToken(req);
    if (!token) {
      console.error("No authorization token provided");
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No token provided",
      });
    }


    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    // Allow seller or retailer users (for shared pickup APIs)
    const user = await User.findById(decoded._id);
    if (!user) {
      console.error('User not found with ID:', decoded._id);
      return res.status(403).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    console.log('User found:', {
      _id: user._id,
      role: user.role,
      active: user.active,
      deleted: user.deleted
    });

    if (user.role !== "seller" && user.role !== "retailer") {
      console.error('User role is not seller/retailer:', user.role);
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. User role is '${user.role}', but 'seller' or 'retailer' is required.` 
      });
    }

    if (user.deleted) {
      return res.status(403).json({ 
        success: false, 
        message: "Your account was deleted!" 
      });
    }

    if (!user.active) {
      return res.status(403).json({ 
        success: false, 
        message: "Your account is inactive! Please contact admin" 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Seller authentication error:", error.message);
    console.error("Error name:", error.name);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: "Token expired" });
    }
    return res.status(401).json({ success: false, message: `Authentication failed: ${error.message}` });
  }
};

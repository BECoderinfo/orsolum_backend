// import jwt from 'jsonwebtoken';

// export const generateToken = (payload, expiresIn = null) => {
//     // If payload is a string or ObjectId, treat it as _id (backward compatibility)
//     const tokenPayload = typeof payload === 'string' || payload._id ? { _id: payload } : payload;
//     const options = expiresIn ? { expiresIn } : { expiresIn: process.env.JWT_EXPIRE || '30d' };
//     const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, options);
//     return token; // Return token without Bearer prefix - middleware will handle it
// };

import jwt from "jsonwebtoken";

export const generateToken = (payload, expiresIn = null) => {
  // If payload is a string => treat as userId
  if (typeof payload === "string") {
    payload = { _id: payload };
  }

  // If payload is mongoose document => convert to clean object
  if (payload._id && typeof payload._id === "object") {
    payload = { _id: payload._id.toString() };
  }

  const options = {
    expiresIn: expiresIn || process.env.JWT_EXPIRE || "30d",
  };

  return jwt.sign(payload, process.env.JWT_SECRET, options);
};

export const verifyTempToken = (req, res, next) => {
  console.log("AUTH HEADER:", req.headers.authorization);
  const tempToken = req.headers.authorization?.split(" ")[1]; // Get token from header

  if (!tempToken) {
    console.log("NO TOKEN RECEIVED");
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    console.log("DECODED TOKEN:", decoded);

    req.user = decoded; // Attach user info to request
    next(); // Continue to route
  } catch (err) {
    console.log("TOKEN ERROR:", err.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};
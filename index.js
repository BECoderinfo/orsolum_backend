import express from "express";
import cors from "cors";
import dotEnv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import { dbConnect } from "./database.js";
import { Server } from "socket.io";
import mongoose from "mongoose";

// import routes
import userRouter from "./routes/userRoute.js";
import retailerRoute from "./routes/retailerRoute.js";
import storeRouter from "./routes/storeRouter.js";
import adminRouter from "./routes/adminRouter.js";
import productRouter from "./routes/productRouter.js";
import orderRouter from "./routes/orderRouter.js";
import onlineStoreRouter from "./routes/onlineStoreRouter.js";
import reelRouter from "./routes/reelRouter.js";
import cropRouter from "./routes/cropRouter.js";
import chatRouter from "./routes/chatRouter.js";
import deliveryRouter from "./routes/deliveryRouter.js";
import shiprocketRouter from "./routes/shiprocketRouter.js";
import adminAgriAdviceRouter from "./routes/adminAgriAdvice.js";
import agriAdviceUserRouter from "./routes/agriAdviceUser.js";
import { checkPremiumExpiry, runAdsExpiryCron } from "./services.js";
import { isSocketAuthenticated } from "./middlewares/middleware.js";
import { createChat, getMessages, sendMessage } from "./controllers/chatController.js";
import { goOnlineSocket, goOfflineSocket } from "./controllers/DeliveryBoyController.js";
import paymentRouter from "./routes/paymentRouter.js";
import sellerRouter from "./routes/sellerRouter.js";
import pickupAddressRouter from "./routes/pickupAddressRouter.js";
import { webhookTracking } from "./controllers/shiprocketController.js";
import { renderSharedProfilePage } from "./controllers/userController.js";
import superadminRouter from "./routes/superadminRouter.js";

// import new routes
import donationRoutes from './routes/donationRoutes.js';
import couponRoutes from './routes/couponRoutes.js';

dotEnv.config({ path: './.env' });
const enableChatSockets = process.env.ENABLE_CHAT_SOCKETS !== "false";

const app = express();

// When behind a reverse proxy (e.g., Nginx/ALB) make sure the real client IP
// is used by downstream middlewares such as rate-limiter.
app.set("trust proxy", 1);

// ✅ Global Middlewares
app.use(cors({ origin: '*' }));
app.use(helmet());

const limit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000,              // allow more requests per client to avoid false 429s
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests! Please try again later",
});
app.use(limit);

app.use(morgan("dev"));
app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ✅ Database Connection
let dbConnected = false;

// Initialize database connection
const initializeDatabase = async () => {
  try {
    await dbConnect();
    dbConnected = true;
    console.log('✅ Database connection established');
  } catch (error) {
    console.error('❌ Database connection error:', error);
    // Don't exit - server can still run with connection issues
  }
};

// Call the initialization function
initializeDatabase();

// Set up database connection monitoring
mongoose.connection.on('connected', () => {
  dbConnected = true;
  console.log('✅ Database reconnected');
});

mongoose.connection.on('disconnected', () => {
  dbConnected = false;
  console.log('⚠️ Database disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 Database connection error:', err);
  dbConnected = false;
});

// ✅ Server readiness flag
let serverReady = false;

// ✅ Startup delay to ensure all services are ready
setTimeout(() => {
  serverReady = true;
  console.log('✅ Server is ready to handle requests');
}, 3000); // 3 seconds delay to ensure DB and other services are ready

// ✅ Enhanced readiness middleware that also checks database connection
app.use('/api', (req, res, next) => {
  if (!serverReady) {
    return res.status(503).json({
      success: false,
      message: 'Server is starting up, please try again in a moment',
      timestamp: new Date().toISOString()
    });
  }
  
  // Optional: Check if database is connected (you can enable this if needed)
  // if (!dbConnected && req.path !== '/health') {
  //   return res.status(503).json({
  //     success: false,
  //     message: 'Database is temporarily unavailable',
  //     timestamp: new Date().toISOString()
  //   });
  // }
  
  next();
});



// ✅ Root Route — Fix for "Cannot GET /"
app.get("/", (req, res) => {
  res.status(200).send({
    success: true,
    message: "🚀 Node Backend is Live and Running Successfully on AWS EC2!",
    serverTime: new Date().toLocaleString(),
  });
});

// ✅ General Health Check Endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy and ready",
    serverTime: new Date().toISOString(),
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// ✅ Socket.io Health Check Endpoint
app.get("/socket-health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Socket.io server is running",
    socketPath: "/socket.io/",
    socketNamespaces: ["/", "/delivery"],
    serverTime: new Date().toISOString(),
    instructions: {
      connectUrl: `http://${req.headers.host}`,
      deliveryNamespace: "/delivery",
      requiredAuth: "token in handshake.auth.token or handshake.query.token"
    }
  });
});

app.get("/u/:id", renderSharedProfilePage);

// ✅ Cron Job to check premium expiry daily at 12:01 AM
cron.schedule("1 0 * * *", () => {
  try {
    console.log("Running premium expiry check at 12:01 AM...");
    checkPremiumExpiry();
  } catch (error) {
    console.error('🔴 Error in premium expiry cron job:', error);
  }
});

// ✅ Cron Job to manage Ads expiry & notifications every hour
cron.schedule("0 * * * *", () => {
  try {
    console.log("Running ads expiry & notification check...");
    runAdsExpiryCron();
  } catch (error) {
    console.error('🔴 Error in ads expiry cron job:', error);
  }
});

// ✅ Register Routes
app.use('/api', userRouter);
app.use('/api', retailerRoute);
console.log('✅ Retailer routes mounted at /api');
app.use('/api', storeRouter);
app.use('/api', adminRouter);
app.use('/api', superadminRouter);
app.use('/api', productRouter);
app.use('/api/order', orderRouter); // Primary mount for order/cart routes
app.use('/api', orderRouter);       // Backward-compat: allow /api/add/product/in/cart/v1, etc.
app.use('/api', onlineStoreRouter);
app.use('/api', reelRouter);
app.use('/api', cropRouter);
app.use('/api', chatRouter);
app.use('/api', deliveryRouter);
app.use('/api', adminAgriAdviceRouter);
app.use('/api', agriAdviceUserRouter);

app.use('/api/payment', paymentRouter);
app.use('/api/shiprocket', shiprocketRouter);
app.use('/api/pickup-addresses', pickupAddressRouter);
app.use('/api', sellerRouter);

// Donation and coupon routes
app.use('/api/donation', donationRoutes);
app.use('/api/coupon', couponRoutes);

// ✅ Shiprocket Webhook Route
app.post('/api/delivery/tracking/webhook', webhookTracking);

// ✅ Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('🔴 Global Error Handler:', err);
  
  // Log error details
  console.error('   URL:', req.method, req.url);
  console.error('   Error:', err.message);
  
  // Prevent duplicate responses
  if (res.headersSent) {
    return next(err);
  }
  
  // Send appropriate error response
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ✅ Start Server
const port = process.env.PORT || 5000;
const server = app.listen(port, '0.0.0.0', () =>
  console.log(`✅ Server is running on PORT - ${port}`)
);

// ✅ Initialize Socket.io with enhanced configuration
const io = new Server(server, {
  pingTimeout: 120000,        // 2 minutes - increased for mobile networks
  pingInterval: 30000,        // 30 seconds
  connectTimeout: 60000,      // 1 minute connection timeout
  upgradeTimeout: 30000,      // 30 seconds for transport upgrade
  maxHttpBufferSize: 1e6,     // 1MB max buffer
  cors: { 
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", "token"]
  },
  transports: ['polling', 'websocket'], // Polling first for better mobile compatibility
  allowEIO3: true,            // Allow Engine.IO v3 clients
  allowEIO4: true,            // Allow Engine.IO v4 clients
  perMessageDeflate: false,   // Disable compression for mobile (reduces latency)
  httpCompression: false,     // Disable HTTP compression for mobile
});

io.use(isSocketAuthenticated);

io.on("connection", (socket) => {
  // Reduced logging - only log important events
  // console.log("✅ Socket connected:", socket.id, "Role:", socket.role || "guest");

  // Send immediate acknowledgment to client
  socket.emit("connection_success", { 
    socketId: socket.id, 
    role: socket.role || "guest",
    serverTime: new Date().toISOString()
  });

  socket.on("setup", (user) => {
    if (user && user._id) {
      socket.join(user._id);
      socket.emit("connected", { userId: user._id });
      // Only log if needed for debugging
      // console.log("🔗 User joined room:", user._id);
    }
  });

  // Heartbeat/ping handler for mobile clients
  socket.on("ping_server", (callback) => {
    if (typeof callback === 'function') {
      callback({ status: "pong", time: Date.now() });
    } else {
      socket.emit("pong_client", { status: "pong", time: Date.now() });
    }
  });
  
  socket.on("disconnect", (reason) => {
    // Only log unexpected disconnects
    if (reason !== "client namespace disconnect" && reason !== "transport close") {
      console.log("❌ Socket disconnected:", socket.id, "Reason:", reason);
    }
  });

  socket.on("error", (error) => {
    // Only log actual errors, not warnings
    if (error && error.message && !error.message.includes("transport")) {
      console.log("⚠️ Socket error:", socket.id, error.message);
    }
  });

  // Handle connection errors gracefully - silent for common cases
  socket.on("connect_error", (error) => {
    // Only log if it's not a common transport error
    if (error && error.message && !error.message.includes("transport")) {
      console.log("⚠️ Socket connect_error:", socket.id, error.message);
    }
  });

  if (enableChatSockets) {
    socket.on("join chat", (room) => {
      if (room) socket.join(room);
    });

    socket.on("createChat", (body, callback) =>
      createChat(io, socket, body, callback)
    );
    socket.on("sendMessage", (body, callback) =>
      sendMessage(io, socket, body, callback)
    );
    socket.on("getMessage", (body, callback) =>
      getMessages(io, socket, body, callback)
    );

    socket.on("new message", (newMessageRecieved) => {
      if (newMessageRecieved?.chat?.admin) {
        socket
          .in(newMessageRecieved.chat.admin)
          .emit("message recieved", newMessageRecieved);
      }
    });
  }

  // DeliveryBoy socket handlers
  socket.on("goOnline", (body, callback) =>
    goOnlineSocket(io, socket, body, callback)
  );

  socket.on("goOffline", (body, callback) =>
    goOfflineSocket(io, socket, body, callback)
  );

  socket.on("leave_room", (roomId) => {
    if (roomId) socket.leave(roomId);
  });
});

// ✅ Delivery Socket Namespace
const deliveryIo = io.of("/delivery");
deliveryIo.use(isSocketAuthenticated);

deliveryIo.on("connection", (socket) => {
  // Reduced logging - only log important events
  // console.log("🚚 Delivery socket connected:", socket.id);
  
  // Send immediate acknowledgment
  socket.emit("delivery_connected", {
    socketId: socket.id,
    role: socket.role || "guest",
    deliveryBoyId: socket.deliveryBoy?._id || null,
    serverTime: new Date().toISOString()
  });

  // Join delivery boy to their personal room
  if (socket.deliveryBoy && socket.deliveryBoy._id) {
    const roomId = socket.deliveryBoy._id.toString();
    socket.join(roomId);
    // Only log if needed for debugging
    // console.log("🔗 Delivery boy joined room:", roomId);
  }

  // Heartbeat handler for delivery app
  socket.on("ping_server", (callback) => {
    if (typeof callback === 'function') {
      callback({ status: "pong", time: Date.now() });
    } else {
      socket.emit("pong_client", { status: "pong", time: Date.now() });
    }
  });

  socket.on("goOnline", (body, callback) => {
    try {
      goOnlineSocket(deliveryIo, socket, body, callback);
    } catch (err) {
      console.log("⚠️ goOnline error:", err.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  socket.on("goOffline", (body, callback) => {
    try {
      goOfflineSocket(deliveryIo, socket, body, callback);
    } catch (err) {
      console.log("⚠️ goOffline error:", err.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  socket.on("disconnect", (reason) => {
    // Only log unexpected disconnects
    if (reason !== "client namespace disconnect" && reason !== "transport close") {
      console.log("❌ Delivery socket disconnected:", socket.id, "Reason:", reason);
    }
  });

  socket.on("error", (error) => {
    // Only log actual errors, not warnings
    if (error && error.message && !error.message.includes("transport")) {
      console.log("⚠️ Delivery socket error:", socket.id, error.message);
    }
  });

  socket.on("connect_error", (error) => {
    // Only log if it's not a common transport error
    if (error && error.message && !error.message.includes("transport")) {
      console.log("⚠️ Delivery connect_error:", socket.id, error.message);
    }
  });
});

// Log socket.io engine errors
io.engine.on("connection_error", (err) => {
  console.log("🔴 Socket.io connection error:");
  console.log("   Code:", err.code);
  console.log("   Message:", err.message);
  console.log("   Context:", err.context);
});

// ✅ Global Error Handlers
process.on('uncaughtException', (err) => {
  console.error('🔴 Uncaught Exception:', err);
  console.error('   Error:', err.message);
  console.error('   Stack:', err.stack);
  // Don't exit the process - just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 Unhandled Rejection at:', promise, 'reason:', reason);
  if (reason instanceof Error) {
    console.error('   Error:', reason.message);
    console.error('   Stack:', reason.stack);
  }
});

// ✅ Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

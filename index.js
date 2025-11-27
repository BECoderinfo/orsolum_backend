import express from "express";
import cors from "cors";
import dotEnv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import { dbConnect } from "./database.js";
import { Server } from "socket.io";

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
import { checkPremiumExpiry } from "./services.js";
import { isSocketAuthenticated } from "./middlewares/middleware.js";
import { createChat, getMessages, sendMessage } from "./controllers/chatController.js";
import { goOnlineSocket, goOfflineSocket } from "./controllers/DeliveryBoyController.js";
import paymentRouter from "./routes/paymentRouter.js";
import sellerRouter from "./routes/sellerRouter.js";
import pickupAddressRouter from "./routes/pickupAddressRouter.js";
import { webhookTracking } from "./controllers/shiprocketController.js";
import { renderSharedProfilePage } from "./controllers/userController.js";

dotEnv.config({ path: './.env' });

const app = express();

// ✅ Global Middlewares
app.use(cors({ origin: '*' }));
app.use(helmet());

const limit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
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

// ✅ Database Connection
dbConnect();

// ✅ Root Route — Fix for "Cannot GET /"
app.get("/", (req, res) => {
  res.status(200).send({
    success: true,
    message: "🚀 Node Backend is Live and Running Successfully on AWS EC2!",
    serverTime: new Date().toLocaleString(),
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
  console.log("Running premium expiry check at 12:01 AM...");
  checkPremiumExpiry();
});

// ✅ Register Routes
app.use('/api', userRouter);
app.use('/api', retailerRoute);
console.log('✅ Retailer routes mounted at /api');
app.use('/api', storeRouter);
app.use('/api', adminRouter);
app.use('/api', productRouter);
app.use('/api', orderRouter);
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

// ✅ Shiprocket Webhook Route
app.post('/api/delivery/tracking/webhook', webhookTracking);

// ✅ Start Server
const port = process.env.PORT || 5000;
const server = app.listen(port, '0.0.0.0', () =>
  console.log(`✅ Server is running on PORT - ${port}`)
);

// ✅ Initialize Socket.io with enhanced configuration
const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: { 
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Allow both transports for better compatibility
  allowEIO3: true, // Allow Engine.IO v3 clients
  connectTimeout: 45000, // Increase connection timeout
});

io.use(isSocketAuthenticated);

io.on("connection", (socket) => {
  console.log("✅ Connected to socket.io - Socket ID:", socket.id);
  console.log("📱 Client transport:", socket.conn.transport.name);
  console.log("👤 User role:", socket.role);

  socket.on("setup", (user) => {
    socket.join(user._id);
    socket.emit("connected");
    console.log("🔗 User joined room:", user._id);
  });
  
  socket.on("disconnect", (reason) => {
    console.log("❌ Socket disconnected:", socket.id, "Reason:", reason);
  });

  socket.on("error", (error) => {
    console.log("⚠️ Socket error:", error);
  });

  socket.on("join chat", (room) => {
    socket.join(room);
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
    let chat = newMessageRecieved.chat;
    socket.in(chat.admin).emit("message recieved", newMessageRecieved);
  });

  // DeliveryBoy socket logs
  socket.on("goOnline", (body, callback) =>
    goOnlineSocket(io, socket, body, callback)
  );

  socket.on("goOffline", (body, callback) =>
    goOfflineSocket(io, socket, body, callback)
  );

  socket.off("setup", (userData) => {
    socket.leave(userData._id);
  });
});

// ✅ Delivery Socket Namespace
const deliveryIo = io.of("/delivery");
deliveryIo.use(isSocketAuthenticated);

deliveryIo.on("connection", (socket) => {
  console.log("🚚 Delivery socket connected:", socket.id);
  console.log("📱 Client transport:", socket.conn.transport.name);
  
  // Join delivery boy to their personal room
  if (socket.deliveryBoy) {
    socket.join(socket.deliveryBoy._id.toString());
    console.log("🔗 Delivery boy joined room:", socket.deliveryBoy._id);
  }

  socket.on("goOnline", (body, callback) =>
    goOnlineSocket(deliveryIo, socket, body, callback)
  );

  socket.on("goOffline", (body, callback) =>
    goOfflineSocket(deliveryIo, socket, body, callback)
  );

  socket.on("disconnect", (reason) => {
    console.log("❌ Delivery socket disconnected:", socket.id, "Reason:", reason);
  });

  socket.on("error", (error) => {
    console.log("⚠️ Delivery socket error:", error);
  });
});

// Log socket.io engine errors
io.engine.on("connection_error", (err) => {
  console.log("🔴 Socket.io connection error:");
  console.log("   Code:", err.code);
  console.log("   Message:", err.message);
  console.log("   Context:", err.context);
});

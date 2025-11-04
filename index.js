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
import { checkPremiumExpiry } from "./services.js";
import { isSocketAuthenticated } from "./middlewares/middleware.js";
import { createChat, getMessages, sendMessage } from "./controllers/chatController.js";
import { goOnlineSocket, goOfflineSocket } from "./controllers/DeliveryBoyController.js";
import paymentRouter from "./routes/paymentRouter.js";
import sellerRouter from "./routes/sellerRouter.js";
import pickupAddressRouter from './routes/pickupAddressRouter.js';
import { webhookTracking } from "./controllers/shiprocketController.js";

dotEnv.config({ path: './.env' });

const app = express();

app.use(cors({
    origin: '*'
}));

app.use(helmet());

const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    message: "Too many request! Please try again later"
});

app.use(limit);

app.use(morgan("dev"));

// app.use(express.json({ limit: '10kb' }));
app.use(
    express.json({
        limit: '2mb',
        verify: (req, res, buf) => {
            req.rawBody = buf.toString();
        },
    })
);

dbConnect();

// Schedule the cron job to run every day at 12:01 AM
cron.schedule("1 0 * * *", () => {
    console.log("Running premium expiry check at 12:01 AM...");
    checkPremiumExpiry();
});

app.use('/api', [userRouter, retailerRoute, storeRouter, adminRouter, productRouter, orderRouter, onlineStoreRouter, reelRouter, cropRouter, chatRouter, deliveryRouter]);
app.use('/api/payment', paymentRouter);
app.use('/api/shiprocket', shiprocketRouter);
app.use('/api/pickup-addresses', pickupAddressRouter);
app.use('/api', sellerRouter);

// ✅ Shiprocket Webhook - Alternative route without 'shiprocket' keyword
app.post('/api/delivery/tracking/webhook', webhookTracking);

const port = process.env.PORT || 5000;

const server = app.listen(port, () => console.log(`Server is running on PORT - ${port}`));

const io = new Server(server, {
    pingTimeout: 60000,
    cors: {
        origin: "*",
    },
});

io.use(isSocketAuthenticated);

io.on("connection", (socket) => {
    console.log("Connected to socket.io");

    socket.on("setup", (user) => {
        socket.join(user._id);
        socket.emit("connected");
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
        // if (!chat.users) return console.log("chat.users not defined");
        // chat.users.forEach((user) => {
        //     if (user === newMessageRecieved.sender) return;
        socket.in(chat.admin).emit("message recieved", newMessageRecieved);
        // });
    });


    // DeliveryBoy work logs
    socket.on("goOnline", (body, callback) =>
        goOnlineSocket(io, socket, body, callback)
    );

    socket.on("goOffline", (body, callback) =>
        goOfflineSocket(io, socket, body, callback)
    );

    // socket.on("getWorkHours", (body, callback) =>
    //     getWorkHoursSocket(io, socket, body, callback)
    // );

    // socket.on("getWorkSummary", (body, callback) =>
    //     getWorkSummarySocket(io, socket, body, callback)
    // );

    socket.off("setup", (userData) => {
        socket.leave(userData._id);
    });

});

const deliveryIo = io.of("/delivery");
deliveryIo.use(isSocketAuthenticated);

deliveryIo.on("connection", (socket) => {
    console.log("Delivery socket connected:", socket.id);

    socket.on("goOnline", (body, callback) =>
        goOnlineSocket(deliveryIo, socket, body, callback)
    );

    socket.on("goOffline", (body, callback) =>
        goOfflineSocket(deliveryIo, socket, body, callback)
    );

    socket.on("disconnect", () => {
        console.log("Delivery socket disconnected:", socket.id);
    });
});


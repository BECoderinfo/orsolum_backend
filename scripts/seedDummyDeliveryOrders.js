/**
 * Seed a few dummy orders for a delivery boy dashboard.
 * - Uses today's date so /deliveryboy/dashboard/performance/v1 shows counts.
 * - Creates Delivered, On the way, and Pending orders with amounts.
 * - Also updates the delivery boy's currentLocation, availabilityStatus, and rating
 *   so the profile card is fully populated.
 *
 * Usage:
 *   MONGO_URI="mongodb://localhost:27017/orsolum" node scripts/seedDummyDeliveryOrders.js
 *
 * Change deliveryBoyId below if needed.
 */
import mongoose from "mongoose";
import { dbConnect } from "../database.js";
import Order from "../models/Order.js";
import DeliveryBoy from "../models/DeliveryBoy.js";

const deliveryBoyId = "693f8a76a9da2dd037efe1b6"; // provided id

const toObjectId = (id) => id ? new mongoose.Types.ObjectId(id) : new mongoose.Types.ObjectId();

const makeOrder = ({ idx, status, grandTotal }) => {
    const now = new Date();
    const baseId = `DB-DUMMY-${idx}`;
    return {
        createdBy: toObjectId(),          // dummy user ref
        storeId: toObjectId(),            // dummy store ref
        productDetails: [{
            productId: toObjectId(),      // dummy product ref
            mrp: grandTotal,
            productPrice: grandTotal,
            quantity: 1,
            freeQuantity: 0,
            appliedOffers: []
        }],
        address: {},
        orderId: baseId,
        status,
        paymentStatus: "PENDING",
        summary: {
            totalAmount: grandTotal,
            discountAmount: 0,
            shippingFee: 0,
            donate: 0,
            grandTotal
        },
        assignedDeliveryBoy: toObjectId(deliveryBoyId),
        createdAt: now,
        updatedAt: now
    };
};

const seed = async () => {
    await dbConnect();

    // Ensure delivery boy exists and set profile fields
    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
        throw new Error(`Delivery boy not found for id ${deliveryBoyId}`);
    }

    deliveryBoy.currentLocation = { lat: 21.1702, lng: 72.8311 }; // Surat coords
    deliveryBoy.availabilityStatus = "available";
    deliveryBoy.rating = deliveryBoy.rating || 4.8;
    deliveryBoy.totalDeliveries = deliveryBoy.totalDeliveries || 5;
    await deliveryBoy.save();

    // Remove previous dummy orders from earlier runs
    await Order.deleteMany({ orderId: /DB-DUMMY-/i, assignedDeliveryBoy: deliveryBoy._id });

    const orders = [
        makeOrder({ idx: 1, status: "Delivered", grandTotal: 799 }),
        makeOrder({ idx: 2, status: "On the way", grandTotal: 549 }),
        makeOrder({ idx: 3, status: "Pending", grandTotal: 999 })
    ];

    const inserted = await Order.insertMany(orders);
    console.log(`Inserted ${inserted.length} dummy orders for delivery boy ${deliveryBoyId}`);
    console.log("OrderIds:", inserted.map(o => o.orderId));
};

seed()
    .then(() => {
        console.log("Seeding complete");
        process.exit(0);
    })
    .catch((err) => {
        console.error("Seeding failed:", err);
        process.exit(1);
    });


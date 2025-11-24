import mongoose from "mongoose";
import { jsonStatus, messages, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import DeliveryBoy from '../models/DeliveryBoy.js';
import DBoyAddress from '../models/DBoyAddress.js';
import WorkHours from '../models/WorkHours.js';
import WorkLog from '../models/WorkLog.js';
import OtpModel from '../models/Otp.js';
import { generateToken } from '../helper/generateToken.js';
import OTP_GENERATOR from "otp-generator";
import { sendSms } from '../helper/sendSms.js';
import { signedUrl } from '../helper/s3.config.js';
import Settlement from '../models/Settlement.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Deduction from '../models/Deduction.js';


import Order from '../models/Order.js';
import Store from '../models/Store.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';

// Get new orders for delivery boy
export const getNewOrders = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;

        // Define statuses that are relevant for delivery
        const deliveryStatuses = ["Pending", "Product shipped", "Out for delivery"];

        // Fetch orders:
        // 1. Unassigned orders (assignedDeliveryBoy is null or doesn't exist)
        // 2. Orders already assigned to this delivery boy
        const newOrders = await Order.find({
            status: { $in: deliveryStatuses },
            $or: [
                { assignedDeliveryBoy: { $exists: false } },
                { assignedDeliveryBoy: null },
                { assignedDeliveryBoy: deliveryBoyId }
            ]
        })
            .populate('createdBy', 'firstName lastName phone')
            .populate('storeId', 'storeName address phone')
            .populate('productDetails.productId', 'productName image')
            .sort({ createdAt: -1 })
            .limit(20);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: newOrders,
            totalCount: newOrders.length
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getNewOrders", error, req, res);
    }
};

// Fix the skipOrder function declaration (around line 65)
export const skipOrder = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const { orderId } = req.body;

        // Check if orderId is provided
        if (!orderId) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order ID is required"
            });
        }

        // Find order by ID
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found"
            });
        }

        // Allow skipping for Pending or Product shipped orders
        const allowedStatuses = ["Pending", "Product shipped"];
        if (!allowedStatuses.includes(order.status)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Only new or ready-to-deliver orders can be skipped"
            });
        }

        // Only allow skipping if order is not already assigned
        if (
            order.assignedDeliveryBoy &&
            order.assignedDeliveryBoy.toString() !== deliveryBoyId.toString()
        ) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order is already assigned to another delivery boy"
            });
        }

        // Add deliveryBoy to skippedBy array if not already skipped
        order.skippedBy = order.skippedBy || [];
        const alreadySkipped = order.skippedBy.some(
            id => id.toString() === deliveryBoyId.toString()
        );

        if (!alreadySkipped) {
            order.skippedBy.push(deliveryBoyId);
            await order.save();
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Order skipped successfully",
            data: order
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("skipOrder", error, req, res);
    }
};

// Fix the acceptOrder function (around line 202)
export const acceptOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const deliveryBoyId = req.user._id;

        if (!orderId) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order ID is required"
            });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found"
            });
        }

        if (order.assignedDeliveryBoy) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order already assigned to another delivery boy"
            });
        }

        // Add this validation after line 75 in acceptOrder function
        if (order.status !== "Product shipped") {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order is not ready for delivery"
            });
        }

        if (order.paymentStatus !== "SUCCESS") {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order payment is not completed"
            });
        }

        // Assign order to delivery boy
        order.assignedDeliveryBoy = deliveryBoyId;
        order.status = "On the way";
        order.acceptedAt = new Date();
        await order.save();

        // Update delivery boy status
        const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
        deliveryBoy.availabilityStatus = "on_delivery";
        await deliveryBoy.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Order accepted successfully",
            data: order
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("acceptOrder", error, req, res);
    }
};

// Pickup order from store
export const pickupOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const deliveryBoyId = req.user._id;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found"
            });
        }

        if (order.assignedDeliveryBoy.toString() !== deliveryBoyId.toString()) {
            return res.status(status.Forbidden).json({
                status: jsonStatus.Forbidden,
                success: false,
                message: "You are not assigned to this order"
            });
        }

        order.status = "On the way";
        order.pickedUpAt = new Date();
        await order.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Order picked up successfully",
            data: order
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("pickupOrder", error, req, res);
    }
};

// Fix the startNavigation function (around line 262)
export const startNavigation = async (req, res) => {
    try {
        const { orderId } = req.body;
        const deliveryBoyId = req.user._id;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found"
            });
        }

        if (order.assignedDeliveryBoy.toString() !== deliveryBoyId.toString()) {
            return res.status(status.Forbidden).json({
                status: jsonStatus.Forbidden,
                success: false,
                message: "You are not assigned to this order"
            });
        }

        order.status = "Out for delivery";
        order.navigationStartedAt = new Date();
        await order.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Navigation started successfully",
            data: order
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("startNavigation", error, req, res);
    }
};

// Reached customer location
export const reachedLocation = async (req, res) => {
    try {
        const { orderId } = req.body;
        const deliveryBoyId = req.user._id;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found"
            });
        }

        if (order.assignedDeliveryBoy.toString() !== deliveryBoyId.toString()) {
            return res.status(status.Forbidden).json({
                status: jsonStatus.Forbidden,
                success: false,
                message: "You are not assigned to this order"
            });
        }

        order.status = "Your Destination";
        order.reachedAt = new Date();
        await order.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Reached customer location",
            data: order
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("reachedLocation", error, req, res);
    }
};

// Complete delivery
export const completeDelivery = async (req, res) => {
    try {
        const { orderId, paymentMethod, amountCollected, deliveryNotes } = req.body;
        const deliveryBoyId = req.user._id;

        if (!orderId) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order ID is required"
            });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found"
            });
        }

        if (order.assignedDeliveryBoy.toString() !== deliveryBoyId.toString()) {
            return res.status(status.Forbidden).json({
                status: jsonStatus.Forbidden,
                success: false,
                message: "You are not assigned to this order"
            });
        }

        // Update order status
        order.status = "Delivered";
        order.deliveredTime = new Date(); // ✅ Fixed typo
        order.deliveryNotes = deliveryNotes;
        await order.save();

        // Handle COD payment
        if (paymentMethod === "COD" && amountCollected) {
            const payment = new Payment({
                orderId: order._id,
                amount: amountCollected,
                paymentMethod: "COD",
                status: "SUCCESS",
                collectedBy: deliveryBoyId,
                collectedAt: new Date(),
                type: "LocalStore", // Add required field
                userId: order.createdBy, // Add required field
                cfoOrder_id: order.cf_order_id || order.orderId // Add required field
            });
            await payment.save();
        }

        // Update delivery boy stats
        const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
        deliveryBoy.totalDeliveries += 1;
        deliveryBoy.availabilityStatus = "available";
        await deliveryBoy.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Delivery completed successfully",
            data: order
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("completeDelivery", error, req, res);
    }
};

// Get ongoing orders
export const getOngoingOrders = async (req, res) => {
    try {
        // Convert string ID to ObjectId
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);

        const ongoingOrders = await Order.find({
            assignedDeliveryBoy: deliveryBoyId,
            status: { $in: ["On the way", "Your Destination"] }
        })
            .populate('createdBy', 'firstName lastName phone')
            .populate('storeId', 'storeName address phone')
            .populate('productDetails.productId', 'productName image')
            .sort({ createdAt: -1 });

        res.status(200).json({
            status: 200,
            success: true,
            data: ongoingOrders,
            totalCount: ongoingOrders.length
        });
    } catch (error) {
        res.status(500).json({
            status: 500,
            success: false,
            message: error.message
        });
    }
};
// Get order details
export const getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const deliveryBoyId = req.user._id;

        const order = await Order.findById(id)
            .populate('createdBy', 'firstName lastName phone')
            .populate('storeId', 'storeName address phone')
            .populate('productDetails.productId', 'productName image')
            .populate('assignedDeliveryBoy', 'firstName lastName phone');

        if (!order) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found"
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: order
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getOrderDetails", error, req, res);
    }
};

// Update current location
export const updateCurrentLocation = async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const deliveryBoyId = req.user._id;

        const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
        if (!deliveryBoy) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Delivery boy not found"
            });
        }

        deliveryBoy.currentLocation = { lat, lng };
        await deliveryBoy.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Location updated successfully"
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("updateCurrentLocation", error, req, res);
    }
};

// Get earnings
export const getEarnings = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id); // ✅ convert to ObjectId
        const { period = 'today' } = req.query;

        const now = new Date();
        let startDate, endDate;

        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;

            case 'week':
                const dayOfWeek = now.getDay(); // 0 (Sun) - 6 (Sat)
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date();
                break;

            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;

            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        }

        const orders = await Order.find({
            assignedDeliveryBoy: deliveryBoyId,
            status: "Delivered",
            deliveredTime: { $gte: startDate, $lte: endDate } // make sure this field exists
        });

        const totalEarnings = orders.length * 50; // ₹50 per delivery
        const totalDeliveries = orders.length;

        res.status(200).json({
            status: 200,
            success: true,
            data: {
                totalEarnings,
                totalDeliveries,
                period,
                orders,
                startDate,
                endDate
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 500,
            success: false,
            message: error.message
        });
    }
};

// Get cash collections
export const getCashCollections = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;

        // Optional: add period filter
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        const orders = await Order.find({
            assignedDeliveryBoy: deliveryBoyId,
            status: "Delivered",
            paymentStatus: "CASH",
            deliveredTime: { $gte: startDate, $lte: endDate }
        });

        const totalCollected = orders.reduce((sum, order) => sum + order.summary.grandTotal, 0);

        res.status(200).json({
            status: 200,
            success: true,
            data: {
                totalCollected,
                payments: orders,
                totalPayments: orders.length
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 500,
            success: false,
            message: error.message
        });
    }
};


// Settle cash
export const settleCash = async (req, res) => {
    try {
        const { paymentIds } = req.body;
        const deliveryBoyId = req.user._id;

        if (!paymentIds || !Array.isArray(paymentIds)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Payment IDs array is required"
            });
        }

        const result = await Payment.updateMany(
            { _id: { $in: paymentIds }, collectedBy: deliveryBoyId },
            { status: "SETTLED", settledAt: new Date() }
        );

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Cash settled successfully",
            data: {
                modifiedCount: result.modifiedCount,
                matchedCount: result.matchedCount
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("settleCash", error, req, res);
    }
};

// Cash summary
export const getCashSummary = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const { period = 'today' } = req.query;

        const now = new Date();
        let startDate, endDate;
        if (period === 'week') {
            const dayOfWeek = now.getDay();
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
        } else if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        }

        const payments = await Payment.find({
            collectedBy: deliveryBoyId,
            paymentMethod: "COD",
            status: { $in: ["SUCCESS", "PENDING"] },
            collectedAt: { $gte: startDate, $lte: endDate }
        }).select('_id amount collectedAt status');

        const totalCollected = payments.reduce((s, p) => s + (p.amount || 0), 0);

        return res.status(200).json({
            status: 200, success: true,
            data: { totalCollected, totalPayments: payments.length, lastUpdated: new Date() }
        });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};

// Create settlement
export const createSettlement = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const { paymentIds = [], method = "CASH" } = req.body;

        if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
            return res.status(400).json({ status: 400, success: false, message: "paymentIds is required" });
        }

        const payments = await Payment.find({
            _id: { $in: paymentIds },
            collectedBy: deliveryBoyId,
            status: { $in: ["SUCCESS", "PENDING"] }
        }).select('_id amount');

        if (payments.length === 0) {
            return res.status(404).json({ status: 404, success: false, message: "No payments found to settle" });
        }

        const amount = payments.reduce((s, p) => s + (p.amount || 0), 0);

        // mark payments as SETTLED
        await Payment.updateMany({ _id: { $in: payments.map(p => p._id) } }, { status: "SETTLED", settledAt: new Date() });

        const settlement = await Settlement.create({
            deliveryBoyId,
            payments: payments.map(p => p._id),
            amount,
            method,
            status: "PENDING"
        });

        // Wallet debit entry to reflect payable cleared
        const dboy = await DeliveryBoy.findById(deliveryBoyId);
        const newBalance = (dboy.walletBalance || 0) - amount;
        dboy.walletBalance = newBalance;
        await dboy.save();

        await WalletTransaction.create({
            deliveryBoyId,
            type: "DEBIT",
            source: "SETTLEMENT",
            amount,
            balanceAfter: newBalance,
            meta: { settlementId: settlement._id, method }
        });

        return res.status(201).json({
            status: 201, success: true,
            message: "Settlement created",
            data: { settlementId: settlement._id, amount, count: payments.length }
        });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};


// List settlements
export const getSettlements = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            Settlement.find({ deliveryBoyId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Settlement.countDocuments({ deliveryBoyId })
        ]);

        return res.status(200).json({
            status: 200, success: true,
            data: items, pagination: { page, limit, total }
        });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};

// Settlement detail
export const getSettlementDetail = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const { id } = req.params;

        const settlement = await Settlement.findOne({ _id: id, deliveryBoyId })
            .populate('payments', 'amount paymentMethod collectedAt status');

        if (!settlement) {
            return res.status(404).json({ status: 404, success: false, message: "Settlement not found" });
        }

        return res.status(200).json({ status: 200, success: true, data: settlement });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};

// Wallet summary
export const getWalletSummary = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const dboy = await DeliveryBoy.findById(deliveryBoyId).select('walletBalance');
        return res.status(200).json({ status: 200, success: true, data: { walletBalance: dboy?.walletBalance || 0 } });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};

// Wallet statement
export const getWalletStatement = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const { type = "all" } = req.query;
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
        const skip = (page - 1) * limit;

        const filter = { deliveryBoyId };
        if (type === "credit") filter.type = "CREDIT";
        if (type === "debit") filter.type = "DEBIT";

        const [items, total] = await Promise.all([
            WalletTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            WalletTransaction.countDocuments(filter)
        ]);

        return res.status(200).json({
            status: 200, success: true,
            data: items, pagination: { page, limit, total }
        });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};

// Deductions list
export const getDeductions = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            Deduction.find({ deliveryBoyId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Deduction.countDocuments({ deliveryBoyId })
        ]);

        return res.status(200).json({ status: 200, success: true, data: items, pagination: { page, limit, total } });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};

// Deduction detail
export const getDeductionDetail = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const { orderId } = req.params;
        const doc = await Deduction.findOne({ deliveryBoyId, orderId });
        if (!doc) return res.status(404).json({ status: 404, success: false, message: "Deduction not found" });
        return res.status(200).json({ status: 200, success: true, data: doc });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};

// Payable QR
export const getPayableQR = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;

        // Outstanding payable = cash SUCCESS/PENDING - SETTLED
        const payments = await Payment.find({
            collectedBy: deliveryBoyId,
            paymentMethod: "COD",
            status: { $in: ["SUCCESS", "PENDING"] }
        }).select('amount');

        const settled = await Payment.find({
            collectedBy: deliveryBoyId,
            status: "SETTLED"
        }).select('amount');

        const totalCollected = payments.reduce((s, p) => s + (p.amount || 0), 0);
        const totalSettled = settled.reduce((s, p) => s + (p.amount || 0), 0);
        const amountToPay = Math.max(totalCollected - totalSettled, 0);

        const upi = process.env.COMPANY_UPI_ID || "test@upi";
        const name = process.env.COMPANY_UPI_NAME || "Orsolum";
        const upiUri = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name)}&am=${amountToPay}&cu=INR`;

        // You can render QR on client using this URI; backend can optionally serve PNG later
        return res.status(200).json({ status: 200, success: true, data: { amountToPay, upiUri } });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};

// Confirm payable (mark settlement as paid)
export const confirmPayable = async (req, res) => {
    try {
        const deliveryBoyId = req.user._id;
        const { settlementId, referenceId, amount } = req.body;

        const settlement = await Settlement.findOne({ _id: settlementId, deliveryBoyId });
        if (!settlement) return res.status(404).json({ status: 404, success: false, message: "Settlement not found" });

        if (amount && amount !== settlement.amount) {
            return res.status(400).json({ status: 400, success: false, message: "Amount mismatch" });
        }

        settlement.status = "PAID";
        settlement.referenceId = referenceId || settlement.referenceId;
        settlement.settledAt = new Date();
        await settlement.save();

        return res.status(200).json({ status: 200, success: true, message: "Payment confirmed", data: { id: settlement._id } });
    } catch (error) {
        return res.status(500).json({ status: 500, success: false, message: error.message });
    }
};

export const uploadDeliveryBoyProfileImage = async (req, res) => {
    try {
        // ✅ Add validation before calling signedUrl
        const { sFileName, sContentType } = req.body;

        if (!sFileName) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "sFileName is required"
            });
        }

        if (!sContentType) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "sContentType is required"
            });
        }

        signedUrl(req, res, "DeliveryBoy/");
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("uploadDeliveryBoyProfileImage", error, req, res);
    }
};

export const isDeliveryBoyExist = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please enter phone number"
            });
        }

        const deliveryBoy = await DeliveryBoy.findOne({ phone });
        if (deliveryBoy) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                isExist: true,
                message: `DeliveryBoy account already exists with ${phone}`
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            isExist: false
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("isDeliveryBoyExist", error, req, res);
    }
};

export const sendDeliveryBoyRegisterOtp = async (req, res) => {
    try {
        const { phone, name } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please enter phone number"
            });
        }

        const existingRecord = await DeliveryBoy.findOne({ phone });
        if (existingRecord) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: `DeliveryBoy account already exists with ${phone}`
            });
        }

        // Ensure any previous OTPs for this phone are removed so a new one is always generated
        await OtpModel.deleteMany({ phone });

        const otp = OTP_GENERATOR.generate(6, {
            upperCaseAlphabets: false,
            specialChars: false,
            lowerCaseAlphabets: false,
            digits: true
        });

        await sendSms(phone.replace("+", ""), { var1: name || "DeliveryBoy", var2: otp });

        // Set expiry to 1 minute
        const otpExpires = new Date(Date.now() + 1 * 60 * 1000);

        const otpRecord = new OtpModel({
            phone,
            otp,
            expiresAt: otpExpires
        });

        await otpRecord.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: `OTP has been sent to ${phone}`
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("sendDeliveryBoyRegisterOtp", error, req, res);
    }
};

export const sendDeliveryBoyLoginOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please enter phone number"
            });
        }

        const deliveryBoy = await DeliveryBoy.findOne({ phone });
        if (!deliveryBoy) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Mobile number does not exist"
            });
        }

        if (deliveryBoy.isDeleted) {
            return res.status(status.Forbidden).json({
                status: jsonStatus.Forbidden,
                success: false,
                message: "Your account was deleted!"
            });
        }

        if (!deliveryBoy.isActive) {
            return res.status(status.Unauthorized).json({
                status: jsonStatus.Unauthorized,
                success: false,
                message: "Your account is inactive! Please contact admin"
            });
        }

        await OtpModel.deleteMany({ phone });

        const otp = OTP_GENERATOR.generate(6, {
            upperCaseAlphabets: false,
            specialChars: false,
            lowerCaseAlphabets: false,
            digits: true
        });

        console.log("Generated OTP for", phone, "is:", otp);

        await sendSms(phone.replace('+', ''), { var1: deliveryBoy.firstName || 'User', var2: otp });

        const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

        const otpRecord = new OtpModel({
            phone,
            otp,
            expiresAt: otpExpires
        });

        await otpRecord.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: `OTP has been sent to ${phone}`
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("sendDeliveryBoyLoginOtp", error, req, res);
    }
};

export const registerDeliveryBoy = async (req, res) => {
    try {
        const { phone, otp, state, city } = req.body;

        if (!phone || !otp || !state || !city) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please enter phone, otp, state and city"
            });
        }

        const otpRecord = await OtpModel.findOne({ phone, otp, expiresAt: { $gt: Date.now() } });
        if (!otpRecord) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid OTP or phone number"
            });
        }

        if (otpRecord.expiresAt < Date.now()) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "OTP has expired"
            });
        }

        const existingUser = await DeliveryBoy.findOne({ phone });
        if (existingUser) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Phone number already exists"
            });
        }

        const deliveryBoy = new DeliveryBoy({ phone, state, city });
        await deliveryBoy.save();

        await OtpModel.deleteOne({ _id: otpRecord._id });

        const token = generateToken(deliveryBoy._id);

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: deliveryBoy,
            token
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("registerDeliveryBoy", error, req, res);
    }
};

export const loginDeliveryBoy = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please enter phone and otp"
            });
        }

        const otpRecord = await OtpModel.findOne({ phone, otp, expiresAt: { $gt: Date.now() } });
        if (!otpRecord) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid OTP or phone number"
            });
        }

        if (otpRecord.expiresAt < Date.now()) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "OTP has expired"
            });
        }

        const deliveryBoy = await DeliveryBoy.findOne({ phone });
        if (!deliveryBoy) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "DeliveryBoy not found"
            });
        }

        await OtpModel.deleteOne({ _id: otpRecord._id });

        const token = generateToken(deliveryBoy._id);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: deliveryBoy,
            token
        });

    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("loginDeliveryBoy", error, req, res);
    }
}

export const updateDeliveryBoyProfile = async (req, res) => {
    try {

        let { id } = req.params;

        let { firstName, lastName, dob, email } = req.body;

        let image;

        if (req.file) {
            image = req.file.key;
        }

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Missing DeliveryBoy ID",
            });
        }

        if (!firstName || !lastName || !dob || !email) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }

        const updatedDeliveryBoy = await DeliveryBoy.findByIdAndUpdate(
            id,
            { firstName, lastName, dob, email, image },
            { new: true, runValidators: true }
        );



        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: updatedDeliveryBoy,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

//address

export const createDBoyAddress = async (req, res) => {
    try {

        const { flatHouseNo, streetName, landmark, city, state, addressType } = req.body;

        if (!flatHouseNo || !streetName || !landmark || !city || !state || !addressType) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Missing required fields",
            });
        }

        const deliveryBoy = await DeliveryBoy.findById(req.user._id).select("-__v -createdAt -updatedAt");
        if (!deliveryBoy) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "DeliveryBoy not found",
            });
        }

        const address = new DBoyAddress({
            flatHouseNo,
            streetName,
            landmark,
            city,
            state,
            addressType,
            createdBy: deliveryBoy._id
        });

        await address.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: address
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("createDBoyAddress", error, req, res);
    }
};

export const getDBoyAddress = async (req, res) => {
    try {
        const deliveryBoy = await DeliveryBoy.findById(req.user._id);
        if (!deliveryBoy) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "DeliveryBoy not found",
            });
        }

        const address = await DBoyAddress.find({ createdBy: deliveryBoy._id });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: address
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getDBoyAddress", error, req, res);
    }
}

export const updateDBoyAddress = async (req, res) => {
    try {
        const { id } = req.params;

        const address = await DBoyAddress.findById(id);
        if (!address) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Address not found",
            });
        }

        let { flatHouseNo, streetName, landmark, city, state, addressType } = req.body;

        address.flatHouseNo = flatHouseNo;
        address.streetName = streetName;
        address.landmark = landmark;
        address.city = city;
        address.state = state;
        address.addressType = addressType;

        await address.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            messages: "Address updated successfully",
            // data: address
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("updateDBoyAddress", error, req, res);
    }
}

export const deleteDBoyAddress = async (req, res) => {
    try {
        const { id } = req.params;

        const address = await DBoyAddress.findById(id);
        if (!address) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Address not found",
            });
        }

        await DBoyAddress.findByIdAndDelete(id);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            messages: "Address deleted successfully",
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("deleteDBoyAddress", error, req, res);
    }
}

//work 

export const addWorkDetails = async (req, res) => {
    try {
        const id = req.user._id;

        const { workType, workCity } = req.body;

        if (!workType && !workCity) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Missing required fields",
            });
        }

        const deliveryBoy = await DeliveryBoy.findById(id);
        if (!deliveryBoy) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "DeliveryBoy not found",
            });
        }

        const updateData = {};

        if (workType) {
            const workDetails = await WorkHours.findById(workType);
            if (!workDetails) {
                return res.status(status.NotFound).json({
                    status: jsonStatus.NotFound,
                    success: false,
                    message: "Work hours not found",
                });
            }
            updateData.workType = workDetails._id;
        }

        if (workCity) {
            updateData.workCity = workCity;
        }

        const updatedDeliveryBoy = await DeliveryBoy.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: updatedDeliveryBoy,
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message,
        });
        return catchError("addWorkDetails", error, req, res);
    }
};

export const goOnlineSocket = async (io, socket, body, callback) => {
    try {
        const { deliveryBoyId } = body;
        let deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
        if (!deliveryBoy) return callback({ success: false, message: "DeliveryBoy not found" });

        deliveryBoy.availabilityStatus = "available";
        await deliveryBoy.save();

        const workLog = await WorkLog.create({ deliveryBoy: deliveryBoyId, checkIn: new Date() });

        callback({ success: true, message: "Online & work started", data: workLog });

        // Notify admins in realtime
        io.emit("deliveryBoyStatus", { deliveryBoyId, isOnline: true });
    } catch (err) {
        callback({ success: false, message: err.message });
    }
};

export const goOfflineSocket = async (io, socket, body, callback) => {
    try {
        const { deliveryBoyId } = body;
        let deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
        if (!deliveryBoy) return callback({ success: false, message: "DeliveryBoy not found" });

        deliveryBoy.availabilityStatus = "offline";
        await deliveryBoy.save();

        let workLog = await WorkLog.findOne({ deliveryBoy: deliveryBoyId, checkOut: null });
        if (workLog) {
            workLog.checkOut = new Date();
            const diff = (workLog.checkOut - workLog.checkIn) / (1000 * 60);
            workLog.totalMinutes = diff;
            await workLog.save();
        }

        callback({ success: true, message: "Offline & work ended", data: workLog });

        // Notify admins in realtime
        io.emit("deliveryBoyStatus", { deliveryBoyId, isOnline: false });
    } catch (err) {
        callback({ success: false, message: err.message });
    }
};

export const getWorkSummarySocket = async (io, socket, body, callback) => {
    try {
        const { deliveryBoyId } = body;

        // ----------------- TODAY -----------------
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // ----------------- WEEK -----------------
        const startOfWeek = new Date();
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // ----------------- MONTH -----------------
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);
        endOfMonth.setDate(0);
        endOfMonth.setHours(23, 59, 59, 999);

        // ----------------- FETCH LOGS -----------------
        const todayLogs = await WorkLog.find({
            deliveryBoy: deliveryBoyId,
            checkIn: { $gte: startOfDay, $lte: endOfDay }
        });

        const weekLogs = await WorkLog.find({
            deliveryBoy: deliveryBoyId,
            checkIn: { $gte: startOfWeek, $lte: endOfWeek }
        });

        const monthLogs = await WorkLog.find({
            deliveryBoy: deliveryBoyId,
            checkIn: { $gte: startOfMonth, $lte: endOfMonth }
        });

        // ----------------- CALCULATE -----------------
        const todayMinutes = todayLogs.reduce((sum, log) => sum + (log.totalMinutes || 0), 0);
        const weekMinutes = weekLogs.reduce((sum, log) => sum + (log.totalMinutes || 0), 0);
        const monthMinutes = monthLogs.reduce((sum, log) => sum + (log.totalMinutes || 0), 0);

        callback({
            success: true,
            message: "Work summary fetched",
            data: {
                today: {
                    totalMinutes: todayMinutes,
                    totalHours: (todayMinutes / 60).toFixed(2),
                },
                thisWeek: {
                    totalMinutes: weekMinutes,
                    totalHours: (weekMinutes / 60).toFixed(2),
                },
                thisMonth: {
                    totalMinutes: monthMinutes,
                    totalHours: (monthMinutes / 60).toFixed(2),
                }
            }
        });

    } catch (err) {
        callback({ success: false, message: err.message });
    }
};


// export const getWorkHoursSocket = async (io, socket, body, callback) => {
//     try {
//         const { deliveryBoyId } = body;
//         const logs = await WorkLog.find({ deliveryBoy: deliveryBoyId });
//         callback({ success: true, message: "Work logs fetched", data: logs });
//     } catch (err) {
//         callback({ success: false, message: err.message });
//     }
// };

// export const getWorkSummarySocket = async (io, socket, body, callback) => {
//     try {
//         const { deliveryBoyId } = body;

//         // ----------------- TODAY -----------------
//         const startOfDay = new Date();
//         startOfDay.setHours(0, 0, 0, 0);
//         const endOfDay = new Date();
//         endOfDay.setHours(23, 59, 59, 999);

//         // ----------------- WEEK -----------------
//         const startOfWeek = new Date();
//         const day = startOfWeek.getDay();
//         const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
//         startOfWeek.setDate(diff);
//         startOfWeek.setHours(0, 0, 0, 0);

//         const endOfWeek = new Date(startOfWeek);
//         endOfWeek.setDate(startOfWeek.getDate() + 6);
//         endOfWeek.setHours(23, 59, 59, 999);

//         // ----------------- MONTH -----------------
//         const startOfMonth = new Date();
//         startOfMonth.setDate(1);
//         startOfMonth.setHours(0, 0, 0, 0);

//         const endOfMonth = new Date(startOfMonth);
//         endOfMonth.setMonth(endOfMonth.getMonth() + 1);
//         endOfMonth.setDate(0);
//         endOfMonth.setHours(23, 59, 59, 999);

//         // ----------------- FETCH LOGS -----------------
//         const todayLogs = await WorkLog.find({
//             deliveryBoy: deliveryBoyId,
//             checkIn: { $gte: startOfDay, $lte: endOfDay }
//         });

//         const weekLogs = await WorkLog.find({
//             deliveryBoy: deliveryBoyId,
//             checkIn: { $gte: startOfWeek, $lte: endOfWeek }
//         });

//         const monthLogs = await WorkLog.find({
//             deliveryBoy: deliveryBoyId,
//             checkIn: { $gte: startOfMonth, $lte: endOfMonth }
//         });

//         // ----------------- CALCULATE -----------------
//         const todayMinutes = todayLogs.reduce((sum, log) => sum + (log.totalMinutes || 0), 0);
//         const weekMinutes = weekLogs.reduce((sum, log) => sum + (log.totalMinutes || 0), 0);
//         const monthMinutes = monthLogs.reduce((sum, log) => sum + (log.totalMinutes || 0), 0);

//         callback({
//             success: true,
//             message: "Work summary fetched",
//             data: {
//                 today: {
//                     totalMinutes: todayMinutes,
//                     totalHours: (todayMinutes / 60).toFixed(2),
//                 },
//                 thisWeek: {
//                     totalMinutes: weekMinutes,
//                     totalHours: (weekMinutes / 60).toFixed(2),
//                 },
//                 thisMonth: {
//                     totalMinutes: monthMinutes,
//                     totalHours: (monthMinutes / 60).toFixed(2),
//                 }
//             }
//         });

//     } catch (err) {
//         callback({ success: false, message: err.message });
//     }
// };




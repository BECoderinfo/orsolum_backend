import mongoose from "mongoose";
import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import DeliveryBoy from '../models/DeliveryBoy.js';
import Order from '../models/Order.js';
import WorkLog from '../models/WorkLog.js';
import Settlement from '../models/Settlement.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Deduction from '../models/Deduction.js';
import Payment from '../models/Payment.js';

// =============================================
// HELPER FUNCTIONS
// =============================================

// Get date range for different periods
const getDateRange = (period, selectedDate = null) => {
    const now = selectedDate ? new Date(selectedDate) : new Date();
    let startDate, endDate;

    switch (period) {
        case 'today':
        case 'daily':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;

        case 'week':
        case 'weekly':
            // Get Monday as start of week
            const dayOfWeek = now.getDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            break;

        case 'month':
        case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;

        case 'previousWeek':
            const currentDayOfWeek = now.getDay();
            const prevMondayOffset = currentDayOfWeek === 0 ? -13 : -6 - currentDayOfWeek;
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + prevMondayOffset);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            break;

        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }

    return { startDate, endDate };
};

// Format date for display
const formatDateRange = (startDate, endDate) => {
    const options = { day: 'numeric', month: 'short' };
    const start = startDate.toLocaleDateString('en-IN', options);
    const end = endDate.toLocaleDateString('en-IN', options);
    return `${start} - ${end}`;
};

// Format single date
const formatDate = (date) => {
    const options = { day: 'numeric', month: 'short' };
    return date.toLocaleDateString('en-IN', options);
};

// Calculate time on orders (in minutes) - from acceptedAt to deliveredTime
const calculateTimeOnOrders = (orders) => {
    let totalMinutes = 0;
    orders.forEach(order => {
        if (order.acceptedAt && order.deliveredTime) {
            const diff = new Date(order.deliveredTime) - new Date(order.acceptedAt);
            totalMinutes += diff / (1000 * 60);
        }
    });
    return Math.round(totalMinutes);
};

// Format minutes to hours:minutes string
const formatTimeToHoursMinutes = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} hr`;
};

// =============================================
// EARNING SCREEN SUMMARY API (1st Screen - Main)
// =============================================
/**
 * API: GET /deliveryboy/earning/screen/summary/v1
 * Purpose: Returns all data for the main earning screen (1st image)
 * 
 * Response includes:
 * - currentWeekEarning: Earning for current week (top card)
 * - pocket: Balance and withdraw limit
 * - payout: Previous week payout info
 * - deductionSummary: Total deductions
 * - cashEarningSummary: Earning in cash
 */
export const getEarningScreenSummary = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);

        // Get date ranges
        const currentWeek = getDateRange('week');
        const previousWeek = getDateRange('previousWeek');

        // 1. Current Week Earning
        const currentWeekOrders = await Order.find({
            assignedDeliveryBoy: deliveryBoyId,
            status: "Delivered",
            deliveredTime: { $gte: currentWeek.startDate, $lte: currentWeek.endDate }
        }).select('summary.grandTotal deliveredTime');

        const currentWeekEarning = currentWeekOrders.length * 50; // ₹50 per delivery (configurable)

        // 2. Pocket Balance & Withdraw Limit
        const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId).select('walletBalance');
        const pocketBalance = deliveryBoy?.walletBalance || 0;
        
        // Calculate available withdraw limit (you can customize this logic)
        const totalEarnings = await WalletTransaction.aggregate([
            { $match: { deliveryBoyId, type: "CREDIT" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalWithdrawn = await WalletTransaction.aggregate([
            { $match: { deliveryBoyId, type: "DEBIT", source: "SETTLEMENT" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        
        const baseWithdrawLimit = 750; // Base limit
        const availableWithdrawLimit = Math.max(baseWithdrawLimit, pocketBalance);

        // 3. Previous Week Payout
        const previousWeekSettlements = await Settlement.find({
            deliveryBoyId,
            createdAt: { $gte: previousWeek.startDate, $lte: previousWeek.endDate },
            status: { $in: ["PAID", "RECONCILED"] }
        }).select('amount');

        const previousWeekPayout = previousWeekSettlements.reduce((sum, s) => sum + (s.amount || 0), 0);

        // 4. Total Deductions (current month)
        const monthRange = getDateRange('month');
        const deductions = await Deduction.find({
            deliveryBoyId,
            createdAt: { $gte: monthRange.startDate, $lte: monthRange.endDate }
        }).select('total');

        const totalDeductions = deductions.reduce((sum, d) => sum + (d.total || 0), 0);

        // 5. Cash Earning (COD collections for current week)
        const cashOrders = await Order.find({
            assignedDeliveryBoy: deliveryBoyId,
            status: "Delivered",
            paymentStatus: "CASH",
            deliveredTime: { $gte: currentWeek.startDate, $lte: currentWeek.endDate }
        }).select('summary.grandTotal');

        const cashEarning = cashOrders.reduce((sum, o) => sum + (o.summary?.grandTotal || 0), 0);

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                // Top Card - Current Week Earning
                currentWeekEarning: {
                    amount: currentWeekEarning,
                    currency: "₹",
                    dateRange: formatDateRange(currentWeek.startDate, currentWeek.endDate),
                    startDate: currentWeek.startDate,
                    endDate: currentWeek.endDate,
                    deliveryCount: currentWeekOrders.length
                },
                
                // Pocket Section
                pocket: {
                    balance: pocketBalance,
                    availableWithdrawLimit: availableWithdrawLimit,
                    currency: "₹"
                },
                
                // Bottom Cards
                payout: {
                    amount: previousWeekPayout,
                    currency: "₹",
                    dateRange: formatDateRange(previousWeek.startDate, previousWeek.endDate),
                    startDate: previousWeek.startDate,
                    endDate: previousWeek.endDate
                },
                
                deductionSummary: {
                    totalAmount: totalDeductions,
                    currency: "₹",
                    count: deductions.length
                },
                
                cashEarningSummary: {
                    amount: cashEarning,
                    currency: "₹",
                    orderCount: cashOrders.length
                }
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getEarningScreenSummary", error, req, res);
    }
};

// =============================================
// DETAILED EARNINGS API (2nd Screen - Daily/Weekly/Monthly)
// =============================================
/**
 * API: GET /deliveryboy/earning/detailed/v1
 * Query Params: 
 *   - period: 'daily' | 'weekly' | 'monthly' (default: 'daily')
 *   - date: ISO date string (optional, default: today)
 * 
 * Purpose: Returns detailed earning data for 2nd screen with tabs
 * 
 * Response includes:
 * - totalEarning: Total amount earned
 * - ordersCount: Number of orders delivered
 * - timeOnOrders: Total time spent on deliveries
 * - orderEarning: Breakdown of order-wise earnings
 */
export const getDetailedEarnings = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);
        const { period = 'daily', date } = req.query;

        // Parse selected date
        let selectedDate = date ? new Date(date) : new Date();
        if (isNaN(selectedDate.getTime())) {
            selectedDate = new Date();
        }

        // Get date range based on period
        const { startDate, endDate } = getDateRange(period, selectedDate);

        // Fetch delivered orders in the date range
        const deliveredOrders = await Order.find({
            assignedDeliveryBoy: deliveryBoyId,
            status: "Delivered",
            deliveredTime: { $gte: startDate, $lte: endDate }
        })
        .populate('storeId', 'storeName')
        .populate('productDetails.productId', 'productName')
        .select('orderId summary.grandTotal acceptedAt deliveredTime address productDetails')
        .sort({ deliveredTime: -1 });

        // Calculate earnings (₹50 per delivery - configurable)
        const deliveryChargePerOrder = 50;
        const totalDeliveries = deliveredOrders.length;
        const orderEarning = totalDeliveries * deliveryChargePerOrder;

        // Calculate incentives (you can add custom logic)
        let incentives = 0;
        if (period === 'daily' && totalDeliveries >= 10) {
            incentives = 100; // ₹100 bonus for 10+ deliveries in a day
        } else if (period === 'weekly' && totalDeliveries >= 50) {
            incentives = 500; // ₹500 bonus for 50+ weekly deliveries
        }

        const totalEarning = orderEarning + incentives;

        // Calculate time on orders
        const timeOnOrdersMinutes = calculateTimeOnOrders(deliveredOrders);

        // Get deductions for the period
        const deductions = await Deduction.find({
            deliveryBoyId,
            createdAt: { $gte: startDate, $lte: endDate }
        }).select('total items');

        const totalDeductions = deductions.reduce((sum, d) => sum + (d.total || 0), 0);

        // Net earning after deductions
        const netEarning = totalEarning - totalDeductions;

        // Format order details for breakdown
        const orderDetails = deliveredOrders.map(order => ({
            orderId: order.orderId,
            storeName: order.storeId?.storeName || 'Unknown Store',
            orderAmount: order.summary?.grandTotal || 0,
            deliveryCharge: deliveryChargePerOrder,
            deliveredAt: order.deliveredTime,
            duration: order.acceptedAt && order.deliveredTime 
                ? Math.round((new Date(order.deliveredTime) - new Date(order.acceptedAt)) / (1000 * 60)) 
                : 0
        }));

        // Format display date
        let displayDate = '';
        if (period === 'daily') {
            const isToday = new Date().toDateString() === selectedDate.toDateString();
            displayDate = isToday ? `Today: ${formatDate(selectedDate)}` : formatDate(selectedDate);
        } else {
            displayDate = formatDateRange(startDate, endDate);
        }

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                period,
                displayDate,
                dateRange: {
                    startDate,
                    endDate
                },
                
                // Main stats
                totalEarning: netEarning,
                grossEarning: totalEarning,
                currency: "₹",
                
                // Order stats
                ordersCount: totalDeliveries,
                timeOnOrders: formatTimeToHoursMinutes(timeOnOrdersMinutes),
                timeOnOrdersMinutes,
                
                // Earning breakdown
                breakdown: {
                    orderEarning: {
                        amount: orderEarning,
                        label: "Order earning",
                        perOrder: deliveryChargePerOrder,
                        orderCount: totalDeliveries
                    },
                    incentives: {
                        amount: incentives,
                        label: "Incentives"
                    },
                    deductions: {
                        amount: totalDeductions,
                        label: "Deductions",
                        count: deductions.length
                    }
                },
                
                // Order-wise details (for expandable list)
                orders: orderDetails
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getDetailedEarnings", error, req, res);
    }
};

// =============================================
// WEEKLY EARNING BREAKDOWN API (For top card click)
// =============================================
/**
 * API: GET /deliveryboy/earning/weekly/breakdown/v1
 * Query Params:
 *   - startDate: Week start date (optional, default: current week)
 * 
 * Purpose: Returns day-wise breakdown for a week
 */
export const getWeeklyEarningBreakdown = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);
        const { startDate: queryStartDate } = req.query;

        // Get week date range
        let weekStart;
        if (queryStartDate) {
            weekStart = new Date(queryStartDate);
        } else {
            const now = new Date();
            const dayOfWeek = now.getDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
        }
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        // Get all delivered orders for the week
        const orders = await Order.find({
            assignedDeliveryBoy: deliveryBoyId,
            status: "Delivered",
            deliveredTime: { $gte: weekStart, $lte: weekEnd }
        }).select('deliveredTime summary.grandTotal acceptedAt');

        // Group by day
        const dailyBreakdown = [];
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const deliveryChargePerOrder = 50;

        for (let i = 0; i < 7; i++) {
            const dayStart = new Date(weekStart);
            dayStart.setDate(weekStart.getDate() + i);
            dayStart.setHours(0, 0, 0, 0);

            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);

            const dayOrders = orders.filter(order => {
                const orderDate = new Date(order.deliveredTime);
                return orderDate >= dayStart && orderDate <= dayEnd;
            });

            const dayEarning = dayOrders.length * deliveryChargePerOrder;
            const dayTimeMinutes = calculateTimeOnOrders(dayOrders);

            dailyBreakdown.push({
                day: dayNames[i],
                date: dayStart.toISOString().split('T')[0],
                displayDate: formatDate(dayStart),
                ordersCount: dayOrders.length,
                earning: dayEarning,
                timeOnOrders: formatTimeToHoursMinutes(dayTimeMinutes),
                timeOnOrdersMinutes: dayTimeMinutes
            });
        }

        // Calculate totals
        const totalOrders = orders.length;
        const totalEarning = totalOrders * deliveryChargePerOrder;
        const totalTimeMinutes = calculateTimeOnOrders(orders);

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                dateRange: formatDateRange(weekStart, weekEnd),
                startDate: weekStart,
                endDate: weekEnd,
                
                // Totals
                totalEarning,
                totalOrders,
                totalTime: formatTimeToHoursMinutes(totalTimeMinutes),
                currency: "₹",
                
                // Day-wise breakdown
                dailyBreakdown
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getWeeklyEarningBreakdown", error, req, res);
    }
};

// =============================================
// PAYOUT HISTORY API (Bottom card - Payout)
// =============================================
/**
 * API: GET /deliveryboy/earning/payout/history/v1
 * Query Params:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 10)
 * 
 * Purpose: Returns payout history for the delivery boy
 */
export const getPayoutHistory = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
        const skip = (page - 1) * limit;

        // Get settlements (payouts)
        const [payouts, total] = await Promise.all([
            Settlement.find({ 
                deliveryBoyId,
                status: { $in: ["PAID", "RECONCILED"] }
            })
            .sort({ settledAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
            Settlement.countDocuments({ 
                deliveryBoyId,
                status: { $in: ["PAID", "RECONCILED"] }
            })
        ]);

        // Group by week for display
        const formattedPayouts = payouts.map(payout => {
            const date = payout.settledAt || payout.createdAt;
            const weekStart = new Date(date);
            const dayOfWeek = weekStart.getDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            weekStart.setDate(weekStart.getDate() + mondayOffset);
            weekStart.setHours(0, 0, 0, 0);
            
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            return {
                id: payout._id,
                amount: payout.amount,
                currency: "₹",
                dateRange: formatDateRange(weekStart, weekEnd),
                settledAt: payout.settledAt,
                method: payout.method,
                status: payout.status,
                referenceId: payout.referenceId
            };
        });

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: formattedPayouts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getPayoutHistory", error, req, res);
    }
};

// =============================================
// CASH EARNINGS API (Bottom card - Earning in Cash)
// =============================================
/**
 * API: GET /deliveryboy/earning/cash/v1
 * Query Params:
 *   - period: 'today' | 'week' | 'month' (default: 'week')
 * 
 * Purpose: Returns cash earnings (COD collections)
 */
export const getCashEarnings = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);
        const { period = 'week' } = req.query;

        const { startDate, endDate } = getDateRange(period);

        // Get COD orders
        const cashOrders = await Order.find({
            assignedDeliveryBoy: deliveryBoyId,
            status: "Delivered",
            paymentStatus: "CASH",
            deliveredTime: { $gte: startDate, $lte: endDate }
        })
        .populate('storeId', 'storeName')
        .select('orderId summary.grandTotal deliveredTime')
        .sort({ deliveredTime: -1 });

        const totalCashCollected = cashOrders.reduce((sum, o) => sum + (o.summary?.grandTotal || 0), 0);

        // Get already settled amount
        const settledPayments = await Payment.find({
            collectedBy: deliveryBoyId,
            paymentMethod: "COD",
            status: "SETTLED",
            collectedAt: { $gte: startDate, $lte: endDate }
        }).select('amount');

        const settledAmount = settledPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const pendingAmount = totalCashCollected - settledAmount;

        const orderDetails = cashOrders.map(order => ({
            orderId: order.orderId,
            storeName: order.storeId?.storeName || 'Unknown Store',
            amount: order.summary?.grandTotal || 0,
            deliveredAt: order.deliveredTime
        }));

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                period,
                dateRange: formatDateRange(startDate, endDate),
                
                totalCashCollected,
                settledAmount,
                pendingAmount,
                currency: "₹",
                
                ordersCount: cashOrders.length,
                orders: orderDetails
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getCashEarnings", error, req, res);
    }
};

// =============================================
// POCKET STATEMENT API (Bottom card - Pocket Statement)
// =============================================
/**
 * API: GET /deliveryboy/earning/pocket/statement/v1
 * Query Params:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20)
 *   - type: 'all' | 'credit' | 'debit' (default: 'all')
 * 
 * Purpose: Returns pocket/wallet transaction history
 */
export const getPocketStatement = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);
        const { type = 'all' } = req.query;
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
        const skip = (page - 1) * limit;

        // Build filter
        const filter = { deliveryBoyId };
        if (type === 'credit') filter.type = "CREDIT";
        if (type === 'debit') filter.type = "DEBIT";

        // Get transactions
        const [transactions, total] = await Promise.all([
            WalletTransaction.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            WalletTransaction.countDocuments(filter)
        ]);

        // Get current balance
        const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId).select('walletBalance');

        // Calculate summary
        const creditTotal = await WalletTransaction.aggregate([
            { $match: { deliveryBoyId, type: "CREDIT" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        
        const debitTotal = await WalletTransaction.aggregate([
            { $match: { deliveryBoyId, type: "DEBIT" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const formattedTransactions = transactions.map(txn => ({
            id: txn._id,
            type: txn.type,
            source: txn.source,
            amount: txn.amount,
            balanceAfter: txn.balanceAfter,
            date: txn.createdAt,
            displayDate: formatDate(new Date(txn.createdAt)),
            description: getTransactionDescription(txn)
        }));

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                currentBalance: deliveryBoy?.walletBalance || 0,
                currency: "₹",
                
                summary: {
                    totalCredits: creditTotal[0]?.total || 0,
                    totalDebits: debitTotal[0]?.total || 0
                },
                
                transactions: formattedTransactions,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getPocketStatement", error, req, res);
    }
};

// Helper function to get transaction description
const getTransactionDescription = (txn) => {
    switch (txn.source) {
        case 'DELIVERY':
            return 'Delivery earning';
        case 'INCENTIVE':
            return 'Bonus/Incentive';
        case 'DEDUCTION':
            return 'Deduction';
        case 'SETTLEMENT':
            return 'Cash settlement';
        case 'ADJUSTMENT':
            return 'Adjustment';
        default:
            return txn.source;
    }
};

// =============================================
// DEDUCTION STATEMENT API (Bottom card - Deduction Statement)
// =============================================
/**
 * API: GET /deliveryboy/earning/deduction/statement/v1
 * Query Params:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20)
 * 
 * Purpose: Returns deduction history
 */
export const getDeductionStatement = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
        const skip = (page - 1) * limit;

        // Get deductions with order details
        const [deductions, total] = await Promise.all([
            Deduction.find({ deliveryBoyId })
                .populate('orderId', 'orderId')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Deduction.countDocuments({ deliveryBoyId })
        ]);

        // Calculate total deductions
        const totalDeductions = await Deduction.aggregate([
            { $match: { deliveryBoyId } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);

        const formattedDeductions = deductions.map(d => ({
            id: d._id,
            orderId: d.orderId?.orderId || 'N/A',
            items: d.items,
            total: d.total,
            status: d.status,
            date: d.createdAt,
            displayDate: formatDate(new Date(d.createdAt))
        }));

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                totalDeductions: totalDeductions[0]?.total || 0,
                currency: "₹",
                count: total,
                
                deductions: formattedDeductions,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getDeductionStatement", error, req, res);
    }
};

// =============================================
// WITHDRAW REQUEST API
// =============================================
/**
 * API: POST /deliveryboy/earning/withdraw/v1
 * Body: { amount: number }
 * 
 * Purpose: Create a withdraw request
 */
export const createWithdrawRequest = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Valid amount is required"
            });
        }

        // Get delivery boy wallet balance
        const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
        if (!deliveryBoy) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Delivery boy not found"
            });
        }

        if (deliveryBoy.walletBalance < amount) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Insufficient balance"
            });
        }

        // Create settlement request
        const settlement = await Settlement.create({
            deliveryBoyId,
            payments: [],
            amount,
            method: deliveryBoy.paymentMethod || "upi",
            status: "PENDING"
        });

        // Deduct from wallet
        const newBalance = deliveryBoy.walletBalance - amount;
        deliveryBoy.walletBalance = newBalance;
        await deliveryBoy.save();

        // Create wallet transaction
        await WalletTransaction.create({
            deliveryBoyId,
            type: "DEBIT",
            source: "SETTLEMENT",
            amount,
            balanceAfter: newBalance,
            meta: { settlementId: settlement._id, type: "WITHDRAW" }
        });

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Withdraw request created successfully",
            data: {
                settlementId: settlement._id,
                amount,
                newBalance,
                status: "PENDING"
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("createWithdrawRequest", error, req, res);
    }
};

// =============================================
// TODAY'S EARNING QUICK API
// =============================================
/**
 * API: GET /deliveryboy/earning/today/v1
 * 
 * Purpose: Quick API for today's earning stats
 */
export const getTodayEarning = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user._id);
        const { startDate, endDate } = getDateRange('today');

        // Get today's delivered orders
        const todayOrders = await Order.find({
            assignedDeliveryBoy: deliveryBoyId,
            status: "Delivered",
            deliveredTime: { $gte: startDate, $lte: endDate }
        }).select('summary.grandTotal acceptedAt deliveredTime');

        const deliveryChargePerOrder = 50;
        const totalDeliveries = todayOrders.length;
        const totalEarning = totalDeliveries * deliveryChargePerOrder;
        const timeOnOrdersMinutes = calculateTimeOnOrders(todayOrders);

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                date: startDate.toISOString().split('T')[0],
                displayDate: `Today: ${formatDate(startDate)}`,
                
                totalEarning,
                currency: "₹",
                ordersCount: totalDeliveries,
                timeOnOrders: formatTimeToHoursMinutes(timeOnOrdersMinutes),
                perOrderEarning: deliveryChargePerOrder
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("getTodayEarning", error, req, res);
    }
};

// =============================================
// ADD EARNING ON DELIVERY COMPLETION (Internal Helper)
// =============================================
/**
 * Call this function when an order is delivered to credit earning to wallet
 */
export const creditDeliveryEarning = async (deliveryBoyId, orderId, amount = 50) => {
    try {
        const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
        if (!deliveryBoy) return { success: false, message: "Delivery boy not found" };

        const newBalance = (deliveryBoy.walletBalance || 0) + amount;
        deliveryBoy.walletBalance = newBalance;
        await deliveryBoy.save();

        await WalletTransaction.create({
            deliveryBoyId,
            type: "CREDIT",
            source: "DELIVERY",
            amount,
            balanceAfter: newBalance,
            meta: { orderId }
        });

        return { success: true, newBalance };
    } catch (error) {
        console.error("Error crediting delivery earning:", error);
        return { success: false, message: error.message };
    }
};


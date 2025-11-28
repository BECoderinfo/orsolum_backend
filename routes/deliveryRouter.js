import express from "express";
import { body } from 'express-validator';
import { adminAuthentication, deliveryBoyAuthentication } from "../middlewares/middleware.js";
import { uploadDeliveryBoyImage } from "../helper/uploadImage.js";
import { getDeliveryNotifications, markDeliveryNotificationRead, clearDeliveryNotifications } from "../controllers/notificationController.js";

import {
    uploadDeliveryBoyProfileImage,
    sendDeliveryBoyRegisterOtp,
    sendDeliveryBoyLoginOtp,
    registerDeliveryBoy,
    loginDeliveryBoy,
    updateDeliveryBoyProfile,
    isDeliveryBoyExist,
    createDBoyAddress,
    updateDBoyAddress,
    deleteDBoyAddress,
    getDBoyAddress,
    addWorkDetails,
    getNewOrders,
    skipOrder,
    acceptOrder,
    pickupOrder,
    startNavigation,
    reachedLocation,
    completeDelivery,
    getOngoingOrders,
    getOrderDetails,
    getAssignedDeliveries,
    getDashboardProfile,
    getDashboardPerformance,
    getDashboardAssignedDeliveries,
    updateCurrentLocation,
    getEarnings,
    getCashCollections,
    settleCash,
    getCashSummary,
    createSettlement,
    getSettlements,
    getSettlementDetail,
    getWalletSummary,
    getWalletStatement,
    getDeductions,
    getDeductionDetail,
    getPayableQR,
    confirmPayable,
    assignOrderToDeliveryBoy
} from "../controllers/DeliveryBoyController.js";

// Import Earning APIs
import {
    getEarningScreenSummary,
    getDetailedEarnings,
    getWeeklyEarningBreakdown,
    getPayoutHistory,
    getCashEarnings,
    getPocketStatement,
    getDeductionStatement,
    createWithdrawRequest,
    getTodayEarning
} from "../controllers/EarningController.js";

const deliveryRouter = express.Router();

/* ===========================
        IMAGE UPLOAD
=========================== */
deliveryRouter.post(
    '/user/upload/delivery/image/v1',
    [
        body('sFileName').not().isEmpty(),
        body('sContentType').not().isEmpty()
    ],
    deliveryBoyAuthentication,
    uploadDeliveryBoyProfileImage
);

/* ===========================
        AUTHENTICATION
=========================== */
deliveryRouter.post('/deliveryboy/register/otp/v1', sendDeliveryBoyRegisterOtp);
deliveryRouter.post('/deliveryboy/login/otp/v1', sendDeliveryBoyLoginOtp);
deliveryRouter.post('/deliveryboy/register/v1', registerDeliveryBoy);
deliveryRouter.post('/deliveryboy/login/v1', loginDeliveryBoy);
deliveryRouter.get('/deliveryboy/is/exist/v1', isDeliveryBoyExist);

// Conditional middleware - only use multer for multipart/form-data requests
// Image is optional - user can update profile with or without image
const conditionalMulterUpload = (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    
    // Debug logging for troubleshooting
    console.log("📦 Update Profile - Content-Type:", contentType);
    
    if (contentType.includes('multipart/form-data')) {
        // Use multer for multipart requests (with or without image)
        // single('image') makes image optional - if no file, req.file will be undefined
        uploadDeliveryBoyImage.single('image')(req, res, (err) => {
            if (err) {
                // Only return error for actual file upload errors, not missing file
                if (err.code === 'LIMIT_FILE_SIZE') {
                    console.error("❌ Multer error - File too large:", err);
                    return res.status(400).json({
                        success: false,
                        message: "File size exceeds limit (5MB)"
                    });
                }
                if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                    console.error("❌ Multer error - Unexpected file field:", err);
                    return res.status(400).json({
                        success: false,
                        message: "Unexpected file field. Only 'image' field is allowed."
                    });
                }
                // For missing file or other non-critical errors, just log and continue
                // Image is optional, so missing file is not an error
                if (err.message && !err.message.includes('Unexpected field')) {
                    console.log("⚠️ Multer warning (non-critical):", err.message);
                }
            }
            // Continue even if no file was uploaded - image is optional
            // Multer will parse form data fields into req.body
            console.log("📦 Update Profile - Request Body keys (after multer):", req.body ? Object.keys(req.body) : 'empty');
            console.log("📦 Update Profile - File uploaded:", req.file ? 'Yes - ' + req.file.key : 'No (optional)');
            next();
        });
    } else {
        // For JSON requests, express.json() middleware should have already parsed the body
        // Just pass through to the controller
        console.log("📦 Update Profile - JSON request, body keys:", req.body ? Object.keys(req.body) : 'empty');
        next();
    }
};

deliveryRouter.put(
    '/deliveryboy/update/profile/v1/:id',
    deliveryBoyAuthentication,
    conditionalMulterUpload,
    updateDeliveryBoyProfile
);

/* ===========================
        ADDRESS MANAGEMENT
=========================== */
deliveryRouter.post('/deliveryboy/create/address/v1', deliveryBoyAuthentication, createDBoyAddress);
deliveryRouter.put('/deliveryboy/update/address/:id/v1', deliveryBoyAuthentication, updateDBoyAddress);
deliveryRouter.delete('/deliveryboy/delete/address/:id/v1', deliveryBoyAuthentication, deleteDBoyAddress);
deliveryRouter.get('/deliveryboy/get/address/v1', deliveryBoyAuthentication, getDBoyAddress);

/* ===========================
        WORK DETAILS
=========================== */
deliveryRouter.put('/deliveryboy/update/work/details/v1', deliveryBoyAuthentication, addWorkDetails);

/* ===========================
     ORDER MANAGEMENT APIs
=========================== */
deliveryRouter.post('/deliveryboy/admin/assign/order/v1', adminAuthentication, assignOrderToDeliveryBoy);
deliveryRouter.get('/deliveryboy/new/orders/v1', deliveryBoyAuthentication, getNewOrders);
deliveryRouter.get('/deliveryboy/assigned/deliveries/v1', deliveryBoyAuthentication, getAssignedDeliveries);
deliveryRouter.get('/deliveryboy/dashboard/profile/v1', deliveryBoyAuthentication, getDashboardProfile);
deliveryRouter.get('/deliveryboy/dashboard/performance/v1', deliveryBoyAuthentication, getDashboardPerformance);
deliveryRouter.get('/deliveryboy/dashboard/assigned-deliveries/v1', deliveryBoyAuthentication, getDashboardAssignedDeliveries);
deliveryRouter.post('/deliveryboy/skip/order/v1', deliveryBoyAuthentication, skipOrder);
deliveryRouter.post('/deliveryboy/accept/order/v1', deliveryBoyAuthentication, acceptOrder);
deliveryRouter.post('/deliveryboy/pickup/order/v1', deliveryBoyAuthentication, pickupOrder);
deliveryRouter.post('/deliveryboy/start/navigation/v1', deliveryBoyAuthentication, startNavigation);
deliveryRouter.post('/deliveryboy/reached/location/v1', deliveryBoyAuthentication, reachedLocation);
deliveryRouter.post('/deliveryboy/complete/delivery/v1', deliveryBoyAuthentication, completeDelivery);
deliveryRouter.get('/deliveryboy/ongoing/orders/v1', deliveryBoyAuthentication, getOngoingOrders);
deliveryRouter.get('/deliveryboy/order/details/:id/v1', deliveryBoyAuthentication, getOrderDetails);

/* ===========================
     LOCATION UPDATES
=========================== */
deliveryRouter.post('/deliveryboy/update/location/v1', deliveryBoyAuthentication, updateCurrentLocation);

/* ===========================
     EARNINGS & CASH
=========================== */
deliveryRouter.get('/deliveryboy/earnings/v1', deliveryBoyAuthentication, getEarnings);
deliveryRouter.get('/deliveryboy/cash/collections/v1', deliveryBoyAuthentication, getCashCollections);
deliveryRouter.post('/deliveryboy/settle/cash/v1', deliveryBoyAuthentication, settleCash);
deliveryRouter.get('/deliveryboy/cash/summary/v1', deliveryBoyAuthentication, getCashSummary);

/* ===========================
     EARNING SCREEN APIs (NEW)
=========================== */
// Main earning screen summary (1st screen - all sections)
deliveryRouter.get('/deliveryboy/earning/screen/summary/v1', deliveryBoyAuthentication, getEarningScreenSummary);

// Detailed earnings with daily/weekly/monthly tabs (2nd screen)
deliveryRouter.get('/deliveryboy/earning/detailed/v1', deliveryBoyAuthentication, getDetailedEarnings);

// Weekly earning breakdown (when clicking on top earning card)
deliveryRouter.get('/deliveryboy/earning/weekly/breakdown/v1', deliveryBoyAuthentication, getWeeklyEarningBreakdown);

// Today's earning quick API
deliveryRouter.get('/deliveryboy/earning/today/v1', deliveryBoyAuthentication, getTodayEarning);

// Payout history (bottom card - Payout)
deliveryRouter.get('/deliveryboy/earning/payout/history/v1', deliveryBoyAuthentication, getPayoutHistory);

// Cash earnings (bottom card - Earning in Cash)
deliveryRouter.get('/deliveryboy/earning/cash/v1', deliveryBoyAuthentication, getCashEarnings);

// Pocket statement (bottom card - Pocket Statement)
deliveryRouter.get('/deliveryboy/earning/pocket/statement/v1', deliveryBoyAuthentication, getPocketStatement);

// Deduction statement (bottom card - Deduction statement)
deliveryRouter.get('/deliveryboy/earning/deduction/statement/v1', deliveryBoyAuthentication, getDeductionStatement);

// Withdraw request
deliveryRouter.post('/deliveryboy/earning/withdraw/v1', deliveryBoyAuthentication, createWithdrawRequest);

/* ===========================
     SETTLEMENTS
=========================== */
deliveryRouter.post('/deliveryboy/settlements/create/v1', deliveryBoyAuthentication, createSettlement);
deliveryRouter.get('/deliveryboy/settlements/v1', deliveryBoyAuthentication, getSettlements);
deliveryRouter.get('/deliveryboy/settlements/:id/v1', deliveryBoyAuthentication, getSettlementDetail);

/* ===========================
     WALLET
=========================== */
deliveryRouter.get('/deliveryboy/wallet/summary/v1', deliveryBoyAuthentication, getWalletSummary);
deliveryRouter.get('/deliveryboy/wallet/statement/v1', deliveryBoyAuthentication, getWalletStatement);

/* ===========================
     DEDUCTIONS
=========================== */
deliveryRouter.get('/deliveryboy/deductions/v1', deliveryBoyAuthentication, getDeductions);
deliveryRouter.get('/deliveryboy/deductions/:orderId/v1', deliveryBoyAuthentication, getDeductionDetail);

/* ===========================
     PAYABLE & QR
=========================== */
deliveryRouter.get('/deliveryboy/payable/qr/v1', deliveryBoyAuthentication, getPayableQR);
deliveryRouter.post('/deliveryboy/payable/confirm/v1', deliveryBoyAuthentication, confirmPayable);

/* ===========================
     NOTIFICATIONS
=========================== */
deliveryRouter.get('/deliveryboy/notifications/v1', deliveryBoyAuthentication, getDeliveryNotifications);
deliveryRouter.patch('/deliveryboy/notifications/:id/read/v1', deliveryBoyAuthentication, markDeliveryNotificationRead);
deliveryRouter.delete('/deliveryboy/notifications/clear/v1', deliveryBoyAuthentication, clearDeliveryNotifications);

export default deliveryRouter;

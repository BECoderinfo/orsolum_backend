import express from "express";
import { body } from 'express-validator';
import { deliveryBoyAuthentication } from "../middlewares/middleware.js";
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
    confirmPayable
} from "../controllers/DeliveryBoyController.js";

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

deliveryRouter.put(
    '/deliveryboy/update/profile/v1/:id',
    deliveryBoyAuthentication,
    uploadDeliveryBoyImage.single('image'),
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
deliveryRouter.get('/deliveryboy/new/orders/v1', deliveryBoyAuthentication, getNewOrders);
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

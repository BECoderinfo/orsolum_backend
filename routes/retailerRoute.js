import express from "express";
import { isExist, sendRegisterOtp, sendLoginOtp, registerRetailer, loginRetailer, retailerHomePageData, retailerHomePageDataV2, getRetailerProfile, updateRetailerProfile, sendChangePhoneOtp, verifyChangePhoneOtp, logoutRetailer } from "../controllers/retailerController.js";
import { retailerAuthentication } from "../middlewares/middleware.js";
import { uploadUserImage, uploadStoreImagesMulter } from "../helper/uploadImage.js";
import { getRetailerNotifications, markRetailerNotificationRead, clearRetailerNotifications } from "../controllers/notificationController.js";
import { retailerPendingOrderList, retailerOrderHistoryList, retailerOrderDetailsV2, orderChangeStatus, retailerAssignedDeliveries, retailerAvailableDeliveryBoys, retailerAssignOrderToDeliveryBoy, retailerDeliveryBoyDashboard } from "../controllers/orderController.js";
import { createRetailerAdRequest, deleteRetailerAd, getRetailerAdDetails, getSellerAdsConfig, listRetailerAds } from "../controllers/adController.js";
const retailerRouter = express.Router();

// auth
retailerRouter.post('/is/exist/v1', isExist);
retailerRouter.post('/retailer/register/otp/v1', sendRegisterOtp);
retailerRouter.post('/retailer/login/otp/v1', sendLoginOtp);
retailerRouter.post('/retailer/register/v1', registerRetailer);
retailerRouter.post('/retailer/login/v1', loginRetailer);


// profile
retailerRouter.get('/retailer/my/profile/v1', retailerAuthentication, getRetailerProfile);
retailerRouter.put('/retailer/update/my/profile/v1', retailerAuthentication, uploadUserImage.single('image'), updateRetailerProfile);
retailerRouter.post('/retailer/change/phone/otp/v1', retailerAuthentication, sendChangePhoneOtp);
retailerRouter.post('/retailer/change/phone/verify/v1', retailerAuthentication, verifyChangePhoneOtp);

// retailerRouter.get('/retailer/home/page/v1', retailerAuthentication, retailerHomePageData);
retailerRouter.get('/retailer/home/page/v2', retailerAuthentication, retailerHomePageDataV2);

retailerRouter.post('/retailer/logout/v1', retailerAuthentication, logoutRetailer);

// notifications
retailerRouter.get('/retailer/notifications/v1', retailerAuthentication, getRetailerNotifications);
retailerRouter.patch('/retailer/notifications/:id/read/v1', retailerAuthentication, markRetailerNotificationRead);
retailerRouter.delete('/retailer/notifications/clear/v1', retailerAuthentication, clearRetailerNotifications);

// retailer order routes (mounted at /api, so accessible at /api/retailer/order/...)
retailerRouter.get('/retailer/pending/order/list/v2', retailerAuthentication, retailerPendingOrderList);
retailerRouter.get('/retailer/order/history/list/v2', retailerAuthentication, retailerOrderHistoryList);
retailerRouter.get('/retailer/order/details/:id/v2', retailerAuthentication, retailerOrderDetailsV2);
retailerRouter.put('/retailer/order/change/status/:id/v1', retailerAuthentication, orderChangeStatus);

// retailer delivery boy management routes
retailerRouter.get('/retailer/delivery/assigned/list/v1', retailerAuthentication, retailerAssignedDeliveries);
retailerRouter.get('/retailer/delivery/boys/v1', retailerAuthentication, retailerAvailableDeliveryBoys);
retailerRouter.get('/retailer/delivery/boys/dashboard/v1', retailerAuthentication, retailerDeliveryBoyDashboard);
retailerRouter.post('/retailer/delivery/assign/v1', retailerAuthentication, retailerAssignOrderToDeliveryBoy);

// Retailer ads management (mirrors seller flow)
retailerRouter.get('/retailer/ads/config/v1', retailerAuthentication, getSellerAdsConfig);
retailerRouter.post('/retailer/ads/v1', retailerAuthentication, uploadStoreImagesMulter.array("images", 10), createRetailerAdRequest);
retailerRouter.get('/retailer/ads/v1', retailerAuthentication, listRetailerAds);
retailerRouter.get('/retailer/ads/:id/v1', retailerAuthentication, getRetailerAdDetails);
retailerRouter.delete('/retailer/ads/:id/v1', retailerAuthentication, deleteRetailerAd);

export default retailerRouter;
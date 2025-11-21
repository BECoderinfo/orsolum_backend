import express from "express";
import { isExist, sendRegisterOtp, sendLoginOtp, registerRetailer, loginRetailer, retailerHomePageData, retailerHomePageDataV2, getRetailerProfile, updateRetailerProfile, sendChangePhoneOtp, verifyChangePhoneOtp, logoutRetailer } from "../controllers/retailerController.js";
import { retailerAuthentication } from "../middlewares/middleware.js";
import { uploadUserImage } from "../helper/uploadImage.js";
import { getRetailerNotifications, markRetailerNotificationRead, clearRetailerNotifications } from "../controllers/notificationController.js";
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

export default retailerRouter;
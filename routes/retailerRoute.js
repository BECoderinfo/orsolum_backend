import express from "express";
import { isExist, sendRegisterOtp, sendLoginOtp, registerRetailer, loginRetailer, retailerHomePageData, retailerHomePageDataV2 } from "../controllers/retailerController.js";
import { retailerAuthentication } from "../middlewares/middleware.js";
const retailerRouter = express.Router();

// auth
retailerRouter.post('/is/exist/v1', isExist);
retailerRouter.post('/retailer/register/otp/v1', sendRegisterOtp);
retailerRouter.post('/retailer/login/otp/v1', sendLoginOtp);
retailerRouter.post('/register/retailer/v1', registerRetailer);
retailerRouter.post('/login/retailer/v1', loginRetailer);

// retailerRouter.get('/retailer/home/page/v1', retailerAuthentication, retailerHomePageData);
retailerRouter.get('/retailer/home/page/v2', retailerAuthentication, retailerHomePageDataV2);

export default retailerRouter;
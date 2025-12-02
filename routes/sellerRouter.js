import express from "express";
import { sellerAuthentication } from "../middlewares/middleware.js";
import { uploadStoreImagesMulter, uploadUserImage } from "../helper/uploadImage.js";
import { createSellerStore, updateStoreObjectives, updateStoreLicense, getSellerStoreDetails } from "../controllers/sellerStoreController.js";
import { listOfCategories } from "../controllers/storeController.js";
import { 
  sendRegisterOtp,
  verifyRegisterOtp,
  updateSellerProfile,
  loginSeller,
  setSellerPassword,
  verifySellerPassword,
  getSellerProfile,
  getSellerDashboard,
    getSellerOrderList,
    getSellerOrderDetails,
} from "../controllers/sellerController.js";
import { getSellerNotifications, markSellerNotificationRead, clearSellerNotifications } from "../controllers/notificationController.js";
import { orderChangeStatus } from "../controllers/orderController.js";

const sellerRouter = express.Router();

// 🔐 Seller Authentication Routes
sellerRouter.post("/seller/send/register/otp/v1", sendRegisterOtp);
sellerRouter.post("/seller/verify/register/otp/v1", verifyRegisterOtp);
sellerRouter.put("/seller/update/profile/v1", sellerAuthentication, uploadUserImage.single('image'), updateSellerProfile);
sellerRouter.post("/seller/login/v1", loginSeller);
sellerRouter.post("/seller/set/password/v1", setSellerPassword); 
sellerRouter.post("/seller/verify/password/v1", verifySellerPassword);
sellerRouter.get("/seller/profile/details/v1", sellerAuthentication, getSellerProfile);

// 📊 Seller Dashboard
sellerRouter.get("/seller/dashboard/v1", sellerAuthentication, getSellerDashboard);

// 📦 Seller Orders
sellerRouter.get("/seller/orders/list/v1", sellerAuthentication, getSellerOrderList);
sellerRouter.get("/seller/orders/:id/details/v1", sellerAuthentication, getSellerOrderDetails);
sellerRouter.put("/seller/order/change/status/:id/v1", sellerAuthentication, orderChangeStatus);

// 🔔 Seller Notifications
sellerRouter.get("/seller/notifications/v1", sellerAuthentication, getSellerNotifications);
sellerRouter.patch("/seller/notifications/:id/read/v1", sellerAuthentication, markSellerNotificationRead);
sellerRouter.delete("/seller/notifications/clear/v1", sellerAuthentication, clearSellerNotifications);

// 🏪 Seller store creation
sellerRouter.post(
  "/seller/create/store/v1",
  sellerAuthentication,
  uploadStoreImagesMulter.array("images", 10),
  createSellerStore
);

// 📋 Seller store categories
sellerRouter.get("/seller/categories/list/v1", sellerAuthentication, listOfCategories);

// 🎯 Update Store Objectives
sellerRouter.put("/seller/store/objectives/v1", sellerAuthentication, updateStoreObjectives);

// 📄 Update Store License
sellerRouter.put("/seller/store/license/v1", sellerAuthentication, uploadStoreImagesMulter.single("license"), updateStoreLicense);

// 📊 Get Seller Store Details
sellerRouter.get("/seller/store/details/v1", sellerAuthentication, getSellerStoreDetails);

export default sellerRouter;

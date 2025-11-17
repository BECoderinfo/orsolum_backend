import express from "express";
import { sellerAuthentication } from "../middlewares/middleware.js";
import { uploadStoreImagesMulter } from "../helper/uploadImage.js";
import { createSellerStore } from "../controllers/sellerStoreController.js";
import { listOfCategories } from "../controllers/storeController.js";
import {
  sendRegisterOtp,
  verifyRegisterOtp,
  updateSellerProfile,
  loginSeller,
  setSellerPassword,
  verifySellerPassword,
  getSellerProfile,
} from "../controllers/sellerController.js";

const sellerRouter = express.Router();

// 🔐 Seller Authentication Routes
sellerRouter.post("/seller/send/register/otp/v1", sendRegisterOtp);
sellerRouter.post("/seller/verify/register/otp/v1", verifyRegisterOtp);
sellerRouter.put("/seller/update/profile/v1", sellerAuthentication, updateSellerProfile);
sellerRouter.post("/seller/login/v1", loginSeller);
sellerRouter.post("/seller/set/password/v1", setSellerPassword); 
sellerRouter.post("/seller/verify/password/v1", verifySellerPassword);
sellerRouter.get("/seller/profile/details/v1", sellerAuthentication, getSellerProfile);



// 🏪 Seller store creation
sellerRouter.post(
  "/seller/create/store/v1",
  sellerAuthentication,
  uploadStoreImagesMulter.array("images", 10),
  createSellerStore
);

// 📋 Seller store categories
sellerRouter.get("/seller/categories/list/v1", sellerAuthentication, listOfCategories);

export default sellerRouter;

import express from "express";
import { sellerAuthentication } from "../middlewares/middleware.js";
import { uploadStoreImagesMulter } from "../helper/uploadImage.js";
import { createSellerStore } from "../controllers/sellerStoreController.js";
import { 
  sendRegisterOtp, 
  verifyRegisterOtp, 
  updateSellerProfile, 
  loginSeller 
} from "../controllers/sellerController.js";

const sellerRouter = express.Router();

// 🔐 Seller Authentication Routes
sellerRouter.post("/seller/send/register/otp/v1", sendRegisterOtp);
sellerRouter.post("/seller/verify/register/otp/v1", verifyRegisterOtp);
sellerRouter.post("/seller/login/v1", loginSeller);

// 🧑‍💼 Update Seller Profile (multipart form)
sellerRouter.put(
  "/seller/update/profile/v1",
  sellerAuthentication,
  uploadStoreImagesMulter.single("image"),   // ✅ handles file upload
  updateSellerProfile
);

// 🏪 Seller store creation
sellerRouter.post(
  "/seller/create/store/v1",
  sellerAuthentication,
  uploadStoreImagesMulter.array("images", 10),
  createSellerStore
);

export default sellerRouter;

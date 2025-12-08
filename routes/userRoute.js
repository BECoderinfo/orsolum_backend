import express from "express";
import { body } from 'express-validator';
import { uploadProfileImage, loginUser, registerUser, sendLoginOtp, sendRegisterOtp, getMyProfile, updateMyProfile, deleteMyAccount, purchasePremium, reActivateMyAccount, logoutUser, shareMyProfile } from "../controllers/userController.js";
import { createAddress, editAddress, deleteAddress, getAddress, getAllAddress, getUserAllAddress, addProductToCart } from "../controllers/orderController.js";
import { userAuthentication } from "../middlewares/middleware.js";
import { uploadUserImage } from "../helper/uploadImage.js";
import { getUserNotifications, markUserNotificationRead, clearUserNotifications } from "../controllers/notificationController.js";
const userRouter = express.Router();

// image upload
userRouter.post('/user/upload/profile/image/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], userAuthentication, uploadProfileImage); // not in used

// auth
userRouter.post('/send/register/otp/v1', sendRegisterOtp);
userRouter.post('/send/login/otp/v1', sendLoginOtp);
userRouter.post('/register/user/v1', registerUser);
userRouter.post('/login/user/v1', loginUser);
userRouter.post('/logout/user/v1', userAuthentication, logoutUser);

// user
userRouter.get('/my/profile/v1', userAuthentication, getMyProfile);
userRouter.put('/update/my/profile/v1', userAuthentication, uploadUserImage.single('image'), updateMyProfile);
userRouter.get('/share/my/profile/v1', userAuthentication, shareMyProfile);
// aliases with '/user' prefix for clients calling /api/user/...
userRouter.get('/user/my/profile/v1', userAuthentication, getMyProfile);
userRouter.put('/user/update/my/profile/v1', userAuthentication, uploadUserImage.single('image'), updateMyProfile);
userRouter.get('/user/my/profile/share/v1', userAuthentication, shareMyProfile);
userRouter.delete('/delete/my/account/v1', userAuthentication, deleteMyAccount);
userRouter.post('/re-activate/my/account/v1', reActivateMyAccount);

// premium purchase
userRouter.post('/purchase/premium/v1', userAuthentication, purchasePremium);

// notifications
userRouter.get('/user/notifications/v1', userAuthentication, getUserNotifications);
userRouter.patch('/user/notifications/:id/read/v1', userAuthentication, markUserNotificationRead);
userRouter.delete('/user/notifications/clear/v1', userAuthentication, clearUserNotifications);

userRouter.post('/create/address/v1', userAuthentication, createAddress);
userRouter.put('/edit/address/:id/v1', userAuthentication, editAddress);
userRouter.delete('/delete/address/:id/v1', userAuthentication, deleteAddress);
userRouter.get('/get/address/:id/v1', userAuthentication, getAddress);
userRouter.get('/get/address/v1', userAuthentication, getAllAddress);
userRouter.get('/get/address/user/list/v1', userAuthentication, getUserAllAddress);

// Cart (alias without /order prefix for mobile clients)
userRouter.post('/add/product/in/cart/v1', userAuthentication, addProductToCart);

export default userRouter;
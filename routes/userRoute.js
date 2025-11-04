import express from "express";
import { body } from 'express-validator';
import { uploadProfileImage, loginUser, registerUser, sendLoginOtp, sendRegisterOtp, getMyProfile, updateMyProfile, deleteMyAccount, purchasePremium, reActivateMyAccount } from "../controllers/userController.js";
import { userAuthentication } from "../middlewares/middleware.js";
import { uploadUserImage } from "../helper/uploadImage.js";
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

// user
userRouter.get('/my/profile/v1', userAuthentication, getMyProfile);
userRouter.put('/update/my/profile/v1', userAuthentication, uploadUserImage.single('image'), updateMyProfile);
userRouter.delete('/delete/my/account/v1', userAuthentication, deleteMyAccount);
userRouter.post('/re-activate/my/account/v1', reActivateMyAccount);

// premium purchase
userRouter.post('/purchase/premium/v1', userAuthentication, purchasePremium);

export default userRouter;
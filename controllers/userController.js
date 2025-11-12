import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import OtpModel from '../models/Otp.js';
import PremiumMembership from '../models/PremiumMembership.js';
import { generateToken } from '../helper/generateToken.js';
import { signedUrl } from '../helper/s3.config.js';
import OTP_GENERATOR from "otp-generator";
import { sendSms } from '../helper/sendSms.js';
import axios from 'axios';

export const uploadProfileImage = async (req, res) => {
    try {
        signedUrl(req, res, 'Users/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadProfileImage', error, req, res);
    }
}

export const sendRegisterOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter phone number` });
        }

        const userRecord = await User.findOne({ phone });
        if (userRecord) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `${userRecord.role === 'user' ? 'User account' : 'Retailer account'}  Already exists with ${phone} mobile number.` });
        }

        // generate OTP login
        const otp = OTP_GENERATOR.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false, digits: true })
        // send OTP using msg91
        await sendSms(phone.replace('+', ''), { var1: req.body.name || 'User', var2: otp });

        // const otp = '123456';
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 mins

        const otpRecord = new OtpModel({
            phone,
            otp,
            expiresAt: otpExpires,
        });

        await otpRecord.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: `OTP has been sent to ${phone}` });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('sendRegisterOtp', error, req, res);
    }
};

export const sendLoginOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter phone number` });
        }

        const userRecord = await User.findOne({ phone });
        if (!userRecord) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Mobile number is not exist" });
        }

        if (userRecord.deleted) {
            return res.status(status.Forbidden).json({ status: jsonStatus.Forbidden, success: false, message: "Your account was deleted!" });
        }

        if (!userRecord.active) {
            return res.status(status.Unauthorized).json({ status: jsonStatus.Unauthorized, success: false, message: "Your account is in active! Please contact admin" });
        }

        if (userRecord.role !== 'user') {
            return res.status(status.OK).json({ status: jsonStatus.OK, success: false, message: `${userRecord.role === 'user' ? 'User account' : 'Retailer account'} Already exist with ${phone} mobile number` });
        }

        await OtpModel.deleteMany({ phone });

        // generate OTP login
        const otp = OTP_GENERATOR.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false, digits: true })
        // send OTP using msg91
        await sendSms(phone.replace('+', ''), { var1: userRecord.name || 'User', var2: otp });

        // const otp = '123456';
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 mins

        const otpRecord = new OtpModel({
            phone,
            otp,
            expiresAt: otpExpires,
        });

        await otpRecord.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: `OTP has been sent to ${phone}` });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('sendLoginOtp', error, req, res);
    }
};

export const registerUser = async (req, res) => {
    try {
        const { phone, otp, state, city, name } = req.body;

        if (!phone || !otp || !state || !city || !name) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter details` });
        }

        const otpRecord = await OtpModel.findOne({ phone, otp, expiresAt: { $gt: Date.now() } });
        if (!otpRecord) {
            return res.status(status.BadRequest).json({ jsonStatus: jsonStatus.BadRequest, success: false, message: 'Invalid OTP or phone number.' });
        }

        if (otpRecord.expiresAt < Date.now()) {
            return res.status(status.BadRequest).json({ jsonStatus: jsonStatus.BadRequest, success: false, message: 'OTP has expired.' });
        }

        const findUser = await User.findOne({ phone });
        if (findUser) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Phone number is already exists" });
        }

        const user = new User(req.body);
        await user.save();

        await OtpModel.deleteOne({ _id: otpRecord._id });

        const token = generateToken(user._id);

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: user, token });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('registerUser', error, req, res);
    }
};

export const loginUser = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter details` });
        }

        const otpRecord = await OtpModel.findOne({ phone, otp });
        if (!otpRecord) {
            return res.status(status.BadRequest).json({ jsonStatus: jsonStatus.BadRequest, success: false, message: 'Invalid OTP or phone number.' });
        }

        if (otpRecord.expiresAt < Date.now()) {
            return res.status(status.BadRequest).json({ jsonStatus: jsonStatus.BadRequest, success: false, message: 'OTP has expired.' });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(status.Forbidden).json({ status: jsonStatus.Forbidden, success: false, message: "User not found with this number" });
        }

        if (user.deleted) {
            return res.status(status.Forbidden).json({ status: jsonStatus.Forbidden, success: false, message: "Your account was deleted!" });
        }

        if (!user.active) {
            return res.status(status.Unauthorized).json({ status: jsonStatus.Unauthorized, success: false, message: "Your account is in active! Please contact admin" });
        }

        await OtpModel.deleteOne({ _id: otpRecord._id });

        const token = generateToken(user._id);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: user, token });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('loginUser', error, req, res);
    }
};

export const getMyProfile = async (req, res) => {
    try {

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: req.user });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getMyProfile', error, req, res);
    }
};

export const updateMyProfile = async (req, res) => {
    try {
        let { name, state, city, image } = req.body;

        // Handle file upload if image is provided
        if (req.file) {
            image = req.file.key;
        }

        // Build update object - only include fields that are provided
        const updateData = {};
        if (name) updateData.name = name;
        if (state) updateData.state = state;
        if (city) updateData.city = city;
        if (image) updateData.image = image;

        // Check if at least one field is being updated
        if (Object.keys(updateData).length === 0) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: "Please provide at least one field to update" 
            });
        }

        const updateUser = await User.findByIdAndUpdate(
            req.user._id, 
            updateData, 
            { new: true, runValidators: true }
        );

        if (!updateUser) {
            return res.status(status.NotFound).json({ 
                status: jsonStatus.NotFound, 
                success: false, 
                message: "User not found" 
            });
        }

        // Remove sensitive data from response
        const userData = updateUser.toObject();
        delete userData.password;

        res.status(status.OK).json({ 
            status: jsonStatus.OK, 
            success: true, 
            message: "Profile updated successfully",
            data: userData 
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ 
            status: jsonStatus.InternalServerError, 
            success: false, 
            message: error.message 
        });
        return catchError('updateMyProfile', error, req, res);
    }
};

export const deleteMyAccount = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { deleted: true }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteMyAccount', error, req, res);
    }
};

export const reActivateMyAccount = async (req, res) => {
    try {

        const { phone } = req.body;

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "No user found with this phone number" });
        }

        user.deleted = false;
        await user.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('reActivateMyAccount', error, req, res);
    }
};

export const purchasePremium = async (req, res) => {
    try {

        let premiumData = await PremiumMembership.find();
        premiumData = premiumData[0];

        // Generate payment session ID
        const paymentData = {
            order_currency: 'INR',
            order_amount: premiumData.price,
            order_tags: {
                forPayment: "Premium",
                userId: req.user._id,
                amount: premiumData.price.toString(),
                month: premiumData.perMonth.toString()
            },
            customer_details: {
                customer_id: req.user._id,
                customer_phone: req.user.phone.replace('+91', '')
            }
        };

        const headers = {
            'x-api-version': process.env.CF_API_VERSION,
            'x-client-id': process.env.CF_CLIENT_ID,
            'x-client-secret': process.env.CF_CLIENT_SECRET,
            'Content-Type': 'application/json'
        };

        const cashFreeSession = await axios.post(process.env.CF_CREATE_PRODUCT_URL, paymentData, { headers });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Order created successfully",
            data: {
                paymentSessionId: cashFreeSession.data.payment_session_id,
                cf_order_id: cashFreeSession.data.order_id
            }
        });
    } catch (error) {
        console.error("error", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('purchasePremium', error, req, res);
    }
};

// Logout user
export const logoutUser = async (req, res) => {
    try {
        // Verify user exists and is authenticated
        if (!req.user || !req.user._id) {
            return res.status(status.Unauthorized).json({
                status: jsonStatus.Unauthorized,
                success: false,
                message: "User not authenticated"
            });
        }

        // In a token-based system, logout is typically handled client-side by removing the token
        // However, we can add server-side logic here if needed (e.g., token blacklisting)
        // For now, we just confirm the logout was successful
        
        // Optional: You can add token blacklisting logic here if needed
        // For example, store the token in a blacklist cache/database
        
        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Logged out successfully",
            data: {
                userId: req.user._id,
                loggedOutAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message || "Failed to logout"
        });
        return catchError('logoutUser', error, req, res);
    }
};
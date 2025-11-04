import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import OtpModel from '../models/Otp.js';
import { generateToken } from '../helper/generateToken.js';
import OTP_GENERATOR from "otp-generator";
import { sendSms } from '../helper/sendSms.js';
import bcrypt from 'bcrypt';

// Send OTP for seller registration
export const sendRegisterOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: `Please enter phone number` 
            });
        }

        const userRecord = await User.findOne({ phone });
        if (userRecord) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: `Account already exists with ${phone} mobile number.` 
            });
        }

        // Generate OTP
        const otp = OTP_GENERATOR.generate(6, { 
            upperCaseAlphabets: false, 
            specialChars: false, 
            lowerCaseAlphabets: false, 
            digits: true 
        });

        // Send OTP using msg91
        await sendSms(phone.replace('+', ''), { 
            var1: req.body.name || 'Seller', 
            var2: otp 
        });

        // For testing: you can use '123456' as OTP
        // const otp = '123456';
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 mins

        const otpRecord = new OtpModel({
            phone,
            otp,
            expiresAt: otpExpires,
        });

        await otpRecord.save();

        res.status(status.OK).json({ 
            status: jsonStatus.OK, 
            success: true, 
            message: `OTP has been sent to ${phone}` 
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ 
            status: jsonStatus.InternalServerError, 
            success: false, 
            message: error.message 
        });
        return catchError('sendRegisterOtp', error, req, res);
    }
};

// Verify OTP and create temporary seller account (without password)
export const verifyRegisterOtp = async (req, res) => {
    try {
        const { email, phone, otp } = req.body;

        if (!email || !phone || !otp) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: `Please enter all details` 
            });
        }

        const otpRecord = await OtpModel.findOne({ phone, otp, expiresAt: { $gt: Date.now() } });
        if (!otpRecord) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: 'Invalid OTP or phone number.' 
            });
        }

        if (otpRecord.expiresAt < Date.now()) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: 'OTP has expired.' 
            });
        }

        // Check if user already exists
        let seller = await User.findOne({ phone });
        
        if (seller && seller.role !== 'seller') {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: `Account with role ${seller.role} already exists with this phone number.` 
            });
        }

        // Create or update seller account
        if (!seller) {
            // Extract name from email (before @) or use default
            const tempName = email.split('@')[0] || 'Seller';
            
            seller = new User({
                name: tempName, // Temporary name, will be updated in profile setup
                phone,
                email,
                role: 'seller',
                active: true,
                deleted: false
            });
        } else {
            seller.email = email;
            // If name is not set, set temporary name
            if (!seller.name || seller.name === 'Seller') {
                seller.name = email.split('@')[0] || 'Seller';
            }
        }

        await seller.save();
        await OtpModel.deleteOne({ _id: otpRecord._id });

        const token = generateToken(seller._id);

        res.status(status.Create).json({ 
            status: jsonStatus.Create, 
            success: true, 
            data: seller, 
            token 
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ 
            status: jsonStatus.InternalServerError, 
            success: false, 
            message: error.message 
        });
        return catchError('verifyRegisterOtp', error, req, res);
    }
};

// Update seller profile (set password and other details)
export const updateSellerProfile = async (req, res) => {
    try {
        const { name, mobile, email, password } = req.body;

        if (!name || !mobile || !email) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: `Please enter all required details` 
            });
        }

        // Get user from token (set by sellerAuthentication middleware)
        const seller = await User.findById(req.user._id);
        
        if (!seller || seller.role !== 'seller') {
            return res.status(status.Unauthorized).json({ 
                status: jsonStatus.Unauthorized, 
                success: false, 
                message: 'Seller not found' 
            });
        }

        // Update seller details
        seller.name = name;
        seller.phone = mobile.startsWith('+91') ? mobile : `+91${mobile}`;
        seller.email = email;
        
        if (password) {
            seller.password = password; // Will be hashed by pre-save hook
        }

        await seller.save();

        // Remove password from response
        const sellerData = seller.toObject();
        delete sellerData.password;

        res.status(status.OK).json({ 
            status: jsonStatus.OK, 
            success: true, 
            data: sellerData 
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ 
            status: jsonStatus.InternalServerError, 
            success: false, 
            message: error.message 
        });
        return catchError('updateSellerProfile', error, req, res);
    }
};

// Seller login with phone and password
export const loginSeller = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: `Please enter phone and password` 
            });
        }

        const seller = await User.findOne({ phone, role: 'seller' });
        
        if (!seller) {
            return res.status(status.NotFound).json({ 
                status: jsonStatus.NotFound, 
                success: false, 
                message: "Seller not found with this phone number" 
            });
        }

        if (seller.deleted) {
            return res.status(status.Forbidden).json({ 
                status: jsonStatus.Forbidden, 
                success: false, 
                message: "Your account was deleted!" 
            });
        }

        if (!seller.active) {
            return res.status(status.Unauthorized).json({ 
                status: jsonStatus.Unauthorized, 
                success: false, 
                message: "Your account is inactive! Please contact admin" 
            });
        }

        if (!seller.password) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: "Password not set. Please complete your profile setup." 
            });
        }

        // Verify password
        const checkPass = bcrypt.compareSync(password, seller.password);
        if (!checkPass) {
            return res.status(status.Unauthorized).json({ 
                status: jsonStatus.Unauthorized, 
                success: false, 
                message: "Invalid password" 
            });
        }

        const token = generateToken(seller._id);

        // Remove password from response
        const sellerData = seller.toObject();
        delete sellerData.password;

        res.status(status.OK).json({ 
            status: jsonStatus.OK, 
            success: true, 
            data: sellerData, 
            token 
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ 
            status: jsonStatus.InternalServerError, 
            success: false, 
            message: error.message 
        });
        return catchError('loginSeller', error, req, res);
    }
};


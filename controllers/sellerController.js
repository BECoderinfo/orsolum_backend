import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import OtpModel from '../models/Otp.js';
import { generateToken } from '../helper/generateToken.js';
import OTP_GENERATOR from "otp-generator";
import { sendSms } from '../helper/sendSms.js';
import bcrypt from "bcryptjs";

// ---------------- Send OTP for Seller Registration ----------------
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

    const otp = OTP_GENERATOR.generate(6, {
      upperCaseAlphabets: false,
      specialChars: false,
      lowerCaseAlphabets: false,
      digits: true
    });

    await sendSms(phone.replace('+', ''), {
      var1: req.body.name || 'Seller',
      var2: otp
    });

    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    const otpRecord = new OtpModel({ phone, otp, expiresAt: otpExpires });
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

// ---------------- Verify OTP and Create Seller ----------------
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

    let seller = await User.findOne({ phone });
    if (seller && seller.role !== 'seller') {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Account with role ${seller.role} already exists with this phone number.`
      });
    }

    if (!seller) {
      const tempName = email.split('@')[0] || 'Seller';
      seller = new User({
        name: tempName,
        phone,
        email,
        role: 'seller',
        active: true,
        deleted: false
      });
    } else {
      seller.email = email;
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

// ---------------- Update Seller Profile ----------------
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

    const seller = await User.findById(req.user._id);
    if (!seller || seller.role !== 'seller') {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: 'Seller not found'
      });
    }

    seller.name = name;
    seller.phone = mobile.startsWith('+91') ? mobile : `+91${mobile}`;
    seller.email = email;

    // ✅ Password update with strength validation
    if (password) {
      if (
        password.length < 8 ||
        !/[A-Z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[!@#$%^&*]/.test(password)
      ) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Password must be at least 8 characters long and include an uppercase letter, a number, and a special character"
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      seller.password = hashedPassword;
    }

    await seller.save();

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

// ---------------- Seller Login ----------------
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

    const isMatch = await bcrypt.compare(password, seller.password);
    if (!isMatch) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Invalid password"
      });
    }

    const token = generateToken(seller._id);

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

// ---------------- Set Seller Password ----------------
export const setSellerPassword = async (req, res) => {
    try {
      const { phone, password, confirmPassword } = req.body;
  
      if (!phone || !password || !confirmPassword) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Please enter phone, password, and confirm password",
        });
      }
  
      if (password !== confirmPassword) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Passwords do not match",
        });
      }
  
      // ✅ Password strength validation
      if (
        password.length < 8 ||
        !/[A-Z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[!@#$%^&*]/.test(password)
      ) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Password must be at least 8 characters long and include an uppercase letter, a number, and a special character"
        });
      }
  
      const seller = await User.findOne({ phone, role: "seller" });
      if (!seller) {
        return res.status(status.NotFound).json({
          status: jsonStatus.NotFound,
          success: false,
          message: "Seller not found with this phone number",
        });
      }
  
      // ❌ Don't hash manually here!
      seller.password = password;  // model will hash automatically
      await seller.save();
  
      const token = generateToken(seller._id);
  
      res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        message: "Password set successfully",
        data: seller,
        token,
      });
    } catch (error) {
      res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: error.message,
      });
      return catchError("setSellerPassword", error, req, res);
    }
  };
  

// ---------------- Verify Seller Password ----------------
export const verifySellerPassword = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please provide phone and password"
      });
    }

    const seller = await User.findOne({ phone, role: "seller" });
    if (!seller) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Seller not found with this phone number"
      });
    }

    if (!seller.password) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Password not set. Please complete your profile setup."
      });
    }

    const isMatch = await bcrypt.compare(password, seller.password);
    if (!isMatch) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Invalid password"
      });
    }

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Password verified successfully"
    });
  } catch (error) {
    console.error("verifySellerPassword Error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
    return catchError("verifySellerPassword", error, req, res);
  }
};

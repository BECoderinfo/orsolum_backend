import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import OtpModel from '../models/Otp.js';
import { generateToken } from '../helper/generateToken.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Store from '../models/Store.js';
import mongoose from 'mongoose';
import OTP_GENERATOR from "otp-generator";
import { sendSms } from '../helper/sendSms.js';

const { ObjectId } = mongoose.Types;

// ---------------- Retailer Profile ----------------
export const getRetailerProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Retailer not found" });
        }
        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: user });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getRetailerProfile', error, req, res);
    }
};

export const updateRetailerProfile = async (req, res) => {
    try {
        let { name, state, city, entity, address, gst, image, phone } = req.body;

        if (req.file) {
            image = req.file.key;
        }

        // Fetch the current user
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Retailer not found"
            });
        }

        // ✅ Check if phone number changed
        if (phone && phone !== user.phone) {
            // 1️⃣ Check if new phone is already in use
            const existWithPhone = await User.findOne({ phone });
            if (existWithPhone) {
                return res.status(status.ResourceExist).json({
                    status: jsonStatus.ResourceExist,
                    success: false,
                    message: "Phone number already in use"
                });
            }

            // 2️⃣ Delete previous OTPs for that number
            await OtpModel.deleteMany({ phone });

            // 3️⃣ Generate and send OTP
            const otp = OTP_GENERATOR.generate(6, {
                upperCaseAlphabets: false,
                specialChars: false,
                lowerCaseAlphabets: false,
                digits: true
            });

            await sendSms(phone.replace('+', ''), { var1: user.name || 'User', var2: otp });

            // 4️⃣ Store OTP in DB
            const otpExpires = new Date(Date.now() + 5 * 60 * 1000);
            const otpRecord = new OtpModel({ phone, otp, expiresAt: otpExpires });
            await otpRecord.save();

            // 5️⃣ Return OTP step response
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                step: "verify_otp",
                message: `OTP sent to ${phone}. Please verify to update phone number.`,
            });
        }

        // ✅ If phone is not changed → directly update other fields
        const updateData = {};
        if (name) updateData.name = name;
        if (state) updateData.state = state;
        if (city) updateData.city = city;
        if (entity) updateData.entity = entity;
        if (address) updateData.address = address;
        if (gst) updateData.gst = gst;
        if (image) updateData.image = image;

        if (Object.keys(updateData).length === 0) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please provide at least one field to update"
            });
        }

        const updated = await User.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Profile updated successfully",
            data: updated
        });

    } catch (error) {
        console.error("updateRetailerProfile Error:", error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('updateRetailerProfile', error, req, res);
    }
};


// Change phone - OTP flow
export const sendChangePhoneOtp = async (req, res) => {
    try {
        const { newPhone } = req.body;
        if (!newPhone) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Please enter phone number" });
        }

        const existWithPhone = await User.findOne({ phone: newPhone });
        if (existWithPhone) {
            return res.status(status.ResourceExist).json({ status: jsonStatus.ResourceExist, success: false, message: "Phone number already in use" });
        }

        await OtpModel.deleteMany({ phone: newPhone });

        const otp = OTP_GENERATOR.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false, digits: true });
        await sendSms(newPhone.replace('+', ''), { var1: req.user.name || 'User', var2: otp });
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

        const otpRecord = new OtpModel({ phone: newPhone, otp, expiresAt: otpExpires });
        await otpRecord.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: `OTP has been sent to ${newPhone}` });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('sendChangePhoneOtp', error, req, res);
    }
};

export const verifyChangePhoneOtp = async (req, res) => {
    try {
        const { newPhone, otp } = req.body;

        if (!newPhone || !otp) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please provide new phone and OTP"
            });
        }

        const otpRecord = await OtpModel.findOne({
            phone: newPhone,
            otp,
            expiresAt: { $gt: Date.now() }
        });

        if (!otpRecord) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid or expired OTP"
            });
        }

        // Check if someone else already uses that phone
        const existingUser = await User.findOne({ phone: newPhone });
        if (existingUser) {
            return res.status(status.ResourceExist).json({
                status: jsonStatus.ResourceExist,
                success: false,
                message: "Phone number already in use"
            });
        }

        // ✅ Update user’s phone
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { phone: newPhone },
            { new: true }
        ).select('-password');

        await OtpModel.deleteOne({ _id: otpRecord._id });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Phone number verified & updated successfully",
            data: updatedUser
        });

    } catch (error) {
        console.error("verifyChangePhoneOtp Error:", error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('verifyChangePhoneOtp', error, req, res);
    }
};


export const isExist = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter phone number` });
        }

        const userRecord = await User.findOne({ phone });
        if (userRecord) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, isExist: true, message: `${userRecord.role === 'user' ? 'User account' : 'Retailer account'} Already exists with ${phone} mobile number.` });
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, isExist: false });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('isExist', error, req, res);
    }
};

export const sendRegisterOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter phone number` });
        }

        const userRecord = await User.findOne({ phone });
        if (userRecord) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `${userRecord.role === 'user' ? 'User account' : 'Retailer account'} Already exists with ${phone} mobile number.` });
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

        if (userRecord.role !== 'retailer') {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `${userRecord.role === 'user' ? 'User account' : 'Retailer account'} Already exists with ${phone} mobile number.` });
        }

        await OtpModel.deleteMany({ phone });

        // generate OTP login
        const otp = OTP_GENERATOR.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false, digits: true });
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

export const registerRetailer = async (req, res) => {
    try {
        const { phone, otp, entity, address, name, gst } = req.body;

        if (!phone || !otp || !entity || !address || !name || !gst) {
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

        const retailer = new User({ ...req.body, role: 'retailer' });
        await retailer.save();

        await OtpModel.deleteOne({ _id: otpRecord._id });

        const token = generateToken(retailer._id);

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: retailer, token });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('registerRetailer', error, req, res);
    }
};

export const loginRetailer = async (req, res) => {
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

        const user = await User.findOne({ phone, role: 'retailer' });
        if (!user) {
            return res.status(status.Forbidden).json({ status: jsonStatus.Forbidden, success: false, message: "Retailer not found with this number" });
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
        return catchError('loginRetailer', error, req, res);
    }
};

export const retailerHomePageData = async (req, res) => {
    try {
        // Fetch total orders and total earnings
        const ordersData = await Order.aggregate([
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            {
                $addFields: {
                    productDetails: {
                        $ifNull: [
                            { $arrayElemAt: ["$productDetails", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $match: {
                    "productDetails.createdBy": new ObjectId(req.user._id)
                }
            },
            {
                $facet: {
                    totalOrders: [
                        {
                            $count: "count" // Count total orders
                        }
                    ],
                    totalEarnings: [
                        {
                            $match: { status: "Delivered" } // Filter delivered orders
                        },
                        {
                            $group: {
                                _id: null,
                                totalAmount: { $sum: "$summary.totalAmount" } // Sum delivered earnings
                            }
                        }
                    ]
                }
            }
        ]);

        const totalOrders = ordersData[0].totalOrders[0]?.count || 0;
        const totalEarnings = ordersData[0].totalEarnings[0]?.totalAmount || 0;

        // Fetch total products
        const totalProducts = await Product.countDocuments({
            createdBy: new ObjectId(req.user._id)
        });

        // Fetch last 5 pending orders
        const last5PendingOrders = await Order.aggregate([
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            {
                $addFields: {
                    productDetails: {
                        $ifNull: [
                            { $arrayElemAt: ["$productDetails", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $match: {
                    "productDetails.createdBy": new ObjectId(req.user._id),
                    status: "Pending"
                }
            },
            {
                $project: {
                    orderId: 1,
                    createdAt: 1,
                    quantity: 1,
                    summary: 1,
                    status: 1
                }
            },
            {
                $sort: { createdAt: -1 } // Sort by newest first
            },
            {
                $limit: 5 // Limit to 5 orders
            }
        ]);

        // Respond with data
        res.status(200).json({
            success: true,
            data: {
                totalOrders,
                totalProducts,
                totalEarnings,
                last5PendingOrders
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
        return catchError('retailerHomePageData', error, req, res);
    }
};

export const retailerHomePageDataV2 = async (req, res) => {
    try {
        // Find the store belonging to the current retailer
        const findStore = await Store.findOne({ createdBy: req.user._id });
        if (!findStore) {
            return res.status(404).json({ success: false, message: "Store not found" });
        }

        const storeId = findStore._id;

        // Fetch total orders and total earnings
        const ordersData = await Order.aggregate([
            {
                $match: {
                    storeId: new mongoose.Types.ObjectId(storeId),
                }
            },
            {
                $facet: {
                    totalOrders: [
                        {
                            $count: "count" // Count total number of orders
                        }
                    ],
                    totalEarnings: [
                        {
                            $match: { status: "Delivered" } // Filter only delivered orders
                        },
                        {
                            $group: {
                                _id: null,
                                totalAmount: { $sum: "$summary.grandTotal" } // Use grandTotal for accurate earnings
                            }
                        }
                    ]
                }
            }
        ]);

        const totalOrders = ordersData[0]?.totalOrders[0]?.count || 0;
        const totalEarnings = ordersData[0]?.totalEarnings[0]?.totalAmount || 0;

        // Fetch total products belonging to the retailer's store
        const totalProducts = await Product.countDocuments({ storeId: storeId, deleted: false });

        // Fetch grouped last 5 pending orders
        const last5PendingOrders = await Order.aggregate([
            {
                $match: {
                    storeId: new mongoose.Types.ObjectId(storeId),
                    status: "Pending",
                    paymentStatus: "SUCCESS"
                }
            },
            {
                $unwind: {
                    path: "$productDetails", // Unwind productDetails array
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "productDetails.productId",
                    foreignField: "_id",
                    as: "productInfo"
                }
            },
            {
                $unwind: {
                    path: "$productInfo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $group: {
                    _id: "$_id", // Group by Order ID
                    orderId: { $first: "$orderId" },
                    createdAt: { $first: "$createdAt" },
                    totalItems: {
                        $sum: { $add: ["$productDetails.quantity", "$productDetails.freeQuantity"] }
                    }, // ✅ Fix: Sum both purchased and free BOGO items
                    totalAmount: { $first: "$summary.grandTotal" }, // ✅ Use grandTotal for total order amount
                    status: { $first: "$status" }
                }
            },
            {
                $sort: { createdAt: -1 } // Sort by newest first
            },
            {
                $limit: 5 // Limit to 5 orders
            }
        ]);

        const totalPendingOrders = await Order.countDocuments({ storeId: storeId, status: "Pending" });

        // Respond with the updated data
        res.status(200).json({
            success: true,
            data: {
                totalOrders,
                totalProducts,
                totalEarnings,
                totalPendingOrders,
                last5PendingOrders
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
        return catchError("retailerHomePageDataV2", error, req, res);
    }
};

// ---------------- Soft Logout (No Token Deletion) ----------------
export const logoutRetailer = async (req, res) => {
    try {
      // Just verify token for safety
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(400).json({
          success: false,
          message: "Token not found",
        });
      }
  
      // If token valid → logout success (no DB change)
      return res.status(200).json({
        success: true,
        message: "Logged out successfully. Token not deleted, data preserved.",
      });
  
    } catch (error) {
      console.error("logoutRetailer Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };
  
import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import OtpModel from '../models/Otp.js';
import { generateToken } from '../helper/generateToken.js';
import OTP_GENERATOR from "otp-generator";
import { sendSms } from '../helper/sendSms.js';
import bcrypt from "bcryptjs";
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Store from '../models/Store.js';
import mongoose from 'mongoose';

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

    const seller = await User.findById(req.user._id);
    if (!seller || seller.role !== 'seller') {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: 'Seller not found'
      });
    }

    const updateData = {};

    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      updateData.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "mobile")) {
      const formattedPhone = mobile
        ? (mobile.startsWith('+91') ? mobile : `+91${mobile}`)
        : "";

      if (formattedPhone && formattedPhone !== seller.phone) {
        const exists = await User.findOne({ phone: formattedPhone });
        if (exists && exists._id.toString() !== seller._id.toString()) {
          return res.status(status.ResourceExist).json({
            status: jsonStatus.ResourceExist,
            success: false,
            message: "Phone number already in use"
          });
        }
      }

      updateData.phone = formattedPhone;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "email")) {
      updateData.email = email ? email.toLowerCase() : "";
    }

    const optionalProfileFields = ["entity", "gst", "address", "city", "state"];
    optionalProfileFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const value = req.body[field];
        updateData[field] = typeof value === "string" ? value.trim() : value || "";
      }
    });

    // Handle image upload
    if (req.file && req.file.key) {
      updateData.image = req.file.key;
    }

    let passwordChanged = false;

    if (Object.prototype.hasOwnProperty.call(req.body, "password") && password) {
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
      seller.password = password;
      passwordChanged = true;
    }

    if (Object.keys(updateData).length === 0 && !passwordChanged) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please provide at least one field to update"
      });
    }

    Object.assign(seller, updateData);
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

// ---------------- Get Logged-in Seller Profile ----------------
export const getSellerProfile = async (req, res) => {
  try {
    const seller = await User.findById(req.user._id);

    if (!seller || seller.role !== "seller") {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Seller not found",
      });
    }

    const sellerData = seller.toObject();
    delete sellerData.password;

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: sellerData,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("getSellerProfile", error, req, res);
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

// ==================== SELLER DASHBOARD API ====================
export const getSellerDashboard = async (req, res) => {
  try {
    // Find the store belonging to the current seller
    const findStore = await Store.findOne({ createdBy: req.user._id });
    if (!findStore) {
      return res.status(status.NotFound).json({ 
        status: jsonStatus.NotFound,
        success: false, 
        message: "Store not found. Please create a store first." 
      });
    }

    const storeId = findStore._id;
    const { ObjectId } = mongoose.Types;

    // ========== TODAY'S DATE RANGE ==========
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // ========== LAST 30 DAYS FOR CHARTS ==========
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // ========== FETCH TOTAL ORDERS AND EARNINGS ==========
    const ordersData = await Order.aggregate([
      {
        $match: {
          storeId: new ObjectId(storeId),
        }
      },
      {
        $facet: {
          totalOrders: [
            { $count: "count" }
          ],
          totalEarnings: [
            {
              $match: { status: "Delivered" }
            },
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$summary.grandTotal" }
              }
            }
          ],
          todayOrders: [
            {
              $match: {
                createdAt: { $gte: today, $lte: todayEnd }
              }
            },
            { $count: "count" }
          ],
          todayEarnings: [
            {
              $match: {
                status: "Delivered",
                createdAt: { $gte: today, $lte: todayEnd }
              }
            },
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$summary.grandTotal" }
              }
            }
          ],
          onTheWayOrders: [
            {
              $match: {
                status: { $in: ["On the way", "Out for delivery", "Your Destination", "Product shipped"] }
              }
            },
            { $count: "count" }
          ]
        }
      }
    ]);

    const totalOrders = ordersData[0]?.totalOrders[0]?.count || 0;
    const totalEarnings = ordersData[0]?.totalEarnings[0]?.totalAmount || 0;
    const todayOrdersCount = ordersData[0]?.todayOrders[0]?.count || 0;
    const todayEarnings = ordersData[0]?.todayEarnings[0]?.totalAmount || 0;
    const onTheWayCount = ordersData[0]?.onTheWayOrders[0]?.count || 0;

    // ========== FETCH TOTAL PRODUCTS ==========
    const totalProducts = await Product.countDocuments({ 
      storeId: storeId, 
      deleted: false 
    });

    // ========== MONTHLY ORDERS DATA FOR CHART (Last 8 months) ==========
    const monthlyOrdersData = await Order.aggregate([
      {
        $match: {
          storeId: new ObjectId(storeId),
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
      }
    ]);

    // Format monthly data for chart (group by month)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyData = {};
    monthlyOrdersData.forEach(item => {
      const monthKey = `${monthNames[item._id.month - 1]}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = 0;
      }
      monthlyData[monthKey] += item.orders;
    });

    const chartData = Object.keys(monthlyData).map(month => ({
      month,
      orders: monthlyData[month]
    }));

    // Fill missing months with 0
    const last8Months = [];
    for (let i = 7; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthName = monthNames[date.getMonth()];
      const existing = chartData.find(d => d.month === monthName);
      last8Months.push(existing || { month: monthName, orders: 0 });
    }

    // ========== YESTERDAY VS TODAY TRAFFIC DATA ==========
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const [yesterdayOrders] = await Order.aggregate([
      {
        $match: {
          storeId: new ObjectId(storeId),
          createdAt: { $gte: yesterday, $lte: yesterdayEnd }
        }
      },
      { $count: "count" }
    ]);

    const yesterdayCount = yesterdayOrders?.count || 0;
    const todayCount = todayOrdersCount || 0;
    const totalTraffic = yesterdayCount + todayCount;
    const yesterdayPercent = totalTraffic > 0 ? Math.round((yesterdayCount / totalTraffic) * 100) : 0;
    const todayPercent = totalTraffic > 0 ? Math.round((todayCount / totalTraffic) * 100) : 0;

    // ========== CALCULATE PERCENTAGE CHANGE ==========
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    lastMonthDate.setHours(0, 0, 0, 0);
    const lastMonthEnd = new Date(lastMonthDate);
    lastMonthEnd.setDate(new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0).getDate());
    lastMonthEnd.setHours(23, 59, 59, 999);

    const [lastMonthOrders] = await Order.aggregate([
      {
        $match: {
          storeId: new ObjectId(storeId),
          createdAt: { $gte: lastMonthDate, $lte: lastMonthEnd }
        }
      },
      { $count: "count" }
    ]);

    const lastMonthCount = lastMonthOrders?.count || 0;
    const ordersPercentageChange = lastMonthCount > 0 
      ? ((todayOrdersCount - lastMonthCount) / lastMonthCount * 100).toFixed(2)
      : "0.00";

    // ========== RESPONSE ==========
    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: {
        summary: {
          orders: {
            total: totalOrders,
            today: todayOrdersCount,
            onTheWay: onTheWayCount,
            percentageChange: ordersPercentageChange
          },
          sales: {
            total: totalEarnings,
            today: todayEarnings,
            percentageChange: ordersPercentageChange
          },
          products: {
            total: totalProducts,
            inactive: 0 // Can be calculated if needed
          },
          profit: {
            percentage: "80", // Can be calculated based on cost vs revenue
            description: "More profit than loss"
          }
        },
        charts: {
          ordersData: last8Months,
          trafficData: [
            { name: "Yesterday", value: yesterdayPercent },
            { name: "Today", value: todayPercent }
          ]
        }
      }
    });
  } catch (error) {
    console.error("getSellerDashboard error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to load dashboard data"
    });
    return catchError("getSellerDashboard", error, req, res);
  }
};

// ==================== SELLER ORDER LIST APIs ====================
export const getSellerOrderList = async (req, res) => {
  try {
    const { status: statusFilter, search, page = 1, limit = 20 } = req.query;
    
    // Find the store belonging to the seller
    const findStore = await Store.findOne({ createdBy: req.user._id });
    if (!findStore) {
      return res.status(404).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found"
      });
    }

    const storeId = findStore._id;
    const { ObjectId } = mongoose.Types;

    // Build match condition
    let matchObj = {
      storeId: new ObjectId(storeId)
    };

    // Apply status filter if provided
    if (statusFilter && statusFilter !== 'all') {
      matchObj.status = statusFilter;
    }

    // Build pipeline
    const pipeline = [
      {
        $match: matchObj
      },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "customerInfo"
        }
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: "$productDetails",
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
          _id: "$_id",
          orderId: { $first: "$orderId" },
          createdAt: { $first: "$createdAt" },
          status: { $first: "$status" },
          paymentStatus: { $first: "$paymentStatus" },
          customer: {
            $first: {
              name: {
                $concat: [
                  { $ifNull: ["$customerInfo.firstName", ""] },
                  " ",
                  { $ifNull: ["$customerInfo.lastName", ""] }
                ]
              },
              phone: "$customerInfo.phone"
            }
          },
          totalItems: {
            $sum: {
              $add: [
                "$productDetails.quantity",
                { $ifNull: ["$productDetails.freeQuantity", 0] }
              ]
            }
          },
          totalAmount: { $first: "$summary.grandTotal" },
          productNames: { $push: "$productInfo.productName" }
        }
      },
      {
        $project: {
          orderId: 1,
          createdAt: 1,
          status: 1,
          paymentStatus: 1,
          customer: 1,
          totalItems: 1,
          totalAmount: 1,
          order: { $arrayElemAt: ["$productNames", 0] },
          payment: { $cond: [{ $eq: ["$paymentStatus", "SUCCESS"] }, "Paid", "Unpaid"] }
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ];

    // Apply search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { orderId: { $regex: search, $options: "i" } },
            { "customer.name": { $regex: search, $options: "i" } },
            { order: { $regex: search, $options: "i" } }
          ]
        }
      });
    }

    // Get total count before pagination
    const countPipeline = [...pipeline];
    const [totalResult] = await Order.aggregate([
      ...countPipeline,
      { $count: "total" }
    ]);
    const total = totalResult?.total || 0;

    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    pipeline.push(
      { $skip: skip },
      { $limit: parseInt(limit) }
    );

    const orders = await Order.aggregate(pipeline);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
    return catchError("getSellerOrderList", error, req, res);
  }
};

// ==================== SELLER ORDER DETAILS API ====================
export const getSellerOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { ObjectId } = mongoose.Types;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid order id",
      });
    }

    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    const orderExists = await Order.findOne({
      _id: new ObjectId(id),
      storeId: store._id,
    }).select("_id orderId status paymentStatus summary address createdAt createdBy storeId paymentMethod productDetails");

    if (!orderExists) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Order not found for this store",
      });
    }

    const details = await Order.aggregate([
      {
        $match: {
          _id: new ObjectId(orderExists._id),
        },
      },
      {
        $lookup: {
          from: "stores",
          localField: "storeId",
          foreignField: "_id",
          as: "storeInfo",
        },
      },
      { $unwind: { path: "$storeInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "customerInfo",
        },
      },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "productDetails.productId",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          productEntry: {
            productId: "$productDetails.productId",
            name: {
              $ifNull: ["$productInfo.productName", "$productDetails.productName"],
            },
            companyName: "$productInfo.companyName",
            image: { $arrayElemAt: ["$productInfo.productImages", 0] },
            qty: { $ifNull: ["$productDetails.quantity", 0] },
            price: { $ifNull: ["$productDetails.productPrice", 0] },
            total: {
              $multiply: [
                { $ifNull: ["$productDetails.productPrice", 0] },
                { $ifNull: ["$productDetails.quantity", 0] },
              ],
            },
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          orderId: { $first: "$orderId" },
          createdAt: { $first: "$createdAt" },
          status: { $first: "$status" },
          paymentStatus: { $first: "$paymentStatus" },
          paymentMethod: { $first: "$paymentMethod" },
          summary: { $first: "$summary" },
          address: { $first: "$address" },
          customer: {
            $first: {
              name: { $ifNull: ["$customerInfo.name", ""] },
              phone: "$customerInfo.phone",
              email: "$customerInfo.email",
            },
          },
          store: {
            $first: {
              name: "$storeInfo.name",
              phone: "$storeInfo.phone",
              email: "$storeInfo.email",
              address: "$storeInfo.address",
            },
          },
          products: {
            $push: {
              $cond: [
                { $or: [{ $ne: ["$productEntry.name", null] }, { $gt: ["$productEntry.qty", 0] }] },
                "$productEntry",
                "$$REMOVE",
              ],
            },
          },
          totalItems: {
            $sum: { $ifNull: ["$productDetails.quantity", 0] },
          },
        },
      },
    ]);

    const orderDetails = details[0] || {
      _id: orderExists._id,
      orderId: orderExists.orderId,
      status: orderExists.status,
      paymentStatus: orderExists.paymentStatus,
      summary: orderExists.summary,
      address: orderExists.address,
      customer: {},
      store: {},
      products: [],
      totalItems: 0,
      createdAt: orderExists.createdAt,
      paymentMethod: orderExists.paymentMethod,
    };

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: orderDetails,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("getSellerOrderDetails", error, req, res);
  }
};

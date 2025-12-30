import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import OtpModel from '../models/Otp.js';
import { generateToken } from '../helper/generateToken.js';
import OTP_GENERATOR from "otp-generator";
import { sendSms } from '../helper/sendSms.js';
import { sendEmail } from '../helper/sendEmail.js';
import bcrypt from "bcryptjs";
import Order from '../models/Order.js';
import OnlineOrder from '../models/OnlineStore/OnlineOrder.js';
import Product from '../models/Product.js';
import Store from '../models/Store.js';
import SlotBooking from '../models/SlotBooking.js';
import HelpCenterTicket from '../models/HelpCenterTicket.js';
import { isAutomobileCategory } from './slotBookingController.js';
import mongoose from 'mongoose';

// ---------------- Send OTP for Seller Registration ----------------
export const sendRegisterOtp = async (req, res) => {
  try {
    const { phone, email } = req.body;

    if (!phone) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Please enter phone number`,
      });
    }

    // 🔐 Block duplicate seller with same phone
    const existingSellerPhone = await User.findOne({ phone, role: "seller" });
    if (existingSellerPhone) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `A seller account already exists with phone ${phone}`,
      });
    }

    // 🔐 Block duplicate seller with same email (if email provided)
    if (email) {
      const existingSellerEmail = await User.findOne({
        email: email.toLowerCase(),
        role: "seller",
      });
      if (existingSellerEmail) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: `A seller account already exists with email ${email}`,
        });
      }
    }

    const userRecord = await User.findOne({ phone });
    if (userRecord) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Account already exists with ${phone} mobile number.`,
      });
    }

    const otp = OTP_GENERATOR.generate(6, {
      upperCaseAlphabets: false,
      specialChars: false,
      lowerCaseAlphabets: false,
      digits: true,
    });

    const smsSent = await sendSms(phone.replace("+", ""), {
      var1: req.body.name || "Seller",
      var2: otp,
    });

    if (!smsSent) {
      return res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message:
          "Failed to send OTP. Please contact support or try again later.",
      });
    }

    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    const otpRecord = new OtpModel({ phone, otp, expiresAt: otpExpires });
    await otpRecord.save();

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: `OTP has been sent to ${phone}`,
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(status.BadRequest).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const seller = await User.findOne({
      email: email.toLowerCase(),
      role: "seller",
    });
    if (!seller) {
      return res.status(status.NotFound).json({
        success: false,
        message: "Seller not found with this email",
      });
    }

    // if (seller.deleted) {
    //   return res.status(status.Forbidden).json({
    //     success: false,
    //     message: "Your account was deleted!",
    //   });
    // }
   if (seller.deleted) {
     return res.status(status.Forbidden).json({
       success: false,
       message: "Your account was deleted!",
     });
   }
    if (!seller.active) {
      return res.status(status.Unauthorized).json({
        success: false,
        message: "Your account is inactive! Contact admin.",
      });
    }



    if (!seller.password) {
      return res.status(status.BadRequest).json({
        success: false,
        message: "Password not set. Please complete your profile setup.",
      });
    }


    const isMatch = await bcrypt.compare(password, seller.password);
    if (!isMatch) {
      return res.status(status.Unauthorized).json({
        success: false,
        message: "Invalid password",
      });
    }


        const store = await Store.findOne({ createdBy: seller._id }).lean();

        let onboardingInfo = {
          hasStore: false,
          onboardingCompleted: false,
          storeStatus: null, // "P" | "A" | "R" | null
        };

        if (store) {
          onboardingInfo = {
            hasStore: true,
            onboardingCompleted: !!store.onboardingCompleted,
            storeStatus: store.status || "P",
          };
        }



    const token = generateToken(seller._id);
    const sellerData = seller.toObject();
    delete sellerData.password;

    res.status(status.OK).json({
      success: true,
      data: sellerData,
      token,
      onboarding: onboardingInfo,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      success: false,
      message: error.message,
    });
  }
};


export const checkSellerStatus = async (req, res) => {
  try {
    const seller = await User.findById(req.user._id);

    const store = await Store.findOne({ createdBy: seller._id });

    let onboarding = {
      hasStore: !!store,
      onboardingCompleted: store?.onboardingCompleted || false,
      storeStatus: store?.status || null,
    };

    return res.json({
      success: true,
      onboarding,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateStoreInfo = async (req, res) => {
  try {
    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res
        .status(404)
        .json({ success: false, message: "Store not found" });
    }

    const { name, category, information, phone, address, email, directMe } =
      req.body;

    if (req.files?.length > 0) {
      store.images = req.files.map((f) => f.key);
      store.coverImage = store.images[0];
    }

    store.name = name || store.name;
    store.category = category || store.category;
    store.information = information || store.information;
    store.phone = phone || store.phone;
    store.address = address || store.address;
    store.email = email || store.email;
    store.directMe = directMe || store.directMe;
    store.updatedBy = req.user._id;

    await store.save();

    return res.json({
      success: true,
      message: "Store updated successfully",
      data: store,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
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
    const findStore = await Store.findOne({ createdBy: req.user._id })
      .populate("category", "name");
    if (!findStore) {
      return res.status(status.NotFound).json({ 
        status: jsonStatus.NotFound,
        success: false, 
        message: "Store not found. Please create a store first." 
      });
    }

    const storeId = findStore._id;
    const storeCategoryName = findStore?.category?.name || "";
    const isAutomobileStore = isAutomobileCategory(storeCategoryName);
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

    // ========== SLOT BOOKING SUMMARY ==========
    const slotBookingSummaryAgg = await SlotBooking.aggregate([
      {
        $match: {
          storeId: new ObjectId(storeId),
        },
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          today: [
            {
              $match: {
                createdAt: { $gte: today, $lte: todayEnd },
              },
            },
            { $count: "count" },
          ],
          pending: [
            { $match: { status: "pending" } },
            { $count: "count" },
          ],
          contacted: [
            { $match: { status: "contacted" } },
            { $count: "count" },
          ],
          done: [
            { $match: { status: "done" } },
            { $count: "count" },
          ],
          cancelled: [
            { $match: { status: "cancelled" } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const getFacetCount = (facetArray) => facetArray?.[0]?.count || 0;
    const slotBookingSummary = {
      total: getFacetCount(slotBookingSummaryAgg[0]?.total),
      today: getFacetCount(slotBookingSummaryAgg[0]?.today),
      pending: getFacetCount(slotBookingSummaryAgg[0]?.pending),
      contacted: getFacetCount(slotBookingSummaryAgg[0]?.contacted),
      done: getFacetCount(slotBookingSummaryAgg[0]?.done),
      cancelled: getFacetCount(slotBookingSummaryAgg[0]?.cancelled),
    };

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

    // ========== SLOT BOOKING TREND (last 7 days) ==========
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const slotTrendRaw = await SlotBooking.aggregate([
      {
        $match: {
          storeId: new ObjectId(storeId),
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    const slotTrendMap = new Map();
    slotTrendRaw.forEach((item) => {
      const key = `${item._id.year}-${item._id.month}-${item._id.day}`;
      slotTrendMap.set(key, item.count);
    });

    const slotBookingsTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      slotBookingsTrend.push({
        label: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        count: slotTrendMap.get(key) || 0,
      });
    }

    // ========== HELP CENTER SUMMARY ==========
    const helpCenterStatuses = ["open", "in_progress", "resolved", "closed"];
    const helpCenterSummaryBase = {
      total: 0,
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0
    };

    const helpCenterAgg = await HelpCenterTicket.aggregate([
      {
        $match: { sellerId: new ObjectId(req.user._id) }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    helpCenterAgg.forEach(item => {
      if (helpCenterStatuses.includes(item._id)) {
        helpCenterSummaryBase[item._id] = item.count;
        helpCenterSummaryBase.total += item.count;
      }
    });

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
          },
          slotBookings: slotBookingSummary,
          helpCenter: helpCenterSummaryBase
        },
        charts: {
          ordersData: last8Months,
          trafficData: [
            { name: "Yesterday", value: yesterdayPercent },
            { name: "Today", value: todayPercent }
          ],
          slotBookingsTrend
        },
        storeCategory: storeCategoryName,
        isAutomobileStore
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
    const sellerId = req.user._id;
    const { ObjectId } = mongoose.Types;

    // ✅ Build match condition for local store orders
    let matchObj = {
      storeId: new ObjectId(storeId)
    };

    // ✅ Build match condition for online orders
    let onlineMatchObj = {
      sellerId: new ObjectId(sellerId)
    };

    // Apply status filter if provided
    if (statusFilter && statusFilter !== 'all') {
      matchObj.status = statusFilter;
      onlineMatchObj.status = statusFilter;
    }

    // ✅ Build pipeline for local store orders
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
          invoiceUrl: { $first: "$invoiceUrl" },
          shiprocketShipmentId: { $first: "$shiprocket.shipment_id" },
          orderType: { $first: "local" }, // ✅ Add order type
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
          invoiceUrl: 1,
          shiprocketShipmentId: 1,
          orderType: 1,
          customer: 1,
          totalItems: 1,
          totalAmount: 1,
          order: { $arrayElemAt: ["$productNames", 0] },
          payment: { $cond: [{ $eq: ["$paymentStatus", "SUCCESS"] }, "Paid", "Unpaid"] }
        }
      }
    ];

    // ✅ Build pipeline for online orders
    const onlinePipeline = [
      {
        $match: onlineMatchObj
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
          invoiceUrl: { $first: "$invoiceUrl" },
          shiprocketShipmentId: { $first: null }, // Online orders may not have shiprocket
          orderType: { $first: "online" }, // ✅ Add order type
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
            $sum: "$productDetails.quantity"
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
          invoiceUrl: 1,
          shiprocketShipmentId: 1,
          orderType: 1,
          customer: 1,
          totalItems: 1,
          totalAmount: 1,
          order: { $arrayElemAt: ["$productNames", 0] },
          payment: { $cond: [{ $eq: ["$paymentStatus", "SUCCESS"] }, "Paid", "Unpaid"] }
        }
      }
    ];

    // Apply search filter to both pipelines
    if (search) {
      const searchMatch = {
        $or: [
          { orderId: { $regex: search, $options: "i" } },
          { "customer.name": { $regex: search, $options: "i" } },
          { order: { $regex: search, $options: "i" } }
        ]
      };
      pipeline.push({ $match: searchMatch });
      onlinePipeline.push({ $match: searchMatch });
    }

    // ✅ Get total count for both order types
    const countPipeline = [...pipeline];
    const onlineCountPipeline = [...onlinePipeline];
    
    const [localTotalResult] = await Order.aggregate([
      ...countPipeline,
      { $count: "total" }
    ]);
    
    const [onlineTotalResult] = await OnlineOrder.aggregate([
      ...onlineCountPipeline,
      { $count: "total" }
    ]);
    
    const localTotal = localTotalResult?.total || 0;
    const onlineTotal = onlineTotalResult?.total || 0;
    const total = localTotal + onlineTotal;

    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    pipeline.push(
      { $skip: skip },
      { $limit: parseInt(limit) },
      { $sort: { createdAt: -1 } }
    );
    
    onlinePipeline.push(
      { $skip: skip },
      { $limit: parseInt(limit) },
      { $sort: { createdAt: -1 } }
    );

    // ✅ Fetch both local and online orders
    const [localOrders, onlineOrders] = await Promise.all([
      Order.aggregate(pipeline),
      OnlineOrder.aggregate(onlinePipeline)
    ]);

    // ✅ Combine and sort by createdAt
    const allOrders = [...localOrders, ...onlineOrders].sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.status(200).json({
      success: true,
      data: allOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error in getSellerOrderList:", error);
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
    }).select("_id orderId status paymentStatus summary address createdAt createdBy storeId paymentMethod productDetails invoiceUrl shiprocket");

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
          invoiceUrl: { $first: "$invoiceUrl" },
          shiprocketShipmentId: { $first: "$shiprocket.shipment_id" },
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
      invoiceUrl: orderExists.invoiceUrl || null,
      shiprocketShipmentId: orderExists?.shiprocket?.shipment_id || null,
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

// ---------------- Forgot Password Flow ----------------

/**
 * STEP 1: Send OTP to Email
 */
export const sendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please enter your email address",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase(), role: "seller" });
    if (!user) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "No seller account found with this email",
      });
    }

    const otp = OTP_GENERATOR.generate(6, {
      upperCaseAlphabets: false,
      specialChars: false,
      lowerCaseAlphabets: false,
      digits: true,
    });

    // Hash OTP for secure storage
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Set expiry (10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Store in OtpModel
    await OtpModel.deleteMany({ email: email.toLowerCase() }); // Clear old ones
    const otpRecord = new OtpModel({ 
      email: email.toLowerCase(), 
      otp: hashedOtp, 
      expiresAt 
    });
    await otpRecord.save();

    // Send via email
    const emailSent = await sendEmail({
      to: email,
      subject: "Orsolum Seller - Password Reset OTP",
      text: `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`
    });

    if (!emailSent) {
      return res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: "Failed to send OTP email. Please try again.",
      });
    }

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "OTP has been sent to your email.",
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("sendForgotPasswordOtp", error, req, res);
  }
};

/**
 * STEP 2: Verify OTP
 */
export const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Email and OTP are required",
      });
    }

    const otpRecord = await OtpModel.findOne({ email: email.toLowerCase() }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "OTP not found or expired",
      });
    }

    if (new Date() > otpRecord.expiresAt) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "OTP has expired",
      });
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otp);
    if (!isMatch) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid OTP",
      });
    }

    // Mark as verified (optional: can use a flag, but for now we just allow the reset step to proceed if we find a valid record)
    // We'll keep the record until the actual reset happens.
    
    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "OTP verified successfully.",
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("verifyForgotPasswordOtp", error, req, res);
  }
};

/**
 * STEP 3: Reset Password
 */
export const resetForgotPassword = async (req, res) => {
  try {
    const { email, otp, password, confirmPassword } = req.body;

    if (!email || !otp || !password || !confirmPassword) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "All fields are required",
      });
    }

    if (password !== confirmPassword) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Passwords do not match",
      });
    }

    if (password.length < 8) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // Re-verify OTP for security
    const otpRecord = await OtpModel.findOne({ email: email.toLowerCase() }).sort({ createdAt: -1 });
    if (!otpRecord || new Date() > otpRecord.expiresAt) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "OTP session expired. Please start again.",
      });
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otp);
    if (!isMatch) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid OTP verification",
      });
    }

    // Update user password
    const user = await User.findOne({ email: email.toLowerCase(), role: "seller" });
    if (!user) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "User not found",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    // Delete OTP record
    await OtpModel.deleteMany({ email: email.toLowerCase() });

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("resetForgotPassword", error, req, res);
  }
};

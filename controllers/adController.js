import mongoose from "mongoose";
import Ad from "../models/Ad.js";
import Store from "../models/Store.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { jsonStatus, status } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";
import Notification from "../models/Notification.js";
import AdConfig from "../models/AdConfig.js";
import axios from "axios";
import crypto from "crypto";

const { ObjectId } = mongoose.Types;

// Allowed ad placements across Admin, Seller, and Retailer
const AD_LOCATIONS = ["crazy_deals", "trending_items", "popular_categories", "stores_near_me", "promotional_banner"];
const S3_BASE_URL = "https://orsolum.s3.ap-south-1.amazonaws.com/";
const BANK_SECRET = process.env.ADS_BANK_SECRET || process.env.BANK_SECRET || "";

const normalizeLocation = (loc) =>
  (loc || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

const ensureAbsoluteMediaUrl = (value) => {
  if (!value || typeof value !== "string") return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${S3_BASE_URL}${value}`;
};

const normalizeMediaArray = (list = []) =>
  Array.isArray(list) ? list.filter(Boolean).map(ensureAbsoluteMediaUrl) : [];

const extractUploadedUrls = (files = []) =>
  Array.isArray(files) ? files.map((file) => file.location || file.key).filter(Boolean) : [];

const encryptValue = (value) => {
  if (!BANK_SECRET || !value) return value;
  const key = crypto.createHash("sha256").update(BANK_SECRET).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(value, "utf8", "base64");
  encrypted += cipher.final("base64");
  return `${iv.toString("base64")}:${encrypted}`;
};

const decryptValue = (value) => {
  if (!BANK_SECRET || !value || !value.includes(":")) return value;
  try {
    const [ivStr, enc] = value.split(":");
    const key = crypto.createHash("sha256").update(BANK_SECRET).digest();
    const iv = Buffer.from(ivStr, "base64");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(enc, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    return value;
  }
};

// Group files when multer.any() is used
const groupAnyUploadedMedia = (files = []) => {
  if (!Array.isArray(files)) return { images: [], videos: [] };
  const images = [];
  const videos = [];
  files.forEach((file) => {
    if (file?.mimetype?.startsWith("image/") || ["images", "image", "banner"].includes(file.fieldname)) {
      images.push(file);
    } else if (file?.mimetype?.startsWith("video/") || ["videos", "video"].includes(file.fieldname)) {
      videos.push(file);
    }
  });
  return { images, videos };
};

const buildMediaPayload = (images = [], videos = []) => {
  const formattedImages = normalizeMediaArray(images);
  const formattedVideos = normalizeMediaArray(videos);
  const mediaAssets = [
    ...formattedImages.map((url) => ({ type: "image", url })),
    ...formattedVideos.map((url) => ({ type: "video", url })),
  ];

  return {
    formattedImages,
    formattedVideos,
    primaryImage: formattedImages[0] || null,
    primaryVideo: formattedVideos[0] || null,
    mediaAssets,
  };
};
// Allow only one ad per location per store per date range.
// Different stores can have ads in the same location simultaneously.
// If you ever want more concurrent ads per slot per store, bump this value.
const MAX_CONCURRENT_ADS_PER_LOCATION = 1;

const getAdsConfig = async () => {
  const config = await AdConfig.getSingleton();
  return config;
};

/**
 * Check for overlapping ads for a given location and date range.
 * It looks at active ads and paid/approved ads that are already scheduled.
 * IMPORTANT: Only checks ads for the SAME STORE - different stores can have ads in the same location.
 */
const findOverlappingAds = async ({
  location,
  projectedStart,
  projectedEnd,
  excludeAdId,
  storeId, // ✅ Filter by storeId - same location, different stores = OK
}) => {
  if (!projectedStart || !projectedEnd) {
    return { count: 0, conflicts: [] };
  }

  // Treat ads with null/undefined endDate as infinitely running (conflict)
  const endDateCondition = {
    $or: [
      { endDate: { $gte: projectedStart } },
      { endDate: { $exists: false } },
      { endDate: null },
    ],
  };

  const query = {
    location,
    deleted: { $ne: true },
    _id: excludeAdId ? { $ne: excludeAdId } : { $exists: true },
    // ✅ Only check ads for the same store - different stores can have ads in same location
    // If storeId is provided, only check conflicts for that specific store
    ...(storeId && ObjectId.isValid(storeId) 
      ? { storeId: new ObjectId(storeId) }
      : storeId 
      ? { storeId: storeId } // Already an ObjectId or string
      : {} // No storeId filter (for Orsolum ads - they check separately)
    ),
    // Consider active ads, or approved ads that are already paid/scheduled
    $or: [
      { status: "active" },
      { status: "approved", paymentStatus: "paid" },
    ],
    startDate: { $lte: projectedEnd },
    ...endDateCondition,
  };

  const conflicts = await Ad.find(query)
    .select("name startDate endDate sellerId storeId")
    .lean();

  return { count: conflicts.length, conflicts };
};

// ===================== SELLER APIs =====================

export const createSellerAdRequest = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const {
      name,
      description,
      location,
      totalRunDays,
      inquiry,
      storeId,
      productId,
      videos,
    } = req.body;

    const normalizedLocation = normalizeLocation(location);

    if (!name || !normalizedLocation || !totalRunDays) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please provide ad name, location and total run days",
      });
    }

    if (!AD_LOCATIONS.includes(normalizedLocation)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad location",
      });
    }

    // Handle uploaded images from multer + manual URLs
    let images = [];
    const { images: anyImages, videos: anyVideos } = groupAnyUploadedMedia(req.files);
    const uploadedImages = req.files?.images || anyImages || (Array.isArray(req.files) ? req.files : []);
    if (uploadedImages?.length) {
      images.push(...extractUploadedUrls(uploadedImages));
    }
    if (req.body.images) {
      // Fallback: comma-separated image URLs from body
      if (typeof req.body.images === "string") {
        images.push(
          ...req.body.images
            .split(",")
            .map((img) => img.trim())
            .filter(Boolean)
        );
      } else if (Array.isArray(req.body.images)) {
        images.push(...req.body.images.filter(Boolean));
      }
    }
    // Deduplicate images
    images = [...new Set(images)];

    // Videos (uploaded files or URLs)
    let videoUrls = [];
    const uploadedVideos = req.files?.videos || anyVideos || [];
    if (uploadedVideos?.length) {
      videoUrls.push(...extractUploadedUrls(uploadedVideos));
    }
    if (videos) {
      if (typeof videos === "string") {
        videoUrls.push(
          ...videos
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        );
      } else if (Array.isArray(videos)) {
        videoUrls.push(...videos.filter(Boolean));
      }
    }
    videoUrls = [...new Set(videoUrls)];

    // Ensure seller has a store (if not explicitly provided)
    let finalStoreId = storeId;
    if (!finalStoreId) {
      const store = await Store.findOne({ createdBy: sellerId });
      if (!store) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Store not found. Please create a store before creating ads.",
        });
      }
      finalStoreId = store._id;
    }

    // Validate productId if provided (bound to the same store to avoid cross-owner issues)
    let finalProductId = null;
    if (productId) {
      if (!ObjectId.isValid(productId)) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Invalid product ID",
        });
      }

      // Ensure the product is from the same store and not deleted.
      const product = await Product.findOne({
        _id: new ObjectId(productId),
        storeId: finalStoreId,
        deleted: false,
      });
      if (!product) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Product not found for this store or not accessible",
        });
      }

      finalProductId = new ObjectId(productId);
    }

    // Calculate amount based on config (per-day rate * days)
    const config = await getAdsConfig();
    const perDayRate = config?.locationRates?.[normalizedLocation] || 0;
    const totalAmount = perDayRate * Number(totalRunDays || 0);

    const ad = new Ad({
      sellerId,
      storeId: finalStoreId,
      productId: finalProductId,
      name: name.trim(),
      description: description?.trim(),
      location: normalizedLocation,
      images,
      videos: videoUrls,
      totalRunDays: Number(totalRunDays),
      inquiry: inquiry?.trim(),
      status: "pending",
      paymentStatus: "pending",
      amount: totalAmount,
    });

    await ad.save();

    return res.status(status.Create).json({
      status: jsonStatus.Create,
      success: true,
      message: "Ad request submitted successfully",
      data: ad,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("createSellerAdRequest", error, req, res);
  }
};

export const deleteSellerAd = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad id",
      });
    }

    const ad = await Ad.findOne({
      _id: new ObjectId(id),
      sellerId: new ObjectId(sellerId),
    });

    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ad not found",
      });
    }

    // Only allow deletion if ad is pending or rejected
    // Active/completed ads should not be deletable by seller
    if (ad.status === "active" || ad.status === "completed") {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Cannot delete active or completed ads. Please contact admin.",
      });
    }

    // Soft delete - mark as deleted
    ad.deleted = true;
    ad.deletedBy = "seller";
    if (ad.status !== "cancelled") {
      ad.status = "cancelled";
    }
    await ad.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Ad deleted successfully",
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("deleteSellerAd", error, req, res);
  }
};

export const listSellerAds = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { status: statusFilter } = req.query;

    const filter = { 
      sellerId: new ObjectId(sellerId),
      deleted: { $ne: true }, // Don't show deleted ads to seller
      isDead: { $ne: true }, // Don't show dead ads (payment deadline expired)
    };
    if (statusFilter && statusFilter !== "all") {
      filter.status = statusFilter;
    }

    const ads = await Ad.find(filter)
      .populate("sellerId", "name phone email")
      .populate("storeId", "name phone images")
      .populate("productId", "productName primaryImage productImages sellingPrice mrp price name")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: ads,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("listSellerAds", error, req, res);
  }
};

export const getSellerAdDetails = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad id",
      });
    }

    const ad = await Ad.findOne({
      _id: new ObjectId(id),
      sellerId: new ObjectId(sellerId),
    }).lean();

    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ad not found",
      });
    }

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: ad,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("getSellerAdDetails", error, req, res);
  }
};

export const renewSellerAd = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { id } = req.params;
    const { additionalRunDays } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad id",
      });
    }

    if (!additionalRunDays || Number(additionalRunDays) <= 0) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please provide valid additional run days",
      });
    }

    const ad = await Ad.findOne({
      _id: new ObjectId(id),
      sellerId: new ObjectId(sellerId),
    });

    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ad not found",
      });
    }

    // Create a new pending renewal request based on existing ad
    const renewal = new Ad({
      sellerId: ad.sellerId,
      storeId: ad.storeId,
      productId: ad.productId,
      name: ad.name,
      description: ad.description,
      location: ad.location,
      images: ad.images,
      videos: ad.videos,
      totalRunDays: Number(additionalRunDays),
      inquiry:
        req.body.inquiry ||
        `Renewal request for ad ${ad._id.toString()} for ${additionalRunDays} days`,
      status: "pending",
      paymentStatus: "pending",
    });

    await renewal.save();

    return res.status(status.Create).json({
      status: jsonStatus.Create,
      success: true,
      message: "Renewal request submitted successfully",
      data: renewal,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("renewSellerAd", error, req, res);
  }
};

// Retailer APIs reuse seller logic (retailers are also stored as users)
export const createRetailerAdRequest = (req, res) => createSellerAdRequest(req, res);
export const listRetailerAds = (req, res) => listSellerAds(req, res);
export const getRetailerAdDetails = (req, res) => getSellerAdDetails(req, res);

/**
 * Get payment info for approved ad (with bank details)
 * For seller/retailer to view payment information
 */
export const getAdPaymentInfo = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad ID",
      });
    }

    const ad = await Ad.findOne({
      _id: new ObjectId(id),
      sellerId: new ObjectId(userId),
      deleted: { $ne: true },
    }).lean();

    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ad not found",
      });
    }

    // Only show payment info if ad is approved and not dead
    if (ad.isDead || ad.deleted) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "This ad has been deleted due to payment deadline expiration",
      });
    }

    if (ad.status !== "approved" || ad.paymentStatus !== "pending") {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Payment info is only available for approved ads with pending payment",
      });
    }

    // Get bank details from config
    const config = await getAdsConfig();
    const decryptedBank = {
      accountName: decryptValue(config.bankDetails?.accountName || ""),
      accountNumber: decryptValue(config.bankDetails?.accountNumber || ""),
      ifsc: decryptValue(config.bankDetails?.ifsc || ""),
      bankName: config.bankDetails?.bankName || "",
      branch: config.bankDetails?.branch || "",
      upiId: decryptValue(config.bankDetails?.upiId || ""),
      note: config.bankDetails?.note || "first payment after will start ads",
    };

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Payment info fetched successfully",
      data: {
        ad: {
          _id: ad._id,
          name: ad.name,
          location: ad.location,
          amount: ad.amount || 0,
          paymentStatus: ad.paymentStatus,
          paymentDeadline: ad.paymentDeadline,
          totalRunDays: ad.totalRunDays,
        },
        paymentAmount: ad.amount || 0,
        bankDetails: decryptedBank,
        paymentDeadline: ad.paymentDeadline,
        canMakePayment: ad.status === "approved" && ad.paymentStatus === "pending" && !ad.isDead,
      },
    });
  } catch (error) {
    console.error("getAdPaymentInfo error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to fetch payment info",
    });
    return catchError("getAdPaymentInfo", error, req, res);
  }
};
export const deleteRetailerAd = (req, res) => deleteSellerAd(req, res);

// ===================== ADMIN APIs =====================

export const adminListAds = async (req, res) => {
  try {
    const { status: statusFilter, sellerId, location, search, includeDeleted } = req.query;

    const filter = {};
    // By default, exclude deleted ads from admin list
    // Only show deleted ads if explicitly requested with includeDeleted=true
    if (includeDeleted !== "true") {
      filter.deleted = { $ne: true };
    }
    
    if (statusFilter && statusFilter !== "all") {
      filter.status = statusFilter;
    }
    if (sellerId && ObjectId.isValid(sellerId)) {
      filter.sellerId = new ObjectId(sellerId);
    }
    if (location && AD_LOCATIONS.includes(location)) {
      filter.location = location;
    }
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const ads = await Ad.find(filter)
      .populate("sellerId", "name phone email")
      .populate("storeId", "name phone")
    .populate("productId", "name productName productImages primaryImage sellingPrice mrp price")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: ads,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("adminListAds", error, req, res);
  }
};

export const adminGetAdDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad id",
      });
    }

    const ad = await Ad.findById(id)
      .populate("sellerId", "name phone email")
      .populate("storeId", "name phone")
      .lean();

    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ad not found",
      });
    }

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: ad,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("adminGetAdDetails", error, req, res);
  }
};

export const adminUpdateAdStatus = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { id } = req.params;
    const {
      status: newStatus,
      paymentStatus,
      paymentReference,
      rejectionReason,
      startDate,
    } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad id",
      });
    }

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ad not found",
      });
    }

    if (newStatus && !["pending", "approved", "rejected", "active", "completed", "cancelled"].includes(newStatus)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid status value",
      });
    }

    if (paymentStatus && ["pending", "paid"].includes(paymentStatus)) {
      ad.paymentStatus = paymentStatus;
    }
    if (paymentReference !== undefined) {
      ad.paymentReference = paymentReference;
      // If admin provides a reference but no explicit paymentStatus, auto-mark paid
      if (!paymentStatus && ad.paymentStatus !== "paid") {
        ad.paymentStatus = "paid";
      }
    }
    // Allow admin to update amount during approval
    if (req.body.amount !== undefined && Number(req.body.amount) >= 0) {
      ad.amount = Number(req.body.amount);
    }

    // Helper function to project start/end without mutating ad
    const projectAdDates = (providedStartDate) => {
      const start = providedStartDate ? new Date(providedStartDate) : new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + (ad.totalRunDays || 1));
      return { start, end };
    };

  // Helper function to set start and end dates
  const setAdDates = (providedStartDate) => {
    const { start, end } = projectAdDates(providedStartDate);
    ad.startDate = start;
    ad.endDate = end;
    ad.expiryNotified = false;
    return { start, end };
  };

  // Prevent overlapping ads for the same location AND same store (active or scheduled/paid)
  // ✅ Different stores can have ads in the same location simultaneously
  const ensureNoActiveConflict = async (projectedStart) => {
    const projectedEnd = new Date(projectedStart);
    projectedEnd.setDate(projectedEnd.getDate() + (ad.totalRunDays || 1));

    // Convert storeId to string if it's an ObjectId
    const storeIdForCheck = ad.storeId 
      ? (ad.storeId.toString ? ad.storeId.toString() : ad.storeId)
      : null;

    const { count, conflicts } = await findOverlappingAds({
      location: ad.location,
      projectedStart,
      projectedEnd,
      excludeAdId: ad._id,
      storeId: storeIdForCheck, // ✅ Only check conflicts for the same store
    });

    if (count >= MAX_CONCURRENT_ADS_PER_LOCATION) {
      const c = conflicts[0];
      const conflictStart = c?.startDate?.toISOString?.() || "";
      const conflictEnd = c?.endDate?.toISOString?.() || "";
      return {
        conflict: true,
        message: `Ad slot already booked for ${ad.location} in your store between ${conflictStart} and ${conflictEnd}. Please choose different dates.`,
      };
    }
    return { conflict: false };
  };

    if (newStatus === "rejected") {
      ad.status = "rejected";
      ad.rejectionReason = rejectionReason || "Rejected by admin";
    } else if (newStatus === "approved") {
      // Mark as approved
      ad.status = "approved";
      ad.approvedBy = adminId;
      
      // Set payment deadline: 48 hours from approval
      const paymentDeadline = new Date();
      paymentDeadline.setHours(paymentDeadline.getHours() + 48);
      ad.paymentDeadline = paymentDeadline;
      
      // If payment is already paid or being set to paid, set start/end dates
      const finalPaymentStatus = paymentStatus || ad.paymentStatus;
      if (finalPaymentStatus === "paid") {
        const { start } = projectAdDates(startDate);
        const conflictCheck = await ensureNoActiveConflict(start);
        if (conflictCheck.conflict) {
          return res.status(status.BadRequest).json({
            status: jsonStatus.BadRequest,
            success: false,
            message: conflictCheck.message,
          });
        }
        setAdDates(startDate);
        // If payment is paid, automatically activate the ad
        ad.status = "active";
        // Clear payment deadline since payment is already done
        ad.paymentDeadline = undefined;
      } else {
        // Send notification to seller/retailer about approval with payment info
        try {
          const config = await getAdsConfig();
          const decryptedBank = {
            accountName: decryptValue(config.bankDetails?.accountName || ""),
            accountNumber: decryptValue(config.bankDetails?.accountNumber || ""),
            ifsc: decryptValue(config.bankDetails?.ifsc || ""),
            bankName: config.bankDetails?.bankName || "",
            branch: config.bankDetails?.branch || "",
            upiId: decryptValue(config.bankDetails?.upiId || ""),
            note: config.bankDetails?.note || "",
          };

          // Determine if seller or retailer
          const User = await import("../models/User.js");
          const user = await User.default.findById(ad.sellerId);
          const userRole = user?.role || "seller";

          await Notification.create({
            title: "Ad Approved - Payment Required",
            message: `Your ad '${ad.name}' has been approved. Please make payment of ₹${ad.amount || 0} within 48 hours. Click to view payment details.`,
            type: "info",
            targetRoles: [userRole],
            targetUserIds: [ad.sellerId],
            meta: {
              category: "ad",
              adId: ad._id.toString(),
              paymentAmount: ad.amount || 0,
              paymentDeadline: paymentDeadline.toISOString(),
            },
          });
        } catch (notifError) {
          console.error("Error sending approval notification:", notifError);
        }
      }
    } else if (newStatus === "active") {
      // Ad should start only after payment is marked paid
      const finalPaymentStatus = paymentStatus || ad.paymentStatus;
      if (finalPaymentStatus !== "paid") {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Payment must be marked as paid before activating the ad",
        });
      }
      const { start } = projectAdDates(startDate);
      const conflictCheck = await ensureNoActiveConflict(start);
      if (conflictCheck.conflict) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: conflictCheck.message,
        });
      }
      setAdDates(startDate);
      ad.status = "active";
      ad.approvedBy = ad.approvedBy || adminId;
    } else if (newStatus) {
      ad.status = newStatus;
    } else {
      // If no new status but payment status is being updated to "paid"
      // and ad is already approved, set dates and activate
      if (paymentStatus === "paid" && ad.status === "approved") {
        const { start } = projectAdDates(startDate);
        const conflictCheck = await ensureNoActiveConflict(start);
        if (conflictCheck.conflict) {
          return res.status(status.BadRequest).json({
            status: jsonStatus.BadRequest,
            success: false,
            message: conflictCheck.message,
          });
        }
        setAdDates(startDate);
        ad.status = "active";
        ad.approvedBy = ad.approvedBy || adminId;
      }
    }

    await ad.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Ad updated successfully",
      data: ad,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("adminUpdateAdStatus", error, req, res);
  }
};

// --------- Orsolum's own Ads (no seller) ----------

export const adminCreateOrsolumAd = async (req, res) => {
  try {
    const adminId = req.user._id;
    const {
      name,
      description,
      location,
      inquiry,
      videos,
      productId, // ✅ Product selection for admin ads
    } = req.body;

    const normalizedLocation = normalizeLocation(location);

    if (!name || !normalizedLocation) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please provide ad name and location",
      });
    }

    if (!AD_LOCATIONS.includes(normalizedLocation)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad location",
      });
    }

    // Validate productId if provided
    let finalProductId = null;
    if (productId) {
      if (!ObjectId.isValid(productId)) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Invalid product ID",
        });
      }

      // Check if product exists
      const product = await Product.findOne({
        _id: new ObjectId(productId),
        deleted: false,
      });
      if (!product) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Product not found",
        });
      }

      finalProductId = new ObjectId(productId);
    }

    // Handle uploaded images from multer + manual URLs
    let images = [];
    const { images: anyImages, videos: anyVideos } = groupAnyUploadedMedia(req.files);
    const uploadedImages = req.files?.images || anyImages || (Array.isArray(req.files) ? req.files : []);
    if (uploadedImages?.length) {
      images.push(...extractUploadedUrls(uploadedImages));
    }
    if (req.body.images) {
      if (typeof req.body.images === "string") {
        images.push(
          ...req.body.images
            .split(",")
            .map((img) => img.trim())
            .filter(Boolean)
        );
      } else if (Array.isArray(req.body.images)) {
        images.push(...req.body.images.filter(Boolean));
      }
    }
    images = [...new Set(images)];

    // Videos (uploaded files or URLs)
    let videoUrls = [];
    const uploadedVideos = req.files?.videos || anyVideos || [];
    if (uploadedVideos?.length) {
      videoUrls.push(...extractUploadedUrls(uploadedVideos));
    }
    if (videos) {
      if (typeof videos === "string") {
        videoUrls.push(
          ...videos
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        );
      } else if (Array.isArray(videos)) {
        videoUrls.push(...videos.filter(Boolean));
      }
    }
    videoUrls = [...new Set(videoUrls)];

    // ✅ Admin ads: No time limit. Use a long duration for endDate so conflict checks work.
    const now = new Date();
    const LONG_RUN_DAYS = 3650; // 10 years fallback
    const end = new Date(now);
    end.setDate(end.getDate() + LONG_RUN_DAYS);

    const ad = new Ad({
      name: name.trim(),
      description: description?.trim(),
      location,
      images,
      videos: videoUrls,
      productId: finalProductId, // ✅ Product selection
      totalRunDays: LONG_RUN_DAYS,
      inquiry: inquiry?.trim(),
      status: "active", // ✅ Active immediately
      amount: 0, // Admin ads don't require payment
      paymentStatus: "paid", // Auto-set as paid for admin ads
      startDate: now, // Start immediately
      endDate: end, // ✅ Long-running end date for overlap checks
      createdByAdmin: adminId,
      approvedBy: adminId,
    });

    await ad.save();

    return res.status(status.Create).json({
      status: jsonStatus.Create,
      success: true,
      message: "Orsolum ad created successfully. This ad will run when no seller/retailer ads are active for this location.",
      data: ad,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("adminCreateOrsolumAd", error, req, res);
  }
};

export const adminUpdateOrsolumAd = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      location,
      images,
      videos,
      totalRunDays,
      inquiry,
      status: newStatus,
      startDate,
    } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad id",
      });
    }

    const ad = await Ad.findById(id);
    if (!ad || ad.sellerId) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Orsolum ad not found",
      });
    }

    const { images: anyImages, videos: anyVideos } = groupAnyUploadedMedia(req.files);
    const uploadedImages = extractUploadedUrls(req.files?.images || anyImages);
    const uploadedVideos = extractUploadedUrls(req.files?.videos || anyVideos);

    if (name !== undefined) ad.name = name;
    if (description !== undefined) ad.description = description;
    if (location && AD_LOCATIONS.includes(location)) ad.location = location;
    
    let imagesToSet = null;
    if (Array.isArray(images)) {
      imagesToSet = images.filter(Boolean);
    }
    if (uploadedImages.length) {
      imagesToSet = [...(imagesToSet ?? ad.images ?? []), ...uploadedImages];
    }
    if (imagesToSet !== null) {
      ad.images = [...new Set(imagesToSet)];
    }

    let videosToSet = null;
    if (videos !== undefined) {
      if (typeof videos === "string") {
        videosToSet = videos
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
      } else if (Array.isArray(videos)) {
        videosToSet = videos.filter(Boolean);
      } else {
        videosToSet = [];
      }
    }
    if (uploadedVideos.length) {
      videosToSet = [...(videosToSet ?? ad.videos ?? []), ...uploadedVideos];
    }
    if (videosToSet !== null) {
      ad.videos = [...new Set(videosToSet)];
    }
    if (totalRunDays !== undefined) ad.totalRunDays = Number(totalRunDays) || ad.totalRunDays;
    if (inquiry !== undefined) ad.inquiry = inquiry;

    if (newStatus && ["active", "completed", "cancelled"].includes(newStatus)) {
      ad.status = newStatus;
    }

    if (startDate) {
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + (ad.totalRunDays || 1));
      ad.startDate = start;
      ad.endDate = end;
    }

    await ad.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Orsolum ad updated successfully",
      data: ad,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("adminUpdateOrsolumAd", error, req, res);
  }
};

export const adminDeleteOrsolumAd = async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad id",
      });
    }

    const ad = await Ad.findOne({
      _id: new ObjectId(id),
      sellerId: { $exists: false },
    });

    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Orsolum ad not found",
      });
    }

    // Soft delete
    ad.deleted = true;
    ad.deletedBy = "admin";
    ad.status = "cancelled";
    await ad.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Orsolum ad deleted successfully",
      data: ad,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("adminDeleteOrsolumAd", error, req, res);
  }
};

// Delete any ad (seller or Orsolum) - admin only (Soft Delete)
export const adminDeleteAd = async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad id",
      });
    }

    const ad = await Ad.findById(id);

    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ad not found",
      });
    }

    // Hard delete - remove from database
    await Ad.deleteOne({ _id: ad._id });

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Ad deleted successfully",
      data: { _id: ad._id },
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("adminDeleteAd", error, req, res);
  }
};

// ===================== CRON UTILS =====================

export const checkAdsExpiryAndNotify = async () => {
  try {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 0) Activate scheduled ads whose startDate has arrived
    const scheduledAds = await Ad.find({
      status: "approved",
      paymentStatus: "paid",
      scheduledStartDate: { $lte: now },
      deleted: { $ne: true },
    });

    if (scheduledAds.length > 0) {
      for (const ad of scheduledAds) {
        const end = new Date(ad.scheduledStartDate || ad.startDate || now);
        end.setDate(end.getDate() + (ad.totalRunDays || 1));
        
        ad.status = "active";
        ad.startDate = ad.scheduledStartDate || ad.startDate || now;
        ad.endDate = end;
        ad.expiryNotified = false;
        await ad.save();

        // Send notification to seller
        try {
          const Notification = (await import("../models/Notification.js")).default;
          const { ObjectId } = (await import("mongoose")).Types;
          await Notification.create({
            title: "Ad Activated",
            message: `Your scheduled ad '${ad.name}' has been activated and will run for ${ad.totalRunDays} days.`,
            type: "success",
            targetRoles: ["seller"],
            targetUserIds: [ad.sellerId],
            meta: {
              category: "ad",
              adId: ad._id.toString(),
            },
          });
        } catch (notifError) {
          console.error("Error sending scheduled ad activation notification:", notifError);
        }
      }
      console.log(`✅ Activated ${scheduledAds.length} scheduled ads`);
    }

    // 0.5) Delete ads that exceeded 48-hour payment deadline
    const expiredPaymentAds = await Ad.find({
      status: "approved",
      paymentStatus: "pending",
      paymentDeadline: { $lte: now },
      isDead: { $ne: true },
      deleted: { $ne: true },
    });

    if (expiredPaymentAds.length > 0) {
      for (const ad of expiredPaymentAds) {
        // Mark as dead and deleted
        ad.isDead = true;
        ad.deleted = true;
        ad.deletedBy = "admin"; // System deletion
        ad.status = "cancelled"; // Mark as cancelled
        await ad.save();

        // Send notification to seller/retailer
        try {
          const User = await import("../models/User.js");
          const user = await User.default.findById(ad.sellerId);
          const userRole = user?.role || "seller";

          await Notification.create({
            title: "Ad Deleted - Payment Deadline Expired",
            message: `Your ad '${ad.name}' has been deleted because payment was not completed within 48 hours of approval.`,
            type: "alert",
            targetRoles: [userRole],
            targetUserIds: [ad.sellerId],
            meta: {
              category: "ad",
              adId: ad._id.toString(),
              reason: "payment_deadline_expired",
            },
          });
        } catch (notifError) {
          console.error("Error sending payment deadline expiration notification:", notifError);
        }
      }
      console.log(`✅ Deleted ${expiredPaymentAds.length} ads due to payment deadline expiration`);
    }

    // 1) Mark completed ads (excluding deleted ones and admin ads without endDate)
    const completedResult = await Ad.updateMany(
      {
        status: "active",
        endDate: { $exists: true, $ne: null, $lte: now },
        deleted: { $ne: true },
      },
      { $set: { status: "completed" } }
    );

    if (completedResult.modifiedCount) {
      console.log(`✅ Marked ${completedResult.modifiedCount} ads as completed`);
    }

    // 2) Notify about ads expiring in next 24 hours (only once, excluding deleted)
    const expiringAds = await Ad.find({
      status: "active",
      endDate: { $gt: now, $lte: next24Hours },
      expiryNotified: { $ne: true },
      sellerId: { $ne: null },
      deleted: { $ne: true },
    })
      .select("_id name sellerId endDate")
      .lean();

    if (!expiringAds.length) return;

    const notifications = [];
    for (const ad of expiringAds) {
      const endTime = new Date(ad.endDate).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      });

      // Notification for seller
      notifications.push(
        new Notification({
          title: "Ad Expiring Soon",
          message: `Your ad '${ad.name}' will expire within 24 hours (by ${endTime}). You can submit a renewal request if needed.`,
          type: "alert",
          targetRoles: ["seller"],
          targetUserIds: [new ObjectId(ad.sellerId)],
          meta: {
            category: "ad",
            adId: ad._id.toString(),
            expiresAt: ad.endDate,
          },
        })
      );

      // Notification for admin (generic)
      notifications.push(
        new Notification({
          title: "Seller Ad Expiring Soon",
          message: `Seller ad '${ad.name}' is going to expire within 24 hours.`,
          type: "info",
          targetRoles: ["admin"],
          targetUserIds: [],
          meta: {
            category: "ad",
            adId: ad._id.toString(),
            expiresAt: ad.endDate,
          },
        })
      );
    }

    if (notifications.length) {
      await Notification.insertMany(notifications);
      await Ad.updateMany(
        { _id: { $in: expiringAds.map((a) => a._id) } },
        { $set: { expiryNotified: true } }
      );
      console.log(`✅ Sent expiry notifications for ${expiringAds.length} ads`);
    }
  } catch (error) {
    console.error("Error in checkAdsExpiryAndNotify:", error);
  }
};

// ===================== CONFIG APIs =====================

export const adminGetAdsConfig = async (req, res) => {
  try {
    const config = await getAdsConfig();
    // Decrypt bank details for admin view
    const decryptedBank = {
      ...config.bankDetails,
      accountNumber: decryptValue(config.bankDetails?.accountNumber || ""),
      ifsc: decryptValue(config.bankDetails?.ifsc || ""),
      upiId: decryptValue(config.bankDetails?.upiId || ""),
    };
    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: { ...config, bankDetails: decryptedBank },
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("adminGetAdsConfig", error, req, res);
  }
};

export const adminUpdateAdsConfig = async (req, res) => {
  try {
    const existing = await AdConfig.getSingleton();
    const update = {};

    if (req.body.locationRates) {
      update.locationRates = {
        banner:
          typeof req.body.locationRates.banner === "number"
            ? req.body.locationRates.banner
            : existing.locationRates.banner,
        popup:
          typeof req.body.locationRates.popup === "number"
            ? req.body.locationRates.popup
            : existing.locationRates.popup,
        offer_bar:
          typeof req.body.locationRates.offer_bar === "number"
            ? req.body.locationRates.offer_bar
            : existing.locationRates.offer_bar,
        crazy_deals:
          typeof req.body.locationRates.crazy_deals === "number"
            ? req.body.locationRates.crazy_deals
            : existing.locationRates.crazy_deals || 0,
        trending_items:
          typeof req.body.locationRates.trending_items === "number"
            ? req.body.locationRates.trending_items
            : existing.locationRates.trending_items || 0,
        popular_categories:
          typeof req.body.locationRates.popular_categories === "number"
            ? req.body.locationRates.popular_categories
            : existing.locationRates.popular_categories || 0,
        stores_near_me:
          typeof req.body.locationRates.stores_near_me === "number"
            ? req.body.locationRates.stores_near_me
            : existing.locationRates.stores_near_me || 0,
        promotional_banner:
          typeof req.body.locationRates.promotional_banner === "number"
            ? req.body.locationRates.promotional_banner
            : existing.locationRates.promotional_banner || 0,
      };
    }

    if (req.body.bankDetails) {
      // Encrypt sensitive fields
      const incoming = req.body.bankDetails;
      update.bankDetails = {
        ...existing.bankDetails,
        ...incoming,
        accountNumber: incoming.accountNumber ? encryptValue(incoming.accountNumber) : existing.bankDetails.accountNumber,
        ifsc: incoming.ifsc ? encryptValue(incoming.ifsc) : existing.bankDetails.ifsc,
        upiId: incoming.upiId ? encryptValue(incoming.upiId) : existing.bankDetails.upiId,
      };
    }

    const updated = await AdConfig.findByIdAndUpdate(existing._id, update, {
      new: true,
      runValidators: true,
    }).lean();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: updated,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("adminUpdateAdsConfig", error, req, res);
  }
};

export const getSellerAdsConfig = async (req, res) => {
  try {
    const config = await getAdsConfig();
    const decryptedBank = {
      ...config.bankDetails,
      accountNumber: decryptValue(config.bankDetails?.accountNumber || ""),
      ifsc: decryptValue(config.bankDetails?.ifsc || ""),
      upiId: decryptValue(config.bankDetails?.upiId || ""),
    };
    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: {
        locationRates: config.locationRates,
        bankDetails: decryptedBank,
      },
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("getSellerAdsConfig", error, req, res);
  }
};

// ===================== PUBLIC APIs (For User App) =====================

/**
 * Get active ads for display on user app (ONLINE STORE)
 * This API is public and returns only active ads from SELLER stores
 * ✅ Seller ads → Online store me show hongi
 */
export const getActiveAds = async (req, res) => {
  try {
    const { location } = req.query;
    const normalizedLocation = location ? normalizeLocation(location) : null;
    const now = new Date();

    const filter = {
      status: "active",
      startDate: { $lte: now },
      endDate: { $gte: now },
      deleted: { $ne: true },
      sellerId: { $exists: true }, // ✅ Only ads with sellerId (seller ads)
    };

    if (normalizedLocation && AD_LOCATIONS.includes(normalizedLocation)) {
      filter.location = normalizedLocation;
    }

    // ✅ seller ids
    const sellerUsers = await User.find({ role: "seller" }).select("_id").lean();
    const sellerIds = sellerUsers.map((u) => u._id);
    filter.sellerId = { $in: sellerIds };

    const sellerAds = await Ad.find(filter)
      .populate("sellerId", "name phone role")
      .populate("storeId", "name phone images")
      .populate("productId", "productName primaryImage productImages sellingPrice mrp")
      .sort({ startDate: 1 })
      .lean();

    // Admin fallback ads - ✅ No endDate limit (runs indefinitely)
    const fallbackFilter = {
      status: "active",
      startDate: { $lte: now },
      // ✅ Admin ads can have no endDate (null) or very high endDate (999999 days)
      $or: [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gte: now } },
      ],
      deleted: { $ne: true },
      sellerId: { $exists: false }, // Admin ads don't have sellerId
      createdByAdmin: { $exists: true }, // Only admin-created ads
    };
    if (normalizedLocation && AD_LOCATIONS.includes(normalizedLocation)) {
      fallbackFilter.location = normalizedLocation;
    }
    const adminAds = await Ad.find(fallbackFilter).sort({ startDate: 1 }).lean();

    // helper to build ad payload with image fallbacks
    const buildAdPayload = (ad) => {
      let productImagesArray = [];
      if (ad.productId) {
        if (ad.productId.primaryImage) productImagesArray.push(ad.productId.primaryImage);
        if (Array.isArray(ad.productId.productImages)) {
          ad.productId.productImages.forEach((img) => {
            if (img && !productImagesArray.includes(img)) productImagesArray.push(img);
          });
        }
      }
      const storeImagesArray = normalizeMediaArray(ad.storeId?.images || []);
      const { formattedImages, formattedVideos, primaryImage, primaryVideo, mediaAssets } = buildMediaPayload(
        ad.images,
        ad.videos
      );
      const formattedProductImages = productImagesArray.map((img) => ensureAbsoluteMediaUrl(img));
      const resolvedPrimaryImage =
        primaryImage ||
        formattedProductImages[0] ||
        storeImagesArray[0] ||
        null;
      const resolvedImages = formattedImages.length
        ? formattedImages
        : resolvedPrimaryImage
        ? [resolvedPrimaryImage]
        : [];
      return {
        _id: ad._id,
        name: ad.name,
        description: ad.description,
        images: resolvedImages,
        videos: formattedVideos,
        primaryImage: resolvedPrimaryImage,
        primaryVideo,
        mediaAssets,
        location: ad.location,
        storeId: ad.storeId
          ? {
              _id: ad.storeId._id,
              name: ad.storeId.name,
            images: storeImagesArray,
            }
          : null,
        productId: ad.productId
          ? {
              _id: ad.productId._id,
              name: ad.productId.productName || ad.productId.name || null,
            images: formattedProductImages,
              price: ad.productId.sellingPrice ?? ad.productId.price ?? null,
              mrp: ad.productId.mrp || null,
            }
          : null,
        startDate: ad.startDate,
        endDate: ad.endDate,
      };
    };

    // If requesting stores_near_me → return up to 5 ads (seller first, then admin)
    if (normalizedLocation === "stores_near_me") {
      const combined = [...sellerAds, ...adminAds].slice(0, 5).map(buildAdPayload);
      return res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        data: { ads: combined, adsByLocation: null },
      });
    }

    // Group one per location (seller priority then admin)
    const adsByLocation = {};
    sellerAds.forEach((ad) => {
      if (!ad.sellerId || ad.sellerId.role !== "seller") return;
      if (adsByLocation[ad.location]) return;
      adsByLocation[ad.location] = buildAdPayload(ad);
    });
    adminAds.forEach((ad) => {
      if (adsByLocation[ad.location]) return;
      adsByLocation[ad.location] = buildAdPayload(ad);
    });

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Active ads for online store",
      data: {
        ads: Object.values(adsByLocation),
        adsByLocation: adsByLocation,
      },
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("getActiveAds", error, req, res);
  }
};

/**
 * Get active ads for retailer's local store display (LOCAL STORE)
 * This API returns active ads from RETAILER stores only
 * ✅ Retailer ads → Local store me show hongi
 */
export const getRetailerLocalStoreAds = async (req, res) => {
  try {
    const { location } = req.query;
    const now = new Date();

    const filter = {
      status: "active",
      startDate: { $lte: now },
      endDate: { $gte: now },
      deleted: { $ne: true },
      sellerId: { $exists: true }, // ✅ Only ads with sellerId (retailer ads use sellerId field)
    };

    // Filter by location if provided
    if (location && AD_LOCATIONS.includes(location)) {
      filter.location = location;
    }

    // ✅ Use aggregation to filter by retailer role
    // First, get all retailer user IDs
    const retailerUsers = await User.find({ role: "retailer" }).select("_id").lean();
    const retailerIds = retailerUsers.map(u => u._id);

    // Filter ads by retailerIds
    filter.sellerId = { $in: retailerIds };

    const ads = await Ad.find(filter)
      .populate("sellerId", "name phone role")
      .populate("storeId", "name phone images")
      .populate("productId", "productName primaryImage productImages sellingPrice mrp price name")
      .sort({ startDate: 1 })
      .lean();

    // Group ads by location, keeping only one ad per location (first from sorted list)
    const adsByLocation = {};
    ads.forEach((ad) => {
      // Double check - ensure sellerId exists and role is retailer
      if (!ad.sellerId || ad.sellerId.role !== "retailer") return;
      if (adsByLocation[ad.location]) return;
      
      // Prepare product images - combine primaryImage and productImages
      let productImagesArray = [];
      if (ad.productId) {
        if (ad.productId.primaryImage) {
          productImagesArray.push(ad.productId.primaryImage);
        }
        if (Array.isArray(ad.productId.productImages) && ad.productId.productImages.length > 0) {
          ad.productId.productImages.forEach((img) => {
            if (img && !productImagesArray.includes(img)) {
              productImagesArray.push(img);
            }
          });
        }
      }
      
      const storeImagesArray = normalizeMediaArray(ad.storeId?.images || []);
      const {
        formattedImages: adImagesArray,
        formattedVideos: adVideosArray,
        primaryImage,
        primaryVideo,
        mediaAssets,
      } = buildMediaPayload(ad.images, ad.videos);
      const resolvedPrimaryImage =
        primaryImage ||
        (productImagesArray[0] ? ensureAbsoluteMediaUrl(productImagesArray[0]) : null) ||
        storeImagesArray[0] ||
        null;
      const resolvedImages = adImagesArray.length
        ? adImagesArray
        : resolvedPrimaryImage
        ? [resolvedPrimaryImage]
        : [];
      
      // Format product images with full URL
      const formattedProductImages = productImagesArray.map((img) => {
        if (img.startsWith('http://') || img.startsWith('https://')) {
          return img;
        }
        return `https://orsolum.s3.ap-south-1.amazonaws.com/${img}`;
      });
      
      adsByLocation[ad.location] = {
        _id: ad._id,
        name: ad.name,
        description: ad.description,
        images: resolvedImages,
        videos: adVideosArray,
        primaryImage: resolvedPrimaryImage,
        primaryVideo,
        mediaAssets,
        location: ad.location,
        storeId: ad.storeId
          ? {
              _id: ad.storeId._id,
              name: ad.storeId.name,
              images: storeImagesArray,
            }
          : null,
        productId: ad.productId
          ? {
              _id: ad.productId._id,
              name: ad.productId.productName || ad.productId.name || null,
              images: formattedProductImages,
              price: ad.productId.sellingPrice ?? ad.productId.price ?? null,
              mrp: ad.productId.mrp || null,
            }
          : null,
        startDate: ad.startDate,
        endDate: ad.endDate,
      };
    });

  // Fill missing slots per location with admin ads (Orsolum) while keeping retailer priority
  const nowFallback = new Date();
  const fallbackFilter = {
    status: "active",
    startDate: { $lte: nowFallback },
    endDate: { $gte: nowFallback },
    deleted: { $ne: true },
    sellerId: { $exists: false }, // Admin (Orsolum) ads
  };
  if (location && AD_LOCATIONS.includes(location)) {
    fallbackFilter.location = location;
  }

  const fallbackAds = await Ad.find(fallbackFilter)
    .sort({ startDate: 1 })
    .lean();

  fallbackAds.forEach((ad) => {
    if (adsByLocation[ad.location]) return; // retailer ad already occupies slot

    const {
      formattedImages: adImagesArray,
      formattedVideos: adVideosArray,
      primaryImage,
      primaryVideo,
      mediaAssets,
    } = buildMediaPayload(ad.images, ad.videos);

    const storeImagesArray = normalizeMediaArray(ad.storeId?.images || []);
    const resolvedPrimaryImage =
      primaryImage ||
      storeImagesArray[0] ||
      null;
    const resolvedImages = adImagesArray.length
      ? adImagesArray
      : resolvedPrimaryImage
      ? [resolvedPrimaryImage]
      : [];

    adsByLocation[ad.location] = {
      _id: ad._id,
      name: ad.name,
      description: ad.description,
      images: resolvedImages,
      videos: adVideosArray,
      primaryImage: resolvedPrimaryImage,
      primaryVideo,
      mediaAssets,
      location: ad.location,
      storeId: ad.storeId
        ? {
            _id: ad.storeId._id,
            name: ad.storeId.name,
            images: storeImagesArray,
          }
        : null,
      productId: null,
      startDate: ad.startDate,
      endDate: ad.endDate,
    };
  });

  const formattedAds = Object.values(adsByLocation);

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Active ads for local store (retailer ads only)",
      data: {
        ads: formattedAds,
        adsByLocation: adsByLocation,
      },
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("getRetailerLocalStoreAds", error, req, res);
  }
};

/**
 * Create payment session for retailer ad payment
 * This API creates a Cashfree payment session for retailer to pay for approved ad
 */
export const createRetailerAdPaymentSession = async (req, res) => {
  try {
    const retailerId = req.user._id;
    const { adId, scheduledStartDate } = req.body;

    if (!adId) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Ad ID is required",
      });
    }

    if (!ObjectId.isValid(adId)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad ID",
      });
    }

    const ad = await Ad.findOne({
      _id: new ObjectId(adId),
      sellerId: new ObjectId(retailerId), // Retailer ads use sellerId field
    });

    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ad not found",
      });
    }

    // Check if ad is dead (payment deadline expired)
    if (ad.isDead || ad.deleted) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "This ad has been deleted due to payment deadline expiration. Payment is no longer available.",
      });
    }

    if (ad.status !== "approved") {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Ad must be approved before payment",
      });
    }

    if (ad.paymentStatus === "paid") {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Ad payment already completed",
      });
    }

    if (!ad.amount || ad.amount <= 0) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad amount",
      });
    }

    // Create Cashfree payment session
    const orderTags = {
      forPayment: "Ad",
      adId: adId,
      retailerId: retailerId.toString(),
      location: ad.location,
      totalRunDays: ad.totalRunDays.toString(),
    };
    
    // Add scheduledStartDate if provided
    if (scheduledStartDate) {
      const scheduledDate = new Date(scheduledStartDate);
      if (scheduledDate > new Date()) {
        orderTags.scheduledStartDate = scheduledDate.toISOString();
      }
    }
    
    const paymentData = {
      order_currency: "INR",
      order_amount: ad.amount,
      order_tags: orderTags,
      customer_details: {
        customer_id: retailerId.toString(),
        customer_phone: req.user.phone?.replace("+91", "") || "9999999999",
        customer_name: req.user.name || "Retailer",
        customer_email: req.user.email || `${req.user.phone}@orsolum.com`,
      },
    };

    const headers = {
      "x-api-version": process.env.CF_API_VERSION || "2022-09-01",
      "x-client-id": process.env.CF_CLIENT_ID,
      "x-client-secret": process.env.CF_CLIENT_SECRET,
      "Content-Type": "application/json",
    };

    let cashFreeSession;
    try {
      console.log("Creating Cashfree payment session for retailer:", {
        url: process.env.CF_CREATE_PRODUCT_URL,
        amount: ad.amount,
        adId: ad._id,
        retailerId: retailerId,
      });
      
      cashFreeSession = await axios.post(
        process.env.CF_CREATE_PRODUCT_URL,
        paymentData,
        { headers }
      );
      
      console.log("Cashfree API Response:", {
        status: cashFreeSession.status,
        hasOrderId: !!cashFreeSession.data?.order_id,
        hasPaymentSessionId: !!cashFreeSession.data?.payment_session_id,
      });
    } catch (error) {
      console.error("Cashfree API Error Details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error?.message
        || error.response?.data?.error
        || error.message 
        || "Failed to create payment session. Please check your Cashfree credentials and try again.";
      
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? {
          details: error.response?.data,
          status: error.response?.status,
        } : undefined,
      });
    }

    // Validate response
    if (!cashFreeSession?.data?.payment_session_id) {
      console.error("Invalid Cashfree response:", {
        status: cashFreeSession?.status,
        data: cashFreeSession?.data,
      });
      return res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: cashFreeSession?.data?.message || "Invalid response from payment gateway. Please try again.",
      });
    }
    
    console.log("Payment session created successfully for retailer:", {
      orderId: cashFreeSession.data.order_id,
      paymentSessionId: cashFreeSession.data.payment_session_id,
      adId: ad._id
    });

    // Update ad with payment reference
    ad.paymentReference = cashFreeSession.data.order_id;
    await ad.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Payment session created successfully",
      data: {
        paymentSessionId: cashFreeSession.data.payment_session_id,
        cf_order_id: cashFreeSession.data.order_id,
        adId: ad._id,
        amount: ad.amount,
      },
    });
  } catch (error) {
    console.error("createRetailerAdPaymentSession error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to create payment session",
    });
    return catchError("createRetailerAdPaymentSession", error, req, res);
  }
};

/**
 * Create payment session for ad payment
 * This API creates a Cashfree payment session for seller to pay for approved ad
 */
export const createAdPaymentSession = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { adId, scheduledStartDate } = req.body;

    if (!adId) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Ad ID is required",
      });
    }

    if (!ObjectId.isValid(adId)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad ID",
      });
    }

    const ad = await Ad.findOne({
      _id: new ObjectId(adId),
      sellerId: new ObjectId(sellerId),
    });

    if (!ad) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ad not found",
      });
    }

    // Check if ad is dead (payment deadline expired)
    if (ad.isDead || ad.deleted) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "This ad has been deleted due to payment deadline expiration. Payment is no longer available.",
      });
    }

    if (ad.status !== "approved") {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Ad must be approved before payment",
      });
    }

    if (ad.paymentStatus === "paid") {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Ad payment already completed",
      });
    }

    if (!ad.amount || ad.amount <= 0) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad amount",
      });
    }

    // Create Cashfree payment session
    const orderTags = {
      forPayment: "Ad",
      adId: adId,
      sellerId: sellerId.toString(),
      location: ad.location,
      totalRunDays: ad.totalRunDays.toString(),
    };
    
    // Add scheduledStartDate if provided
    if (scheduledStartDate) {
      const scheduledDate = new Date(scheduledStartDate);
      if (scheduledDate > new Date()) {
        orderTags.scheduledStartDate = scheduledDate.toISOString();
      }
    }
    
    const paymentData = {
      order_currency: "INR",
      order_amount: ad.amount,
      order_tags: orderTags,
      customer_details: {
        customer_id: sellerId.toString(),
        customer_phone: req.user.phone?.replace("+91", "") || "9999999999",
        customer_name: req.user.name || "Seller",
        customer_email: req.user.email || `${req.user.phone}@orsolum.com`,
      },
    };

    const headers = {
      "x-api-version": process.env.CF_API_VERSION || "2022-09-01",
      "x-client-id": process.env.CF_CLIENT_ID,
      "x-client-secret": process.env.CF_CLIENT_SECRET,
      "Content-Type": "application/json",
    };

    let cashFreeSession;
    try {
      console.log("Creating Cashfree payment session:", {
        url: process.env.CF_CREATE_PRODUCT_URL,
        amount: ad.amount,
        adId: ad._id,
        hasClientId: !!process.env.CF_CLIENT_ID,
        hasClientSecret: !!process.env.CF_CLIENT_SECRET,
        apiVersion: process.env.CF_API_VERSION || "2022-09-01",
      });
      
      cashFreeSession = await axios.post(
        process.env.CF_CREATE_PRODUCT_URL,
        paymentData,
        { headers }
      );
      
      console.log("Cashfree API Response:", {
        status: cashFreeSession.status,
        hasOrderId: !!cashFreeSession.data?.order_id,
        hasPaymentSessionId: !!cashFreeSession.data?.payment_session_id,
      });
    } catch (error) {
      console.error("Cashfree API Error Details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        config: {
          url: error.config?.url,
          method: error.config?.method,
        }
      });
      
      // More detailed error message
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error?.message
        || error.response?.data?.error
        || error.message 
        || "Failed to create payment session. Please check your Cashfree credentials and try again.";
      
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? {
          details: error.response?.data,
          status: error.response?.status,
        } : undefined,
      });
    }

    // Validate response
    if (!cashFreeSession?.data?.payment_session_id) {
      console.error("Invalid Cashfree response:", {
        status: cashFreeSession?.status,
        data: cashFreeSession?.data,
        error: cashFreeSession?.data?.message || "Unknown error"
      });
      return res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: cashFreeSession?.data?.message || "Invalid response from payment gateway. Please try again.",
      });
    }
    
    console.log("Payment session created successfully:", {
      orderId: cashFreeSession.data.order_id,
      paymentSessionId: cashFreeSession.data.payment_session_id,
      adId: ad._id
    });

    // Update ad with payment reference
    ad.paymentReference = cashFreeSession.data.order_id;
    await ad.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Payment session created successfully",
      data: {
        paymentSessionId: cashFreeSession.data.payment_session_id,
        cf_order_id: cashFreeSession.data.order_id,
        adId: ad._id,
        amount: ad.amount,
      },
    });
  } catch (error) {
    console.error("createAdPaymentSession error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to create payment session",
    });
    return catchError("createAdPaymentSession", error, req, res);
  }
};



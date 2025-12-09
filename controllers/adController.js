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

const { ObjectId } = mongoose.Types;

const AD_LOCATIONS = ["banner", "popup", "offer_bar", "crazy_deals", "trending_items", "popular_categories", "stores_near_me", "promotional_banner"];
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
    endDate: { $gte: projectedStart },
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
    } = req.body;

    if (!name || !location || !totalRunDays) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please provide ad name, location and total run days",
      });
    }

    if (!AD_LOCATIONS.includes(location)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad location",
      });
    }

    // Handle uploaded images from multer
    let images = [];
    if (req.files && req.files.length > 0) {
      // Images uploaded via multer - get S3 URLs
      images = req.files.map((file) => file.location || file.key);
    } else if (req.body.images) {
      // Fallback: comma-separated image URLs from body
      if (typeof req.body.images === "string") {
        images = req.body.images
          .split(",")
          .map((img) => img.trim())
          .filter(Boolean);
      } else if (Array.isArray(req.body.images)) {
        images = req.body.images;
      }
    }

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
      // Verify product belongs to seller
      const product = await Product.findOne({
        _id: new ObjectId(productId),
        createdBy: sellerId,
        deleted: false,
      });
      if (!product) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Product not found or does not belong to you",
        });
      }
      finalProductId = new ObjectId(productId);
    }

    // Calculate amount based on config (per-day rate * days)
    const config = await getAdsConfig();
    const perDayRate = config?.locationRates?.[location] || 0;
    const totalAmount = perDayRate * Number(totalRunDays || 0);

    const ad = new Ad({
      sellerId,
      storeId: finalStoreId,
      productId: finalProductId,
      name: name.trim(),
      description: description?.trim(),
      location,
      images,
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
      deleted: { $ne: true } // Don't show deleted ads to seller
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
      totalRunDays,
      inquiry,
      startDate,
      scheduledStartDate,
    } = req.body;

    if (!name || !location || !totalRunDays) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please provide ad name, location and total run days",
      });
    }

    if (!AD_LOCATIONS.includes(location)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid ad location",
      });
    }

    // Handle uploaded images from multer
    let images = [];
    if (req.files && req.files.length > 0) {
      // Images uploaded via multer - get S3 URLs
      images = req.files.map((file) => file.location || file.key);
    } else if (req.body.images) {
      // Fallback: comma-separated image URLs from body
      if (typeof req.body.images === "string") {
        images = req.body.images
          .split(",")
          .map((img) => img.trim())
          .filter(Boolean);
      } else if (Array.isArray(req.body.images)) {
        images = req.body.images;
      }
    }

    // Handle scheduled date if provided
    let start, end, adStatus;
    if (scheduledStartDate) {
      const scheduledDate = new Date(scheduledStartDate);
      if (scheduledDate > new Date()) {
        // Scheduled for future - set status as approved, will activate on scheduled date
        start = scheduledDate;
        end = new Date(scheduledDate);
        end.setDate(end.getDate() + Number(totalRunDays || 1));
        adStatus = "approved"; // Will be activated by cron job
      } else {
        // Scheduled date is in past, activate immediately
        start = scheduledDate;
        end = new Date(scheduledDate);
        end.setDate(end.getDate() + Number(totalRunDays || 1));
        adStatus = "active";
      }
    } else if (startDate) {
      // Use provided startDate
      start = new Date(startDate);
      end = new Date(start);
      end.setDate(end.getDate() + Number(totalRunDays || 1));
      adStatus = "active";
    } else {
      // No scheduled date, activate immediately
      start = new Date();
      end = new Date(start);
      end.setDate(end.getDate() + Number(totalRunDays || 1));
      adStatus = "active";
    }

    const ad = new Ad({
      name: name.trim(),
      description: description?.trim(),
      location,
      images,
      totalRunDays: Number(totalRunDays),
      inquiry: inquiry?.trim(),
      status: adStatus,
      amount: 0, // Admin ads don't require payment
      paymentStatus: "paid", // Auto-set as paid for admin ads
      startDate: start,
      endDate: end,
      scheduledStartDate: scheduledStartDate ? new Date(scheduledStartDate) : undefined,
      createdByAdmin: adminId,
      approvedBy: adminId,
    });

    await ad.save();

    return res.status(status.Create).json({
      status: jsonStatus.Create,
      success: true,
      message: "Orsolum ad created successfully",
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

    if (name !== undefined) ad.name = name;
    if (description !== undefined) ad.description = description;
    if (location && AD_LOCATIONS.includes(location)) ad.location = location;
    if (Array.isArray(images)) ad.images = images;
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

    // Soft delete - mark as deleted and cancelled, but don't remove from database
    ad.deleted = true;
    ad.deletedBy = "admin";
    ad.status = "cancelled";
    await ad.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Ad deleted successfully",
      data: ad,
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

    // 1) Mark completed ads (excluding deleted ones)
    const completedResult = await Ad.updateMany(
      {
        status: "active",
        endDate: { $lte: now },
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
    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: config,
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
      update.bankDetails = {
        ...existing.bankDetails,
        ...req.body.bankDetails,
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
    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: {
        locationRates: config.locationRates,
        bankDetails: config.bankDetails,
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
    const now = new Date();

    const filter = {
      status: "active",
      startDate: { $lte: now },
      endDate: { $gte: now },
      deleted: { $ne: true },
      sellerId: { $exists: true }, // ✅ Only ads with sellerId (seller ads)
    };

    // Filter by location if provided
    if (location && AD_LOCATIONS.includes(location)) {
      filter.location = location;
    }

  // ✅ Use aggregation to filter by seller role
  // First, get all seller user IDs
  const sellerUsers = await User.find({ role: "seller" }).select("_id").lean();
  const sellerIds = sellerUsers.map(u => u._id);

  // Filter ads by sellerIds
  filter.sellerId = { $in: sellerIds };

  const ads = await Ad.find(filter)
    .populate("sellerId", "name phone role")
    .populate("storeId", "name phone images")
    .populate("productId", "productName primaryImage productImages sellingPrice mrp")
    .sort({ startDate: 1 })
    .lean();

  // Group ads by location, keeping only one ad per location (first from sorted list)
  const adsByLocation = {};
  ads.forEach((ad) => {
    // Double check - ensure sellerId exists and role is seller
    if (!ad.sellerId || ad.sellerId.role !== "seller") return;
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
      if (productImagesArray.length === 0) {
        productImagesArray = [];
      }
    }
    
    adsByLocation[ad.location] = {
      _id: ad._id,
      name: ad.name,
      description: ad.description,
      images: ad.images || [],
      location: ad.location,
      storeId: ad.storeId
        ? {
            _id: ad.storeId._id,
            name: ad.storeId.name,
            images: ad.storeId.images || [],
          }
        : null,
      productId: ad.productId
        ? {
            _id: ad.productId._id,
            name: ad.productId.productName || ad.productId.name || null,
            images: productImagesArray,
            price: ad.productId.sellingPrice ?? ad.productId.price ?? null,
            mrp: ad.productId.mrp || null,
          }
        : null,
      startDate: ad.startDate,
      endDate: ad.endDate,
    };
  });

  // Flatten for compatibility
  const formattedAds = Object.values(adsByLocation);

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Active ads for online store (seller ads only)",
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
      
      // Format store images with full URL
      const storeImagesArray = (ad.storeId?.images || []).map((img) => {
        if (img.startsWith('http://') || img.startsWith('https://')) {
          return img;
        }
        return `https://orsolum.s3.ap-south-1.amazonaws.com/${img}`;
      });
      
      // Format ad images with full URL
      const adImagesArray = (ad.images || []).map((img) => {
        if (img.startsWith('http://') || img.startsWith('https://')) {
          return img;
        }
        return `https://orsolum.s3.ap-south-1.amazonaws.com/${img}`;
      });
      
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
        images: adImagesArray,
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

    // Flatten for compatibility
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



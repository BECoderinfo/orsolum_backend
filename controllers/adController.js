import Ad from '../models/Ad.js';
import Notification from '../models/Notification.js';
import mongoose from 'mongoose';
import { uploadAdMediaAny } from '../helper/uploadImage.js';

const { ObjectId } = mongoose;


// Function to check ad expiry and send notifications
export const checkAdsExpiryAndNotify = async () => {
  try {
    console.log("Starting ads expiry check...");
    
    const now = new Date();
    
    // Find ads that are active and have end date in the past
    const expiredAds = await Ad.find({
      status: 'active',
      endDate: { $lt: now },
      isDead: { $ne: true },
      deleted: { $ne: true }
    });

    if (expiredAds.length > 0) {
      console.log(`Found ${expiredAds.length} expired ads`);
      
      for (const ad of expiredAds) {
        // Update ad status to completed
        ad.status = 'completed';
        await ad.save();
        
        console.log(`Ad ${ad._id} marked as completed`);
        
        // Send notification to ad owner
        try {
          await Notification.create({
            title: "Ad Expired",
            message: `Your ad "${ad.name}" has expired and is no longer active.`,
            type: "info",
            targetRoles: [ad.adOwnerType],
            targetUserIds: [ad.adOwnerId],
            meta: {
              category: "ad",
              adId: ad._id.toString(),
              status: "expired"
            },
          });
        } catch (notifError) {
          console.error("Error sending ad expiry notification:", notifError);
        }
      }
    }

    // Find ads with upcoming expiry (within 24 hours) that haven't been notified yet
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const upcomingExpiryAds = await Ad.find({
      status: 'active',
      endDate: { $gte: now, $lt: tomorrow },
      expiryNotified: { $ne: true },
      isDead: { $ne: true },
      deleted: { $ne: true }
    });

    if (upcomingExpiryAds.length > 0) {
      console.log(`Found ${upcomingExpiryAds.length} ads with upcoming expiry`);
      
      for (const ad of upcomingExpiryAds) {
        // Mark as notified
        ad.expiryNotified = true;
        await ad.save();
        
        // Send notification to ad owner
        try {
          await Notification.create({
            title: "Ad Expiring Soon",
            message: `Your ad "${ad.name}" will expire on ${ad.endDate.toLocaleDateString('en-IN')} at ${ad.endDate.toLocaleTimeString('en-IN')}.`,
            type: "warning",
            targetRoles: [ad.adOwnerType],
            targetUserIds: [ad.adOwnerId],
            meta: {
              category: "ad",
              adId: ad._id.toString(),
              status: "expiring_soon"
            },
          });
        } catch (notifError) {
          console.error("Error sending upcoming expiry notification:", notifError);
        }
      }
    }

    // Find ads with expired payment deadline
    const expiredPaymentAds = await Ad.find({
      status: "approved",
      paymentStatus: "pending",
      paymentDeadline: { $lte: now },
      isDead: { $ne: true },
      deleted: { $ne: true },
    });

    if (expiredPaymentAds.length > 0) {
      console.log(`Found ${expiredPaymentAds.length} ads with expired payment deadline`);
      
      for (const ad of expiredPaymentAds) {
        // Mark as dead and cancel
        ad.isDead = true;
        ad.deleted = true;
        ad.status = "cancelled";
        await ad.save();
        
        console.log(`Ad ${ad._id} marked as dead due to expired payment deadline`);
        
        // Send notification to ad owner
        try {
          await Notification.create({
            title: "Ad Payment Deadline Expired",
            message: `Your ad "${ad.name}" payment deadline has expired. The ad has been cancelled.`,
            type: "error",
            targetRoles: [ad.adOwnerType],
            targetUserIds: [ad.adOwnerId],
            meta: {
              category: "ad",
              adId: ad._id.toString(),
              status: "payment_deadline_expired"
            },
          });
        } catch (notifError) {
          console.error("Error sending payment deadline expiry notification:", notifError);
        }
      }
    }

    console.log("Ads expiry check completed successfully");
  } catch (error) {
    console.error("Error in checkAdsExpiryAndNotify:", error);
    throw error;
  }
};

// Function to validate ad approval based on date ranges
export const validateAdApproval = async (adId, startDate, endDate) => {
  try {
    // Validate if adId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      throw new Error("Invalid ad ID format");
    }
    
    const ad = await Ad.findById(adId);
    if (!ad) {
      throw new Error("Ad not found");
    }

    // Check if current date is within the ad's date range
    const now = new Date();
    const adStartDate = startDate || ad.startDate;
    const adEndDate = endDate || ad.endDate;
    
    if (adStartDate && adEndDate) {
      if (now < adStartDate || now > adEndDate) {
        return {
          isValid: false,
          message: "Ad cannot be approved outside the scheduled date range"
        };
      }
    } else if (adStartDate) {
      // If only start date is provided
      if (now < adStartDate) {
        return {
          isValid: false,
          message: "Ad cannot be approved before the start date"
        };
      }
    }

    // Check for overlapping ads in the same location
    if (adStartDate && adEndDate) {
      const hasOverlap = await Ad.hasOverlappingAd(ad.location, adStartDate, adEndDate, adId);
      if (hasOverlap) {
        return {
          isValid: false,
          message: "An ad is already running for the selected date range"
        };
      }
    }

    return {
      isValid: true,
      message: "Ad approval is valid"
    };
  } catch (error) {
    console.error("Error validating ad approval:", error);
    throw error;
  }
};

// Function to validate ad creation based on date ranges
export const validateAdCreation = async (location, startDate, endDate) => {
  try {
    // Check if current date is within the ad's date range
    const now = new Date();
    if (startDate && endDate) {
      if (now < startDate || now > endDate) {
        return {
          isValid: false,
          message: "Ad cannot be created with dates outside the current range"
        };
      }
    }

    // Check for overlapping ads in the same location
    const hasOverlap = await Ad.hasOverlappingAd(location, startDate, endDate);
    if (hasOverlap) {
      return {
        isValid: false,
        message: "An ad is already running for the selected date range"
      };
    }

    return {
      isValid: true,
      message: "Ad creation is valid"
    };
  } catch (error) {
    console.error("Error validating ad creation:", error);
    throw error;
  }
};

// Function to validate ad activation based on date ranges
export const validateAdActivation = async (adId, startDate, endDate) => {
  try {
    // Validate if adId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      throw new Error("Invalid ad ID format");
    }
    
    const ad = await Ad.findById(adId);
    if (!ad) {
      throw new Error("Ad not found");
    }

    // Check if current date is within the ad's date range
    const now = new Date();
    const adStartDate = startDate || ad.startDate;
    const adEndDate = endDate || ad.endDate;
    
    if (adStartDate && adEndDate) {
      if (now < adStartDate || now > adEndDate) {
        return {
          isValid: false,
          message: "Ad cannot be activated outside the scheduled date range"
        };
      }
    }

    // Check for overlapping ads in the same location
    if (adStartDate && adEndDate) {
      const hasOverlap = await Ad.hasOverlappingAd(ad.location, adStartDate, adEndDate, adId);
      if (hasOverlap) {
        return {
          isValid: false,
          message: "An ad is already running for the selected date range"
        };
      }
    }

    return {
      isValid: true,
      message: "Ad activation is valid"
    };
  } catch (error) {
    console.error("Error validating ad activation:", error);
    throw error;
  }
};

// Get seller ads config (rates and bank details)
export const getSellerAdsConfig = async (req, res) => {
  try {
    const AdConfig = (await import('../models/AdConfig.js')).default;
    const config = await AdConfig.getSingleton();
    
    res.status(200).json({
      status: 200,
      success: true,
      data: {
        locationRates: config.locationRates,
        bankDetails: config.bankDetails
      }
    });
  } catch (error) {
    console.error('Error getting seller ads config:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get ads config for user
export const getAdsConfigForUser = async (req, res) => {
  try {
    const AdConfig = (await import('../models/AdConfig.js')).default;
    const config = await AdConfig.getSingleton();
    
    res.status(200).json({
      status: 200,
      success: true,
      data: {
        locationRates: config.locationRates
      }
    });
  } catch (error) {
    console.error('Error getting ads config for user:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get available ad locations
export const getAdLocations = async (req, res) => {
  try {
    const locations = [
      'crazy_deals',
      'trending_items',
      'popular_categories',
      'stores_near_me',
      'promotional_banner'
    ];
    
    res.status(200).json({
      status: 200,
      success: true,
      data: locations
    });
  } catch (error) {
    console.error('Error getting ad locations:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create seller ad request
export const createSellerAdRequest = async (req, res) => {
  try {
    const { name, description, location, totalRunDays, inquiry, storeId, productId } = req.body;
    const images = req.files ? req.files.map(file => file.path) : [];

    // Validate required fields
    if (!name || !location) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Name and location are required'
      });
    }

    // Validate location
    const validLocations = [
      'banner', 'popup', 'offer_bar', 'crazy_deals', 
      'trending_items', 'popular_categories', 'stores_near_me', 'promotional_banner'
    ];
    
    if (!validLocations.includes(location)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid location'
      });
    }

    // Get ad config to calculate amount
    const AdConfig = (await import('../models/AdConfig.js')).default;
    const config = await AdConfig.getSingleton();
    const ratePerDay = config.locationRates[location] || 0;
    const amount = ratePerDay * (totalRunDays || 1);

    // Create the ad
    const ad = new Ad({
      name,
      description,
      images,
      location,
      storeId: storeId || null,
      productId: productId || null,
      adOwnerType: 'seller',
      adOwnerId: req.user._id, // Assuming req.user._id is the seller ID
      totalRunDays: totalRunDays || 1,
      amount,
      inquiry,
      status: 'pending'
    });

    // Check for overlapping ads in the same location
    // For new ads, we need to validate the intended date range
    // If totalRunDays is provided, calculate the intended end date
    const intendedStartDate = new Date();
    const intendedEndDate = new Date(intendedStartDate);
    intendedEndDate.setDate(intendedEndDate.getDate() + (totalRunDays || 1));
    
    const hasOverlap = await Ad.hasOverlappingAd(location, intendedStartDate, intendedEndDate);
    if (hasOverlap) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'An ad is already running for the selected date range in this location'
      });
    }

    await ad.save();

    res.status(201).json({
      status: 201,
      success: true,
      message: 'Ad request submitted successfully',
      data: {
        _id: ad._id,
        name: ad.name,
        location: ad.location,
        status: ad.status,
        paymentStatus: ad.paymentStatus,
        amount: ad.amount,
        totalRunDays: ad.totalRunDays
      }
    });
  } catch (error) {
    console.error('Error creating seller ad request:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// List seller ads
export const listSellerAds = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {
      adOwnerId: req.user._id,
      adOwnerType: 'seller',
      deleted: { $ne: true }
    };

    if (status) {
      query.status = status;
    }

    const ads = await Ad.find(query).populate('storeId').populate('productId').sort({ createdAt: -1 });

    res.status(200).json({
      status: 200,
      success: true,
      data: ads
    });
  } catch (error) {
    console.error('Error listing seller ads:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get seller ad details
export const getSellerAdDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: id,
      adOwnerId: req.user._id,
      adOwnerType: 'seller',
      deleted: { $ne: true }
    }).populate('storeId').populate('productId');

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found'
      });
    }

    res.status(200).json({
      status: 200,
      success: true,
      data: ad
    });
  } catch (error) {
    console.error('Error getting seller ad details:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Renew seller ad
export const renewSellerAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, totalRunDays } = req.body;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: id,
      adOwnerId: req.user._id,
      adOwnerType: 'seller',
      deleted: { $ne: true }
    });

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found'
      });
    }

    // Calculate new end date
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + (totalRunDays || ad.totalRunDays || 1));

    // Validate date range to prevent overlapping ads
    const validation = await validateAdActivation(id, start, end);
    if (!validation.isValid) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: validation.message
      });
    }

    // Update ad dates
    ad.startDate = start;
    ad.endDate = end;
    ad.status = 'pending'; // Reset to pending for approval
    ad.paymentStatus = 'pending';

    await ad.save();

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Ad renewed successfully',
      data: ad
    });
  } catch (error) {
    console.error('Error renewing seller ad:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete seller ad
export const deleteSellerAd = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: id,
      adOwnerId: req.user._id,
      adOwnerType: 'seller'
    });

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found'
      });
    }

    // Only allow deletion if status is pending
    if (ad.status !== 'pending') {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Cannot delete ad that is not in pending status'
      });
    }

    ad.deleted = true;
    await ad.save();

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Ad deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting seller ad:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create ad payment session
export const createAdPaymentSession = async (req, res) => {
  try {
    const { adId } = req.body;
    
    // Validate if adId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: adId,
      adOwnerId: req.user._id,
      adOwnerType: 'seller',
      isDead: { $ne: true },
      deleted: { $ne: true }
    });

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found or not accessible'
      });
    }

    // Check if ad is dead (payment deadline expired)
    if (ad.isDead) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Payment deadline has expired for this ad'
      });
    }

    // Check if already paid
    if (ad.paymentStatus === 'paid') {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Ad payment already completed'
      });
    }

    // Prepare payment data for Cashfree
    const paymentData = {
      order_id: `ad_${ad._id}_${Date.now()}`,
      order_amount: ad.amount,
      order_currency: 'INR',
      order_note: `Ad payment for ${ad.name}`,
      customer_details: {
        customer_id: req.user._id.toString(),
        customer_email: req.user.email || 'user@example.com',
        customer_phone: req.user.phone || '9999999999'
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/payment-success`,
        notify_url: `${process.env.BACKEND_URL}/api/order/payment/webhook/v1`
      },
      order_tags: {
        forPayment: "Ad",
        adId: ad._id.toString(),
        sellerId: ad.adOwnerId.toString(),
        location: ad.location,
        totalRunDays: ad.totalRunDays.toString()
      }
    };

    // Make API call to Cashfree to create payment session
    const axios = (await import('axios')).default;
    const headers = {
      'x-api-version': process.env.CF_API_VERSION || '2022-09-01',
      'x-client-id': process.env.CF_CLIENT_ID,
      'x-client-secret': process.env.CF_CLIENT_SECRET,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(
      process.env.CF_CREATE_ORDER_URL,
      paymentData,
      { headers }
    );

    // Update ad with payment reference
    ad.paymentReference = paymentData.order_id;
    await ad.save();

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Payment session created successfully',
      data: {
        paymentSessionId: response.data.payment_session_id,
        cf_order_id: response.data.order_id,
        adId: ad._id,
        amount: ad.amount
      }
    });
  } catch (error) {
    console.error('Error creating ad payment session:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get ad payment info
export const getAdPaymentInfo = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: id,
      adOwnerId: req.user._id,
      adOwnerType: 'seller',
      isDead: { $ne: true },
      deleted: { $ne: true }
    });

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found or not accessible'
      });
    }

    // Check if ad is dead (payment deadline expired)
    if (ad.isDead) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Payment deadline has expired for this ad'
      });
    }

    const AdConfig = (await import('../models/AdConfig.js')).default;
    const config = await AdConfig.getSingleton();

    res.status(200).json({
      status: 200,
      success: true,
      data: {
        ad: {
          _id: ad._id,
          name: ad.name,
          location: ad.location,
          amount: ad.amount,
          paymentStatus: ad.paymentStatus,
          paymentDeadline: ad.paymentDeadline,
          totalRunDays: ad.totalRunDays
        },
        paymentAmount: ad.amount,
        bankDetails: config.bankDetails,
        paymentDeadline: ad.paymentDeadline,
        canMakePayment: ad.paymentStatus !== 'paid' && !ad.isDead
      }
    });
  } catch (error) {
    console.error('Error getting ad payment info:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin functions

// Admin list ads
export const adminListAds = async (req, res) => {
  try {
    const { status, adOwnerType, location } = req.query;
    const query = { deleted: { $ne: true } };

    if (status) {
      query.status = status;
    }
    if (adOwnerType) {
      query.adOwnerType = adOwnerType;
    }
    if (location) {
      query.location = location;
    }

    const ads = await Ad.find(query)
      .populate('adOwnerId')
      .populate('storeId')
      .populate('productId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 200,
      success: true,
      data: ads
    });
  } catch (error) {
    console.error('Error listing ads:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin get ad details
export const adminGetAdDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: id,
      deleted: { $ne: true }
    }).populate('adOwnerId').populate('storeId').populate('productId');

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found'
      });
    }

    res.status(200).json({
      status: 200,
      success: true,
      data: ad
    });
  } catch (error) {
    console.error('Error getting ad details:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin update ad status
export const adminUpdateAdStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, startDate } = req.body;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found'
      });
    }

    // Validate date range for approval
    if (status === 'approved') {
      // If ad is being approved, ensure it's within date range
      let adStartDate = ad.startDate;
      let adEndDate = ad.endDate;
      
      if (startDate) {
        adStartDate = new Date(startDate);
        // If endDate doesn't exist, calculate it based on totalRunDays
        if (!adEndDate) {
          const endDate = new Date(adStartDate);
          endDate.setDate(endDate.getDate() + ad.totalRunDays);
          adEndDate = endDate;
        }
      }
      
      // Check if current date is within the ad's date range
      const now = new Date();
      if (adStartDate && adEndDate) {
        if (now < adStartDate || now > adEndDate) {
          return res.status(400).json({
            status: 400,
            success: false,
            message: "Ad cannot be approved outside the scheduled date range"
          });
        }
      } else if (adStartDate) {
        // If only start date is provided
        if (now < adStartDate) {
          return res.status(400).json({
            status: 400,
            success: false,
            message: "Ad cannot be approved before the start date"
          });
        }
      }
      
      // Check for overlapping ads in the same location
      if (adStartDate && adEndDate) {
        const hasOverlap = await Ad.hasOverlappingAd(ad.location, adStartDate, adEndDate, id);
        if (hasOverlap) {
          return res.status(400).json({
            status: 400,
            success: false,
            message: "An ad is already running for the selected date range"
          });
        }
      }
      
      // Ensure ad has valid owner type
      if (!ad.adOwnerType || !['admin', 'seller', 'retailer'].includes(ad.adOwnerType)) {
        return res.status(400).json({
          status: 400,
          success: false,
          message: "Invalid ad owner type. Must be admin, seller, or retailer"
        });
      }
      
      // Ensure ad has valid owner ID
      if (!ad.adOwnerId) {
        return res.status(400).json({
          status: 400,
          success: false,
          message: "Ad must have a valid owner ID"
        });
      }
    }

    // If approving an ad, set payment deadline (48 hours from now)
    if (status === 'approved' && ad.status === 'pending') {
      const paymentDeadline = new Date();
      paymentDeadline.setHours(paymentDeadline.getHours() + 48); // 48 hours
      ad.paymentDeadline = paymentDeadline;
    }

    // If activating an ad
    if (status === 'active') {
      if (!ad.startDate) {
        ad.startDate = startDate ? new Date(startDate) : new Date();
      }
      if (!ad.endDate) {
        const endDate = new Date(ad.startDate);
        endDate.setDate(endDate.getDate() + ad.totalRunDays);
        ad.endDate = endDate;
      }
      ad.paymentStatus = paymentStatus || 'paid';
      ad.expiryNotified = false;
    }

    // Update status and payment status
    if (status) {
      ad.status = status;
    }
    if (paymentStatus) {
      ad.paymentStatus = paymentStatus;
    }

    await ad.save();

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Ad updated successfully',
      data: {
        _id: ad._id,
        status: ad.status,
        paymentStatus: ad.paymentStatus
      }
    });
  } catch (error) {
    console.error('Error updating ad status:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin delete ad
export const adminDeleteAd = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found'
      });
    }

    ad.deleted = true;
    await ad.save();

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Ad deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ad:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin create Orsolum ad (admin ad with no time limits)
export const adminCreateOrsolumAd = async (req, res) => {
  try {
    const { name, description, location, inquiry, productId } = req.body;
    const images = req.files ? req.files.map(file => file.path) : [];

    // Validate required fields
    if (!name || !location) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Name and location are required'
      });
    }

    // Validate location
    const validLocations = [
      'banner', 'popup', 'offer_bar', 'crazy_deals', 
      'trending_items', 'popular_categories', 'stores_near_me', 'promotional_banner'
    ];
    
    if (!validLocations.includes(location)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid location'
      });
    }

    // Create admin ad (no time limits, immediate activation)
    const ad = new Ad({
      name,
      description,
      images,
      location,
      productId: productId || null,
      adOwnerType: 'admin',
      adOwnerId: req.user._id, // Admin ID
      totalRunDays: 999999, // Large number to indicate no time limit
      amount: 0, // Admin ads are free
      inquiry,
      status: 'active',
      paymentStatus: 'paid', // Admin ads are considered paid
      createdByAdmin: true,
      startDate: new Date(),
      endDate: new Date('2100-12-31'), // Far future date to indicate no end
      expiryNotified: false
    });

    await ad.save();

    res.status(201).json({
      status: 201,
      success: true,
      message: 'Admin ad created successfully',
      data: {
        _id: ad._id,
        name: ad.name,
        location: ad.location,
        status: ad.status,
        paymentStatus: ad.paymentStatus,
        amount: ad.amount,
        totalRunDays: ad.totalRunDays,
        createdByAdmin: ad.createdByAdmin
      }
    });
  } catch (error) {
    console.error('Error creating admin ad:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin update Orsolum ad
export const adminUpdateOrsolumAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, location, inquiry, productId } = req.body;
    const images = req.files ? req.files.map(file => file.path) : [];
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: id,
      adOwnerType: 'admin',
      deleted: { $ne: true }
    });

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Admin ad not found'
      });
    }

    // Update fields
    if (name) ad.name = name;
    if (description) ad.description = description;
    if (location) ad.location = location;
    if (inquiry) ad.inquiry = inquiry;
    if (productId) ad.productId = productId;
    if (images.length > 0) ad.images = images;

    await ad.save();

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Admin ad updated successfully',
      data: ad
    });
  } catch (error) {
    console.error('Error updating admin ad:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin delete Orsolum ad
export const adminDeleteOrsolumAd = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: id,
      adOwnerType: 'admin'
    });

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Admin ad not found'
      });
    }

    ad.deleted = true;
    await ad.save();

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Admin ad deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting admin ad:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin get ads config
export const adminGetAdsConfig = async (req, res) => {
  try {
    const AdConfig = (await import('../models/AdConfig.js')).default;
    const config = await AdConfig.getSingleton();
    
    res.status(200).json({
      status: 200,
      success: true,
      data: {
        locationRates: config.locationRates,
        bankDetails: config.bankDetails
      }
    });
  } catch (error) {
    console.error('Error getting admin ads config:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin update ads config
export const adminUpdateAdsConfig = async (req, res) => {
  try {
    const AdConfig = (await import('../models/AdConfig.js')).default;
    const config = await AdConfig.getSingleton();
    
    const { locationRates, bankDetails } = req.body;
    
    if (locationRates) {
      config.locationRates = { ...config.locationRates, ...locationRates };
    }
    if (bankDetails) {
      config.bankDetails = { ...config.bankDetails, ...bankDetails };
    }
    
    await config.save();
    
    res.status(200).json({
      status: 200,
      success: true,
      message: 'Ads config updated successfully',
      data: {
        locationRates: config.locationRates,
        bankDetails: config.bankDetails
      }
    });
  } catch (error) {
    console.error('Error updating ads config:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all ads config data
export const getAllAdsConfigData = async (req, res) => {
  try {
    const AdConfig = (await import('../models/AdConfig.js')).default;
    const config = await AdConfig.getSingleton();
    
    res.status(200).json({
      status: 200,
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting all ads config data:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Retailer functions

// Create retailer ad request
export const createRetailerAdRequest = async (req, res) => {
  try {
    const { name, description, location, totalRunDays, inquiry, storeId, productId } = req.body;
    const images = req.files ? req.files.map(file => file.path) : [];

    // Validate required fields
    if (!name || !location) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Name and location are required'
      });
    }

    // Validate location
    const validLocations = [
      'banner', 'popup', 'offer_bar', 'crazy_deals', 
      'trending_items', 'popular_categories', 'stores_near_me', 'promotional_banner'
    ];
    
    if (!validLocations.includes(location)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid location'
      });
    }

    // Get ad config to calculate amount
    const AdConfig = (await import('../models/AdConfig.js')).default;
    const config = await AdConfig.getSingleton();
    const ratePerDay = config.locationRates[location] || 0;
    const amount = ratePerDay * (totalRunDays || 1);

    // Create the ad
    const ad = new Ad({
      name,
      description,
      images,
      location,
      storeId: storeId || null,
      productId: productId || null,
      adOwnerType: 'retailer',
      adOwnerId: req.user._id, // Assuming req.user._id is the retailer ID
      totalRunDays: totalRunDays || 1,
      amount,
      inquiry,
      status: 'pending'
    });

    // Check for overlapping ads in the same location
    // For new ads, we need to validate the intended date range
    // If totalRunDays is provided, calculate the intended end date
    const intendedStartDate = new Date();
    const intendedEndDate = new Date(intendedStartDate);
    intendedEndDate.setDate(intendedEndDate.getDate() + (totalRunDays || 1));
    
    const hasOverlap = await Ad.hasOverlappingAd(location, intendedStartDate, intendedEndDate);
    if (hasOverlap) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'An ad is already running for the selected date range in this location'
      });
    }

    await ad.save();

    res.status(201).json({
      status: 201,
      success: true,
      message: 'Ad request submitted successfully',
      data: {
        _id: ad._id,
        name: ad.name,
        location: ad.location,
        status: ad.status,
        paymentStatus: ad.paymentStatus,
        amount: ad.amount,
        totalRunDays: ad.totalRunDays
      }
    });
  } catch (error) {
    console.error('Error creating retailer ad request:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// List retailer ads
export const listRetailerAds = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {
      adOwnerId: req.user._id,
      adOwnerType: 'retailer',
      deleted: { $ne: true }
    };

    if (status) {
      query.status = status;
    }

    const ads = await Ad.find(query).populate('storeId').populate('productId').sort({ createdAt: -1 });

    res.status(200).json({
      status: 200,
      success: true,
      data: ads
    });
  } catch (error) {
    console.error('Error listing retailer ads:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get retailer ad details
export const getRetailerAdDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: id,
      adOwnerId: req.user._id,
      adOwnerType: 'retailer',
      deleted: { $ne: true }
    }).populate('storeId').populate('productId');

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found'
      });
    }

    res.status(200).json({
      status: 200,
      success: true,
      data: ad
    });
  } catch (error) {
    console.error('Error getting retailer ad details:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete retailer ad
export const deleteRetailerAd = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: id,
      adOwnerId: req.user._id,
      adOwnerType: 'retailer'
    });

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found'
      });
    }

    // Only allow deletion if status is pending
    if (ad.status !== 'pending') {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Cannot delete ad that is not in pending status'
      });
    }

    ad.deleted = true;
    await ad.save();

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Ad deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting retailer ad:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create retailer ad payment session
export const createRetailerAdPaymentSession = async (req, res) => {
  try {
    const { adId } = req.body;
    
    // Validate if adId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid ad ID format'
      });
    }

    const ad = await Ad.findOne({
      _id: adId,
      adOwnerId: req.user._id,
      adOwnerType: 'retailer',
      isDead: { $ne: true },
      deleted: { $ne: true }
    });

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found or not accessible'
      });
    }

    // Check if ad is dead (payment deadline expired)
    if (ad.isDead) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Payment deadline has expired for this ad'
      });
    }

    // Check if already paid
    if (ad.paymentStatus === 'paid') {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Ad payment already completed'
      });
    }

    // Prepare payment data for Cashfree
    const paymentData = {
      order_id: `ad_${ad._id}_${Date.now()}`,
      order_amount: ad.amount,
      order_currency: 'INR',
      order_note: `Ad payment for ${ad.name}`,
      customer_details: {
        customer_id: req.user._id.toString(),
        customer_email: req.user.email || 'user@example.com',
        customer_phone: req.user.phone || '9999999999'
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/payment-success`,
        notify_url: `${process.env.BACKEND_URL}/api/order/payment/webhook/v1`
      },
      order_tags: {
        forPayment: "Ad",
        adId: ad._id.toString(),
        retailerId: ad.adOwnerId.toString(),
        location: ad.location,
        totalRunDays: ad.totalRunDays.toString()
      }
    };

    // Make API call to Cashfree to create payment session
    const axios = (await import('axios')).default;
    const headers = {
      'x-api-version': process.env.CF_API_VERSION || '2022-09-01',
      'x-client-id': process.env.CF_CLIENT_ID,
      'x-client-secret': process.env.CF_CLIENT_SECRET,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(
      process.env.CF_CREATE_ORDER_URL,
      paymentData,
      { headers }
    );

    // Update ad with payment reference
    ad.paymentReference = paymentData.order_id;
    await ad.save();

    res.status(200).json({
      status: 200,
      success: true,
      message: 'Payment session created successfully',
      data: {
        paymentSessionId: response.data.payment_session_id,
        cf_order_id: response.data.order_id,
        adId: ad._id,
        amount: ad.amount
      }
    });
  } catch (error) {
    console.error('Error creating retailer ad payment session:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get retailer local store ads (for retailer dashboard)
export const getRetailerLocalStoreAds = async (req, res) => {
  try {
    // For retailers, this would return their local store ads or related ads
    // This could be customized based on business requirements
    const ads = await Ad.find({
      adOwnerId: req.user._id,
      adOwnerType: 'retailer',
      status: 'active',
      isDead: { $ne: true },
      deleted: { $ne: true }
    }).populate('storeId').populate('productId').sort({ createdAt: -1 });

    res.status(200).json({
      status: 200,
      success: true,
      data: ads
    });
  } catch (error) {
    console.error('Error getting retailer local store ads:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get active ads (public API)
export const getActiveAds = async (req, res) => {
  try {
    const { location } = req.query;
    const now = new Date();
    
    // Build query for active ads
    const query = {
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
      isDead: { $ne: true },
      deleted: { $ne: true }
    };
    
    // If location is specified, filter by location
    if (location) {
      query.location = location;
    }
    
    // Find active ads
    const ads = await Ad.find(query)
      .populate('storeId')
      .populate('productId')
      .sort({ createdAt: -1 });

    // The query already filters by date range, but we can add additional validation if needed
    const validAds = ads;
    
    // Group ads by location if no specific location is requested
    const adsByLocation = {};
    if (!location) {
      validAds.forEach(ad => {
        if (!adsByLocation[ad.location]) {
          adsByLocation[ad.location] = [];
        }
        // Only add the first ad per location (to prevent multiple ads in same location)
        if (adsByLocation[ad.location].length === 0) {
          adsByLocation[ad.location].push(ad);
        }
      });
    }
    
    res.status(200).json({
      status: 200,
      success: true,
      data: {
        ads: validAds,
        adsByLocation
      }
    });
  } catch (error) {
    console.error('Error getting active ads:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Internal server error'
    });
  }
};
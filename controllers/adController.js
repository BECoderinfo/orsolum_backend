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
            targetUserIds: [ad.sellerId],
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
            targetUserIds: [ad.sellerId],
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
            targetUserIds: [ad.sellerId],
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
      const hasOverlap = await Ad.hasOverlappingAd(ad.location, adStartDate, adEndDate, adId, ad.adOwnerType, ad.adOwnerId);
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
    // For this function, we don't have ad owner info, so we pass null
    // This will use the default behavior without owner filtering
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
      const hasOverlap = await Ad.hasOverlappingAd(ad.location, adStartDate, adEndDate, adId, ad.adOwnerType, ad.adOwnerId);
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
    const { name, description, location, totalRunDays, inquiry } = req.body;
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
      'crazy_deals', 
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
      sellerId: req.user._id, // Assuming req.user._id is the seller ID
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
    
    const hasOverlap = await Ad.hasOverlappingAd(location, intendedStartDate, intendedEndDate, null, 'seller', req.user._id);
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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'seller' },
        { sellerId: req.user._id } // For backward compatibility
      ],
      deleted: { $ne: true }
    };

    if (status) {
      query.status = status;
    }

    const ads = await Ad.find(query).sort({ createdAt: -1 });

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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'seller' },
        { sellerId: req.user._id } // For backward compatibility
      ],
      deleted: { $ne: true }
    });

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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'seller' },
        { sellerId: req.user._id } // For backward compatibility
      ],
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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'seller' },
        { sellerId: req.user._id } // For backward compatibility
      ]
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
    try {
      await ad.save();
    } catch (saveError) {
      console.error('Error saving ad deletion:', saveError);
      return res.status(500).json({
        status: 500,
        success: false,
        message: 'Failed to update ad status'
      });
    }

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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'seller' },
        { sellerId: req.user._id } // For backward compatibility
      ],
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
        sellerId: ad.sellerId.toString(),
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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'retailer' },
        { sellerId: req.user._id }
      ],
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
    const { status, location } = req.query;
    const query = { deleted: { $ne: true } };

    if (status) {
      query.status = status;
    }
    if (location) {
      query.location = location;
    }

    const ads = await Ad.find(query)
      .populate('sellerId')
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
    }).populate('sellerId');

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
        const hasOverlap = await Ad.hasOverlappingAd(ad.location, adStartDate, adEndDate, id, ad.adOwnerType, ad.adOwnerId);
        if (hasOverlap) {
          return res.status(400).json({
            status: 400,
            success: false,
            message: "An ad is already running for the selected date range"
          });
        }
      }
      
      // Ensure ad has valid owner ID
      if (!ad.sellerId) {
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
    try {
      await ad.save();
    } catch (saveError) {
      console.error('Error saving ad deletion:', saveError);
      return res.status(500).json({
        status: 500,
        success: false,
        message: 'Failed to update ad status'
      });
    }

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
      sellerId: null,
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
      sellerId: null
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

/**
 * Get active ads for retailer's local store display (LOCAL STORE)
 * This API returns active ads from RETAILER stores only
 * ✅ Retailer ads → Local store me show hongi
 */
export const getRetailerLocalStoreAds = async (req, res) => {
  try {
    const { location } = req.query;
    const now = new Date();

    // Filter for retailer ads only - support both new and legacy patterns
    const filter = {
      status: "active",
      startDate: { $lte: now },
      endDate: { $gte: now },
      deleted: { $ne: true },
      $or: [
        { adOwnerType: 'retailer' },
        { sellerId: { $exists: true } } // For legacy retailer ads that used sellerId
      ]
    };

    // Filter by location if provided
    if (location) {
      filter.location = location;
    }

    const ads = await Ad.find(filter)
      .populate("adOwnerId", "name phone")
      .sort({ startDate: 1 });

    // Group ads by location, keeping only one ad per location (first from sorted list)
    const adsByLocation = {};
    ads.forEach((ad) => {
      if (!adsByLocation[ad.location]) {
        adsByLocation[ad.location] = {
          _id: ad._id,
          name: ad.name,
          description: ad.description,
          images: Array.isArray(ad.images) ? ad.images : [],
          location: ad.location,
          startDate: ad.startDate,
          endDate: ad.endDate
        };
      }
    });

    // Fill missing slots per location with admin ads (Orsolum) while keeping retailer priority
    const fallbackFilter = {
      status: "active",
      startDate: { $lte: now },
      endDate: { $gte: now },
      deleted: { $ne: true },
      adOwnerType: { $exists: false }, // Admin ads (no owner type)
      sellerId: { $exists: false } // Also check for old format admin ads
    };
    
    if (location) {
      fallbackFilter.location = location;
    }

    const fallbackAds = await Ad.find(fallbackFilter)
      .sort({ startDate: 1 });

    fallbackAds.forEach((ad) => {
      if (!adsByLocation[ad.location]) { // retailer ad already occupies slot
        adsByLocation[ad.location] = {
          _id: ad._id,
          name: ad.name,
          description: ad.description,
          images: Array.isArray(ad.images) ? ad.images : [],
          location: ad.location,
          startDate: ad.startDate,
          endDate: ad.endDate
        };
      }
    });

    const formattedAds = Object.values(adsByLocation);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Active ads for local store (retailer ads only)",
      data: {
        ads: formattedAds,
        adsByLocation: adsByLocation,
      },
    });
  } catch (error) {
    console.error('Error getting retailer local store ads:', error);
    res.status(500).json({
      status: 500,
      success: false,
      message: error.message,
    });
  }
};
// Retailer functions

// Create retailer ad request
export const createRetailerAdRequest = async (req, res) => {
  try {
    const { name, description, location, totalRunDays, inquiry } = req.body;
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
    
    const hasOverlap = await Ad.hasOverlappingAd(location, intendedStartDate, intendedEndDate, null, 'retailer', req.user._id);
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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'retailer' },
        { sellerId: req.user._id } // For backward compatibility with existing retailer ads
      ],
      deleted: { $ne: true }
    };

    if (status) {
      query.status = status;
    }

    const ads = await Ad.find(query).sort({ createdAt: -1 });

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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'retailer' },
        { sellerId: req.user._id } // For backward compatibility with existing retailer ads
      ],
      deleted: { $ne: true }
    });

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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'retailer' },
        { sellerId: req.user._id } // For backward compatibility with existing retailer ads
      ]
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
    try {
      await ad.save();
    } catch (saveError) {
      console.error('Error saving ad deletion:', saveError);
      return res.status(500).json({
        status: 500,
        success: false,
        message: 'Failed to update ad status'
      });
    }

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
      $or: [
        { adOwnerId: req.user._id, adOwnerType: 'retailer' },
        { sellerId: req.user._id } // For backward compatibility with existing retailer ads
      ],
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
        sellerId: ad.sellerId.toString(),
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



// Get single ad details (public API - no user filtering)
export const getAdDetails = async (req, res) => {
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
      status: 'active',
      isDead: { $ne: true },
      deleted: { $ne: true }
    });

    if (!ad) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Ad not found or not active'
      });
    }
    
    // Apply date validation for non-admin ads
    const now = new Date();
    const isAdminAd = ad.sellerId === null || ad.sellerId === undefined; // If no sellerId, consider it as admin ad
    
    if (!isAdminAd) {
      // For seller ads, validate date range
      if (!ad.startDate || !ad.endDate || ad.startDate > now || ad.endDate < now) {
        return res.status(404).json({
          status: 404,
          success: false,
          message: 'Ad not available (outside date range)'
        });
      }
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

// Get active ads (public API)
export const getActiveAds = async (req, res) => {
  try {
    const { location } = req.query;
    const now = new Date();
    
    // Find all active ads (both with and without date restrictions)
    const allAds = await Ad.find({
      status: 'active',
      isDead: { $ne: true },
      deleted: { $ne: true }
    })
      .sort({ createdAt: -1 });

    // Group ads by location and prioritize non-admin ads
    const adsByLocation = {};
    
    allAds.forEach(ad => {
      // If location query parameter is specified, only include ads for that location
      if (location && ad.location !== location) {
        return;
      }
      
      // Apply date range filter based on ad type
      // For seller ads, apply date range validation
      const isAdminAd = ad.sellerId === null || ad.sellerId === undefined; // If no sellerId, consider it as admin ad
      
      if (!isAdminAd) {
        // Apply date range validation for seller ads
        if (!ad.startDate || !ad.endDate || ad.startDate > now || ad.endDate < now) {
          return; // Skip this ad if it doesn't meet date criteria
        }
      }
      
      if (!adsByLocation[ad.location]) {
        adsByLocation[ad.location] = [];
      }
      
      // Check if this is a seller ad (higher priority) or admin ad (lower priority)
      const isSellerAd = ad.sellerId !== null && ad.sellerId !== undefined;
      
      // If no ad exists for this location yet, add this one
      if (adsByLocation[ad.location].length === 0) {
        adsByLocation[ad.location].push(ad);
      } else {
        // If there's already an ad for this location, check priority
        const existingAd = adsByLocation[ad.location][0];
        const isExistingSeller = existingAd.sellerId !== null && existingAd.sellerId !== undefined;
        
        // If existing ad is seller, keep it (higher priority)
        if (isExistingSeller) {
          // Do nothing, keep existing ad
        } else {
          // If existing ad is admin and current ad is seller, replace it
          if (isSellerAd) {
            adsByLocation[ad.location] = [ad];
          }
          // If both are admin ads, keep the first one found
        }
      }
    });
    
    // Flatten the adsByLocation to get all ads
    let validAds = [];
    if (location) {
      // If specific location requested, return only ads for that location
      validAds = adsByLocation[location] || [];
    } else {
      // If no specific location, get all ads from all locations
      Object.values(adsByLocation).forEach(locationAds => {
        validAds = validAds.concat(locationAds);
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
import CouponCode from '../models/CouponCode.js';
import CouponHistory from '../models/CouponHistory.js';
import { errorResponse, successResponse } from '../helper/api.responses.js';
import mongoose from 'mongoose';

// Create coupon (admin, seller, retailer)
export const createCoupon = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      discountType,
      discountValue,
      use,
      minOrderValue,
      maxDiscountAmount,
      validFrom,
      validUntil,
      usageLimit,
      userEligibility,
      storeId
    } = req.body;

    // Validate required fields
    if (!name || !code || !discountType || discountValue === undefined || !validFrom || !validUntil) {
      return res.status(400).json(
        errorResponse('Name, code, discount type, discount value, valid from, and valid until are required')
      );
    }

    // Handle storeId - convert empty string to null or validate as ObjectId
    let processedStoreId = null;
    if (storeId && storeId.trim() !== '') {
      if (!mongoose.Types.ObjectId.isValid(storeId)) {
        return res.status(400).json(
          errorResponse('Invalid storeId format. Must be a valid ObjectId or null.')
        );
      }
      processedStoreId = storeId;
    }

    // Check if coupon code already exists
    const existingCoupon = await CouponCode.findOne({ code, deleted: { $ne: true } });
    if (existingCoupon) {
      return res.status(400).json(
        errorResponse('Coupon code already exists')
      );
    }

    // Determine owner type and ID based on user role
    let ownerType, ownerId;
    if (req.user.role === 'admin') {
      ownerType = 'admin';
      ownerId = req.user._id;
    } else if (req.user.role === 'seller') {
      ownerType = 'seller';
      ownerId = req.user._id;
    } else if (req.user.role === 'retailer') {
      ownerType = 'retailer';
      ownerId = req.user._id;
    } else {
      return res.status(403).json(
        errorResponse('Unauthorized to create coupon')
      );
    }

    const coupon = new CouponCode({
      name,
      code: code.toUpperCase(), // Convert to uppercase for consistency
      description,
      discountType,
      discountValue,
      use,
      minOrderValue: minOrderValue || 0,
      maxDiscountAmount,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      usageLimit: usageLimit || 0, // 0 means unlimited
      userEligibility: userEligibility || 'all',
      ownerType,
      ownerId,
      storeId: processedStoreId,
      createdBy: req.user._id
    });

    await coupon.save();

    return res.status(201).json(
      successResponse({
        _id: coupon._id,
        name: coupon.name,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderValue: coupon.minOrderValue,
        validFrom: coupon.validFrom,
        validUntil: coupon.validUntil,
        usageLimit: coupon.usageLimit,
        userEligibility: coupon.userEligibility
      }, 'Coupon created successfully')
    );
  } catch (error) {
    console.error('Error creating coupon:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Get coupons by owner type
export const getCoupons = async (req, res) => {
  try {
    const { ownerType, ownerId, activeOnly } = req.query;

    let query = { deleted: { $ne: true } };

    // If ownerType and ownerId are provided in query, use them
    if (ownerType && ownerId) {
      query.ownerType = ownerType;
      query.ownerId = new mongoose.Types.ObjectId(ownerId);
    } else {
      // Otherwise, filter by logged-in user's role and ID (unless admin)
      if (req.user.role === 'admin') {
        // Admin can see all coupons - no filter needed
      } else if (req.user.role === 'seller' || req.user.role === 'retailer') {
        // Seller/Retailer can only see their own coupons
        query.ownerType = req.user.role;
        query.ownerId = new mongoose.Types.ObjectId(req.user._id);
      } else {
        // Other roles cannot access coupons
        return res.status(403).json(
          errorResponse('Unauthorized to access coupons')
        );
      }
    }

    // Filter by active status
    if (activeOnly === 'true') {
      query.validFrom = { $lte: new Date() };
      query.validUntil = { $gte: new Date() };
    }

    const coupons = await CouponCode.find(query).sort({ createdAt: -1 });

    return res.status(200).json(
      successResponse(coupons, 'Coupons retrieved successfully')
    );
  } catch (error) {
    console.error('Error getting coupons:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Get single coupon by ID
export const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json(
        errorResponse('Invalid coupon ID format')
      );
    }

    const coupon = await CouponCode.findById(id);
    
    if (!coupon || coupon.deleted) {
      return res.status(404).json(
        errorResponse('Coupon not found')
      );
    }

    // Check if user is authorized to view this coupon
    const userRole = req.user.role;
    const userId = req.user._id.toString();
    const couponOwnerId = coupon.ownerId ? coupon.ownerId.toString() : null;
    const couponOwnerType = coupon.ownerType;

    // Admin can view any coupon
    if (userRole === 'admin') {
      // Allow access
    } 
    // Owner can view their own coupon (seller/retailer)
    else if (userRole === couponOwnerType && userId === couponOwnerId) {
      // Allow access
    } 
    // Unauthorized
    else {
      return res.status(403).json(
        errorResponse('Unauthorized to view this coupon')
      );
    }

    return res.status(200).json(
      successResponse(coupon, 'Coupon retrieved successfully')
    );
  } catch (error) {
    console.error('Error getting coupon:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Get all valid coupons for a user
export const getValidCoupons = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    // Find all valid, non-deleted coupons
    const coupons = await CouponCode.find({
      deleted: { $ne: true },
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $expr: {
        $or: [
          { $eq: ["$usageLimit", 0] }, // Unlimited usage
          { $lt: ["$usageCount", "$usageLimit"] } // Usage count less than limit
        ]
      }
    });

    // Filter based on user eligibility
    const validCoupons = coupons.filter(coupon => {
      if (coupon.userEligibility === 'all') {
        return true;
      }

      // For new user vs existing user eligibility, we would need to check user's order history
      // This is a simplified check - in a real app, you'd check if user has placed orders before
      if (coupon.userEligibility === 'new_user') {
        // For now, assume all users can use new user coupons
        return true;
      }

      return true;
    });

    return res.status(200).json(
      successResponse(validCoupons, 'Valid coupons retrieved successfully')
    );
  } catch (error) {
    console.error('Error getting valid coupons:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Get all applicable coupons for user (global + store-specific) with eligibility details
export const getApplicableCoupons = async (req, res) => {
  try {
    const { storeId, cartTotal } = req.query; // Optional storeId for store-specific coupons, cartTotal for eligibility check
    const userId = req.user._id;
    const now = new Date();

    // ✅ Check if user has previous orders (for userEligibility check)
    const hasPreviousOrders = await CouponHistory.exists({ userId });

    // Base query for valid coupons
    let query = {
      deleted: { $ne: true },
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $expr: {
        $or: [
          { $eq: ["$usageLimit", 0] }, // Unlimited usage
          { $lt: ["$usageCount", "$usageLimit"] } // Usage count less than limit
        ]
      }
    };

    // If storeId is provided, include both global and store-specific coupons
    if (storeId && storeId.trim() !== '') {
      if (!mongoose.Types.ObjectId.isValid(storeId)) {
        return res.status(400).json(
          errorResponse('Invalid storeId format. Must be a valid ObjectId.')
        );
      }
      
      query.$or = [
        { storeId: null }, // Global coupons
        { storeId: new mongoose.Types.ObjectId(storeId) } // Store-specific coupons
      ];
    } else {
      // If no storeId provided, only get global coupons
      query.storeId = null;
    }

    const coupons = await CouponCode.find(query).sort({ createdAt: -1 });
    
    // ✅ Filter coupons based on user eligibility and usage history
    const applicableCoupons = [];
    
    for (const coupon of coupons) {
      // Check user eligibility
      if (coupon.userEligibility === 'new_user' && hasPreviousOrders) {
        continue; // Skip if coupon is for new users only but user has previous orders
      }
      
      if (coupon.userEligibility === 'existing_user' && !hasPreviousOrders) {
        continue; // Skip if coupon is for existing users only but user has no previous orders
      }
      
      // Check if user has already used "one time use" coupon
      if (coupon.use === 'one') {
        const userCouponHistory = await CouponHistory.findOne({
          couponId: coupon._id,
          userId: userId
        });
        
        if (userCouponHistory) {
          continue; // Skip if user has already used this coupon
        }
      }
      
      applicableCoupons.push(coupon);
    }
    
    // ✅ If cartTotal is provided, calculate eligibility for each coupon
    let enhancedCoupons = applicableCoupons;
    if (cartTotal !== undefined && cartTotal !== null && cartTotal !== '') {
      const numericCartTotal = Number(cartTotal);
      if (!isNaN(numericCartTotal)) {
        enhancedCoupons = applicableCoupons.map(coupon => {
          const isEligible = numericCartTotal >= (coupon.minOrderValue || 0);
          return {
            ...coupon.toObject(),
            isEligible,
            eligibilityMessage: isEligible 
              ? 'Coupon is eligible for current cart total' 
              : `Minimum order value of ₹${coupon.minOrderValue} required (current cart total: ₹${numericCartTotal})`
          };
        });
      }
    }

    // ✅ Ensure response is always an array, even if empty
    const responseData = Array.isArray(enhancedCoupons) ? enhancedCoupons : [];

    return res.status(200).json(
      successResponse(responseData, 'Applicable coupons retrieved successfully')
    );
  } catch (error) {
    console.error('Error getting applicable coupons:', error);
    // ✅ Return proper error response with empty array to prevent frontend crash
    // Frontend expects { success: false, message: "...", data: [] } format
    return res.status(200).json({
      success: false,
      message: error.message || 'Failed to retrieve coupons. Please try again.',
      data: []
    });
  }
};

// Get coupons by store
export const getCouponsByStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const now = new Date();

    // Validate storeId
    if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json(
        errorResponse('Valid storeId is required')
      );
    }

    const coupons = await CouponCode.find({
      storeId: new mongoose.Types.ObjectId(storeId),
      deleted: { $ne: true },
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $expr: {
        $or: [
          { $eq: ["$usageLimit", 0] }, // Unlimited usage
          { $lt: ["$usageCount", "$usageLimit"] } // Usage count less than limit
        ]
      }
    }).sort({ createdAt: -1 });

    return res.status(200).json(
      successResponse(coupons, 'Store coupons retrieved successfully')
    );
  } catch (error) {
    console.error('Error getting store coupons:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Validate coupon
export const validateCoupon = async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    const userId = req.user._id;
    const now = new Date();

    if (!code) {
      return res.status(400).json(
        errorResponse('Coupon code is required')
      );
    }

    // First validate the coupon (using orderTotal for minOrderValue check since this endpoint doesn't have itemTotal)
    const validateResult = await validateCouponInternal(code, orderTotal, userId, null, orderTotal);
    if (!validateResult.isValid) {
      return res.status(400).json(
        errorResponse(validateResult.message)
      );
    }

    const { coupon, discountAmount } = validateResult;

    return res.status(200).json(
      successResponse({
        coupon: {
          _id: coupon._id,
          code: coupon.code,
          name: coupon.name,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          maxDiscountAmount: coupon.maxDiscountAmount
        },
        discountAmount: discountAmount,
        message: 'Coupon is valid'
      }, 'Coupon validated successfully')
    );
  } catch (error) {
    console.error('Error validating coupon:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Apply coupon to order (this would be called before order creation)
export const applyCoupon = async (req, res) => {
  try {
    const { code, itemTotal, shippingFee = 0, donationAmount = 0, storeId } = req.body;
    const userId = req.user._id;

    // Calculate order total
    const orderTotal = (itemTotal || 0) + (shippingFee || 0) + (donationAmount || 0);

    // First validate the coupon (using itemTotal for minOrderValue check)
    const validateResult = await validateCouponInternal(code, orderTotal, userId, storeId, itemTotal);
    if (!validateResult.isValid) {
      return res.status(400).json(
        errorResponse(validateResult.message)
      );
    }

    const { coupon, discountAmount } = validateResult;
    const finalAmount = Math.max(0, orderTotal - discountAmount);

    return res.status(200).json(
      successResponse({
        discountAmount: discountAmount,
        finalAmount: finalAmount
      }, 'Coupon applied successfully')
    );
  } catch (error) {
    console.error('Error applying coupon:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Internal function to validate coupon (used by applyCoupon)
const validateCouponInternal = async (code, orderTotal, userId, storeId = null, itemTotal = null) => {
  const now = new Date();

  // Build query for coupon
  let query = {
    code: code.toUpperCase(),
    deleted: { $ne: true },
    validFrom: { $lte: now },
    validUntil: { $gte: now }
  };

  // If storeId is provided, check if coupon is applicable to this store
  if (storeId && storeId.trim() !== '') {
    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return { isValid: false, message: 'Invalid storeId format. Must be a valid ObjectId.' };
    }
    
    // Coupon can be either global (storeId: null) or specific to the provided store
    query.$or = [
      { storeId: null }, // Global coupon
      { storeId: new mongoose.Types.ObjectId(storeId) } // Store-specific coupon
    ];
  }

  const coupon = await CouponCode.findOne(query);

  if (!coupon) {
    return { isValid: false, message: 'Invalid or expired coupon code' };
  }

  // Additional check: if coupon is store-specific, ensure it matches the provided storeId
  if (coupon.storeId && storeId && coupon.storeId.toString() !== storeId) {
    return { isValid: false, message: 'Coupon is not applicable to this store' };
  }

  // Check usage limit
  if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
    return { isValid: false, message: 'Coupon usage limit reached' };
  }

  // Check minimum order value - use itemTotal (without shipping/donation) for this check
  const checkTotal = itemTotal !== null ? itemTotal : orderTotal;
  if (checkTotal < coupon.minOrderValue) {
    return { isValid: false, message: `Minimum order value of ₹${coupon.minOrderValue} required for this coupon` };
  }

  // Check if user has already used "one time use" coupon
  if (coupon.use === 'one') {
    const userCouponHistory = await CouponHistory.findOne({
      couponId: coupon._id,
      userId: userId
    });

    if (userCouponHistory) {
      return { isValid: false, message: 'Coupon already used by you' };
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.discountType === 'flat') {
    discountAmount = Math.min(coupon.discountValue, orderTotal);
  } else if (coupon.discountType === 'percentage') {
    discountAmount = (orderTotal * coupon.discountValue) / 100;
    if (coupon.maxDiscountAmount) {
      discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
    }
  }

  discountAmount = Math.min(discountAmount, orderTotal); // Ensure discount doesn't exceed order total

  return { isValid: true, coupon, discountAmount };
};

// Calculate complete bill summary
export const calculateBillSummary = (itemTotal, discountAmount = 0, donationAmount = 0, shippingFee = 0) => {
  const totalPayable = itemTotal - discountAmount + donationAmount + shippingFee;
  
  return {
    itemTotal: parseFloat(itemTotal.toFixed(2)),
    donationAmount: parseFloat(donationAmount.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    shippingFee: parseFloat(shippingFee.toFixed(2)),
    totalPayable: parseFloat(Math.max(0, totalPayable).toFixed(2)),
    saved: parseFloat(discountAmount.toFixed(2)) // How much user saved
  };
};

// Update coupon
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const coupon = await CouponCode.findById(id);
    if (!coupon) {
      return res.status(404).json(
        errorResponse('Coupon not found')
      );
    }

    // Check if user is authorized to update this coupon
    if (req.user.role === 'admin') {
      // Admin can update any coupon
    } else if (req.user.role === coupon.ownerType && req.user._id.toString() === coupon.ownerId.toString()) {
      // Owner can update their own coupon
    } else {
      return res.status(403).json(
        errorResponse('Unauthorized to update this coupon')
      );
    }

    // Update allowed fields
    const allowedUpdates = [
      'name', 'description', 'discountType', 'discountValue', 'use', 
      'minOrderValue', 'maxDiscountAmount', 'validFrom', 'validUntil', 
      'usageLimit', 'userEligibility', 'storeId'
    ];

    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        coupon[field] = updateData[field];
      }
    });

    await coupon.save();

    return res.status(200).json(
      successResponse({
        _id: coupon._id,
        name: coupon.name,
        code: coupon.code,
        description: coupon.description
      }, 'Coupon updated successfully')
    );
  } catch (error) {
    console.error('Error updating coupon:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Remove specific coupon from cart/order (reset coupon application)
export const removeCoupon = async (req, res) => {
  try {
    // This endpoint is used to remove a specific coupon from cart/checkout
    // It doesn't delete the coupon code itself, but removes it from current session/cart
    
    // Get coupon ID from request body
    const couponId = req.body.couponId;
    
    // If coupon ID is provided, validate it exists
    if (couponId) {
      const coupon = await CouponCode.findById(couponId);
      if (!coupon) {
        return res.status(404).json(
          errorResponse('Coupon not found')
        );
      }
      
      // Check if coupon belongs to the same user/owner for security
      if (req.user.role !== 'admin' && 
          coupon.ownerType === req.user.role && 
          coupon.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json(
          errorResponse('Unauthorized to access this coupon')
        );
      }
    }
    
    // Return a success response with empty coupon data
    return res.status(200).json(
      successResponse({
        couponCode: null,
        discountAmount: 0,
        removedCouponId: couponId || null,
        message: 'Coupon removed successfully'
      }, 'Coupon removed from cart')
    );
  } catch (error) {
    console.error('Error removing coupon:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Delete coupon
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json(
        errorResponse('Invalid coupon ID format')
      );
    }

    const coupon = await CouponCode.findById(id);
    if (!coupon) {
      return res.status(404).json(
        errorResponse('Coupon not found')
      );
    }

    if (coupon.deleted) {
      return res.status(404).json(
        errorResponse('Coupon already deleted')
      );
    }

    // Check if user is authorized to delete this coupon
    const userRole = req.user.role;
    const userId = req.user._id.toString();
    const couponOwnerId = coupon.ownerId ? coupon.ownerId.toString() : null;
    const couponOwnerType = coupon.ownerType;

    // Admin can delete any coupon
    if (userRole === 'admin') {
      // Allow deletion
    } 
    // Owner can delete their own coupon (seller/retailer)
    else if (userRole === couponOwnerType && userId === couponOwnerId) {
      // Allow deletion
    } 
    // Unauthorized
    else {
      console.log('Delete authorization failed:', {
        userRole,
        userId,
        couponOwnerType,
        couponOwnerId
      });
      return res.status(403).json(
        errorResponse('Unauthorized to delete this coupon. You can only delete coupons you created.')
      );
    }

    // Soft delete by setting deleted flag
    coupon.deleted = true;
    await coupon.save();

    return res.status(200).json(
      successResponse(null, 'Coupon deleted successfully')
    );
  } catch (error) {
    console.error('Error deleting coupon:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};
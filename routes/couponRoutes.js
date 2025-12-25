import express from 'express';
import { 
  createCoupon, 
  getCoupons, 
  getValidCoupons, 
  getApplicableCoupons,
  getCouponsByStore,
  validateCoupon, 
  applyCoupon, 
  removeCoupon,
  updateCoupon, 
  deleteCoupon 
} from '../controllers/couponController.js';
import { authenticateToken } from '../middlewares/middleware.js';

const router = express.Router();

// Create coupon (admin, seller, retailer)
router.post('/', authenticateToken, createCoupon);

// Get coupons (admin, seller, retailer - own coupons)
router.get('/', authenticateToken, getCoupons);

// Get valid coupons for user (authenticated users)
router.get('/valid', authenticateToken, getValidCoupons);

// Get all applicable coupons for user (global + store-specific)
router.get('/available', authenticateToken, getApplicableCoupons);

// Get coupons by store
router.get('/store/:storeId', authenticateToken, getCouponsByStore);

// Validate coupon (authenticated users)
router.post('/validate', authenticateToken, validateCoupon);

// Apply coupon to calculate summary (authenticated users)
router.post('/apply', authenticateToken, applyCoupon);

// Remove specific coupon from cart/checkout session (by ID in request body)
router.post('/remove', authenticateToken, removeCoupon);

// Handle DELETE requests to /remove specifically to avoid conflict with /:id
router.delete('/remove', authenticateToken, (req, res) => {
  res.status(405).json({ message: 'DELETE method not allowed for /remove. Use POST with couponId in body.' });
});



// Update coupon (admin, owner)
router.put('/:id', authenticateToken, updateCoupon);

// Delete coupon (admin, owner)
router.delete('/:id', authenticateToken, deleteCoupon);

export default router;
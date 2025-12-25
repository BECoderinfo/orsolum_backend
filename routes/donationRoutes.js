import express from 'express';
import { getDonationSettings, updateDonationSettings, validateCustomDonationAmount } from '../controllers/donationController.js';
import { adminAuthentication, authenticateToken } from '../middlewares/middleware.js';

const router = express.Router();

// Get donation settings (authenticated users - for sellers/retailers to see donation options)
router.get('/settings', authenticateToken, getDonationSettings);

// Update donation settings (admin only)
router.put('/settings', adminAuthentication, updateDonationSettings);

// Validate custom donation amount (for 'Other' option)
router.post('/validate-custom-amount', authenticateToken, validateCustomDonationAmount);

export default router;
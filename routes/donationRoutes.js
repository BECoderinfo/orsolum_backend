import express from 'express';
import { getDonationSettings, updateDonationSettings, validateCustomDonationAmount } from '../controllers/donationController.js';
import { adminAuthentication, authenticateToken } from '../middlewares/middleware.js';

const router = express.Router();

// Get donation settings (authenticated users - for sellers/retailers to see donation options)
router.get('/settings/v1', authenticateToken, getDonationSettings);

// Update donation settings (admin only)
router.put('/settings/v1', adminAuthentication, updateDonationSettings);

// Validate custom donation amount (for 'Other' option)
router.post('/validate-custom-amount/v1', authenticateToken, validateCustomDonationAmount);

export default router;
// orsolum_backend/routes/pickupAddressRouter.js
import express from 'express';
import {
    addPickupAddress,
    getStorePickupAddresses,
    updatePickupAddress,
    deletePickupAddress,
    setPrimaryPickupAddress,
    bulkUpdatePickupAddresses
} from '../controllers/pickupAddressController.js';
import { sellerAuthentication } from '../middlewares/middleware.js';

const router = express.Router();
// Custom middleware for multiple roles
const sellerOrRetailerAuth = (req, res, next) => {
    // Try seller authentication first
    sellerAuthentication(req, res, (err) => {
        if (err) {
            // If seller auth fails, try retailer auth
            retailerAuthentication(req, res, next);
        } else {
            next();
        }
    });
};
// Apply seller authentication to all routes
router.use(sellerAuthentication);

// ✅ Add new pickup address
router.post('/add', addPickupAddress);

// ✅ Get all pickup addresses for a store
router.get('/store/:storeId', getStorePickupAddresses);

// ✅ Update pickup address
router.put('/:pickupAddressId', updatePickupAddress);

// ✅ Delete pickup address
router.delete('/:pickupAddressId', deletePickupAddress);

// ✅ Set primary pickup address
router.patch('/:pickupAddressId/set-primary', setPrimaryPickupAddress);

// ✅ Bulk operations
router.patch('/bulk-update', bulkUpdatePickupAddresses);

export default router;
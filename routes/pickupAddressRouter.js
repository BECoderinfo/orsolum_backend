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
import { retailerAuthentication } from '../middlewares/middleware.js';

const router = express.Router();
// Apply seller/retailer authentication (retailer auth accepts both roles)
router.use(retailerAuthentication);

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
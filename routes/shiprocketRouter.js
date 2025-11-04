import express from 'express';
import {
  checkServiceability,
  createOrder,
  generateAWB,
  requestPickup,
  trackByAwb,
  trackByShipmentId,
  generateLabel,
  generateInvoice,
  generateManifest,
  printManifest,
  cancelShipment,
  getChannels,
  getPickupLocations,
  shiprocketLogin,
  shiprocketStatus,
  shiprocketHealth,
  webhookTracking,
  createStorePickupAddress,
  bulkCreateStorePickupAddresses,
  updateStorePickupAddress,
  deleteStorePickupAddress,
  getPickupAddressStatus,
  syncOrdersWithShiprocket,
  getOrdersWithShiprocketStatus,
  bulkSyncOrders
} from '../controllers/shiprocketController.js';

const router = express.Router();

/* ------------------------- Shiprocket APIs ------------------------- */

// ✅ Check serviceability
router.get('/serviceability', checkServiceability);

// ✅ Create order
router.post('/orders', createOrder);

// ✅ Generate AWB
router.post('/awb', generateAWB);

// ✅ Request pickup
router.post('/pickup', requestPickup);

// ✅ Track shipment
router.get('/track/awb/:awb', trackByAwb);
router.get('/track/shipment/:shipmentId', trackByShipmentId);

// ✅ Labels, Invoices, Manifests
router.get('/label/:shipmentId', generateLabel);
router.get('/invoice/:shipmentId', generateInvoice);
router.get('/manifest/:shipmentId', generateManifest);
router.get('/manifest/print/:shipmentId', printManifest);

// ✅ Cancel shipment
router.post('/cancel', cancelShipment);

// ✅ Get channels and pickup locations
router.get('/channels', getChannels);
router.get('/pickup-locations', getPickupLocations);

// ✅ Auth / diagnostics
router.post('/auth/login', shiprocketLogin);
router.get('/auth/status', shiprocketStatus);
router.get('/health', shiprocketHealth);

// ✅ Webhook for shipment tracking
router.post('/webhook/tracking', webhookTracking);

/* ------------------------- Store Pickup APIs ------------------------- */

// ✅ Create pickup address for a store
router.post('/store/pickup-address/create', createStorePickupAddress);

// ✅ Bulk pickup creation for multiple stores
router.post('/store/pickup-address/bulk-create', bulkCreateStorePickupAddresses);

// ✅ Update a store’s pickup address
router.put('/store/pickup-address/update', updateStorePickupAddress);

// ✅ Delete a store’s pickup address
router.delete('/store/pickup-address/:storeId', deleteStorePickupAddress);

// ✅ Get pickup address status
router.get('/pickup-address/status', getPickupAddressStatus);

router.post('/sync-orders', syncOrdersWithShiprocket);
router.get('/orders-status', getOrdersWithShiprocketStatus);
router.post('/bulk-sync-orders', bulkSyncOrders);

export default router;

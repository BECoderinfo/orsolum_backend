import shiprocketClient from './shiprocketClient.js';

const ShiprocketService = {
  // ✅ Check serviceability
  async checkServiceability(payload) {
    return shiprocketClient.request({
      method: 'GET',
      url: '/courier/serviceability/',
      params: payload,
    });
  },

  // ✅ Create order
  async createOrder(orderPayload) {
    return shiprocketClient.request({
      method: 'POST',
      url: '/orders/create/adhoc',
      data: orderPayload,
    });
  },

  // ✅ Generate AWB
  async generateAWB({ shipment_id, courier_id }) {
    return shiprocketClient.request({
      method: 'POST',
      url: '/courier/assign/awb',
      data: { shipment_id, courier_id },
    });
  },

  // ✅ Request pickup
  async requestPickup({ shipment_id }) {
    return shiprocketClient.request({
      method: 'POST',
      url: '/courier/generate/pickup',
      data: { shipment_id: [shipment_id] },
    });
  },

  // ✅ Tracking
  async trackByAwb(awb) {
    return shiprocketClient.request({
      method: 'GET',
      url: `/courier/track/awb/${awb}`,
    });
  },

  async trackByShipmentId(shipmentId) {
    return shiprocketClient.request({
      method: 'GET',
      url: `/courier/track/shipment/${shipmentId}`,
    });
  },

  // ✅ Labels / invoice / manifest
  async label(shipmentId) {
    return shiprocketClient.request({
      method: 'POST',
      url: '/courier/generate/label',
      data: { shipment_id: [shipmentId] },
    });
  },

  async invoice(shipmentId) {
    return shiprocketClient.request({
      method: 'POST',
      url: '/courier/generate/invoice',
      data: { shipment_id: [shipmentId] },
    });
  },

  async manifest(shipmentId) {
    return shiprocketClient.request({
      method: 'POST',
      url: '/courier/generate/manifest',
      data: { shipment_id: [shipmentId] },
    });
  },

  async printManifest(shipmentId) {
    return shiprocketClient.request({
      method: 'POST',
      url: '/courier/print/manifest',
      data: { shipment_id: [shipmentId] },
    });
  },

  // ✅ Cancel shipment
  async cancel({ awb }) {
    return shiprocketClient.request({
      method: 'POST',
      url: '/orders/cancel/shipment/awbs',
      data: { awb: [awb] },
    });
  },

  // ✅ Courier list
  async getChannels() {
    return shiprocketClient.request({
      method: 'GET',
      url: '/courier/courierListWithCounts',
    });
  },

  // ✅ Pickup Locations (corrected)
  async getPickupLocations() {
    return shiprocketClient.request({
      method: 'GET',
      url: '/settings/company/pickup',
    });
  },

  async createPickupAddress(payload) {
    return shiprocketClient.request({
      method: 'POST',
      url: '/settings/company/addpickup',
      data: payload,
    });
  },

  async updatePickupAddress(pickupId, payload) {
    return shiprocketClient.request({
      method: 'PUT',
      url: `/settings/company/updatepickup/${pickupId}`,
      data: payload,
    });
  },

  async getPickupAddressById(pickupId) {
    return shiprocketClient.request({
      method: 'GET',
      url: `/settings/company/pickup/${pickupId}`,
    });
  },

  async deletePickupAddress(pickupId) {
    return shiprocketClient.request({
      method: 'DELETE',
      url: `/settings/company/deletepickup/${pickupId}`,
    });
  },

  // ✅ Multi-store bulk creation
  async bulkCreatePickupAddresses(storesData) {
    const results = [];
    const errors = [];

    for (const store of storesData) {
      try {
        const result = await this.createPickupAddress(store);
        results.push({ storeId: store.storeId, pickupId: result?.data?.id, success: true });
      } catch (err) {
        errors.push({ storeId: store.storeId, error: err.message, success: false });
      }
    }

    return { successful: results, failed: errors };
  },

  async createOrderWithStorePickup(orderPayload, storePickupId) {
    const orderWithPickup = {
      ...orderPayload,
      pickup_location: storePickupId,
    };

    return shiprocketClient.request({
      method: 'POST',
      url: '/orders/create/adhoc',
      data: orderWithPickup,
    });
  },

  async getAllPickupLocationsPaginated(page = 1, limit = 100) {
    return shiprocketClient.request({
      method: 'GET',
      url: '/settings/company/pickup',
      params: { page, limit },
    });
  },
};

export default ShiprocketService;

import ShiprocketService from '../helper/shiprocketService.js';
import { jsonStatus, status, apiResponse } from '../helper/api.responses.js';
import mongoose from 'mongoose';
import shiprocketClient from '../helper/shiprocketClient.js';

// Lazy-load models (avoids circular imports)
const getStoreModel = async () => (await import('../models/Store.js')).default;
const getOrderModel = async () => (await import('../models/Order.js')).default;

/* -------------------------- Helper Functions -------------------------- */

// Generate default email if missing
const generateEmail = (name = '', phone = '') =>
  `${(name || phone || 'user').toLowerCase().replace(/\s+/g, '')}@orsolum.com`;

// Build pickup payload for Shiprocket
const buildPickupPayload = (store) => ({
  pickup_location: store.name?.replace(/\s+/g, '_').toLowerCase(),
  name: store.ownerName || store.name,
  email: store.email || generateEmail(store.name, store.phone),
  phone: store.phone,
  address: store.address,
  address_2: store.address2 || '',
  city: store.city,
  state: store.state,
  country: 'India',
  pin_code: store.pincode,
});

// Build order payload
const buildOrderPayload = (order, storePickupId) => ({
  order_id: order._id,
  order_date: new Date().toISOString(),
  pickup_location: storePickupId,
  channel_id: '',
  comment: 'Auto-created order via API',
  billing_customer_name: order.customer_name,
  billing_last_name: '',
  billing_address: order.address,
  billing_city: order.city,
  billing_pincode: order.pincode,
  billing_state: order.state,
  billing_country: 'India',
  billing_email: order.email,
  billing_phone: order.phone,
  shipping_is_billing: true,
  order_items: order.items.map(item => ({
    name: item.name,
    sku: item.sku,
    units: item.quantity,
    selling_price: item.price,
  })),
  payment_method: order.payment_method || 'Prepaid',
  sub_total: order.total,
  length: 15,
  breadth: 10,
  height: 5,
  weight: 0.5,
});

/* ----------------------------- Controllers ---------------------------- */

// ✅ Check serviceability
export const checkServiceability = async (req, res) => {
  try {
    const response = await ShiprocketService.checkServiceability(req.query);
    return res.json(apiResponse(true, 'Serviceability data fetched', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Create order
export const createOrder = async (req, res) => {
  try {
    const orderPayload = req.body;
    const response = await ShiprocketService.createOrder(orderPayload);
    return res.json(apiResponse(true, 'Order created successfully', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Generate AWB
export const generateAWB = async (req, res) => {
  try {
    const response = await ShiprocketService.generateAWB(req.body);
    return res.json(apiResponse(true, 'AWB generated successfully', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Request pickup
export const requestPickup = async (req, res) => {
  try {
    const response = await ShiprocketService.requestPickup(req.body);
    return res.json(apiResponse(true, 'Pickup requested', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Tracking
export const trackByAwb = async (req, res) => {
  try {
    const response = await ShiprocketService.trackByAwb(req.params.awb);
    return res.json(apiResponse(true, 'Tracking data fetched', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

export const trackByShipmentId = async (req, res) => {
  try {
    const response = await ShiprocketService.trackByShipmentId(req.params.shipmentId);
    return res.json(apiResponse(true, 'Shipment tracking data fetched', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Labels, Invoice, Manifest
export const generateLabel = async (req, res) => {
  try {
    const response = await ShiprocketService.label(req.params.shipmentId);
    return res.json(apiResponse(true, 'Label generated', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

export const generateInvoice = async (req, res) => {
  try {
    const response = await ShiprocketService.invoice(req.params.shipmentId);
    return res.json(apiResponse(true, 'Invoice generated', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

export const generateManifest = async (req, res) => {
  try {
    const response = await ShiprocketService.manifest(req.params.shipmentId);
    return res.json(apiResponse(true, 'Manifest generated', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Print manifest
export const printManifest = async (req, res) => {
  try {
    const response = await ShiprocketService.printManifest(req.params.shipmentId);
    return res.json(apiResponse(true, 'Manifest printed', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Cancel shipment
export const cancelShipment = async (req, res) => {
  try {
    const response = await ShiprocketService.cancel(req.body);
    return res.json(apiResponse(true, 'Shipment cancelled', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Get channels
export const getChannels = async (req, res) => {
  try {
    const response = await ShiprocketService.getChannels();
    return res.json(apiResponse(true, 'Channels fetched', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Get pickup locations
export const getPickupLocations = async (req, res) => {
  try {
    const response = await ShiprocketService.getPickupLocations();
    return res.json(apiResponse(true, 'Pickup locations fetched', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Auto-create Shiprocket pickup on store creation
export const createStorePickupAddress = async (req, res) => {
  try {
    const { storeId } = req.body;
    const Store = await getStoreModel();
    const store = await Store.findById(storeId);

    if (!store) return res.status(404).json(apiResponse(false, 'Store not found'));

    const pickupPayload = buildPickupPayload(store);
    const response = await ShiprocketService.createPickupAddress(pickupPayload);

    store.shiprocketPickupId = response?.data?.id || null;
    await store.save();

    return res.json(apiResponse(true, 'Pickup address created', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Bulk pickup creation
export const bulkCreateStorePickupAddresses = async (req, res) => {
  try {
    const { stores } = req.body;
    const Store = await getStoreModel();

    const responses = await Promise.allSettled(
      stores.map(async (s) => {
        const store = await Store.findById(s.storeId);
        if (!store) throw new Error('Store not found');
        const payload = buildPickupPayload(store);
        const r = await ShiprocketService.createPickupAddress(payload);
        store.shiprocketPickupId = r?.data?.id || null;
        await store.save();
        return { storeId: s.storeId, success: true };
      })
    );

    return res.json(apiResponse(true, 'Bulk pickup creation completed', responses));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Update pickup address
export const updateStorePickupAddress = async (req, res) => {
  try {
    const { pickupId, data } = req.body;
    const response = await ShiprocketService.updatePickupAddress(pickupId, data);
    return res.json(apiResponse(true, 'Pickup address updated', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Delete pickup address
export const deleteStorePickupAddress = async (req, res) => {
  try {
    const { storeId } = req.params;
    const Store = await getStoreModel();
    const store = await Store.findById(storeId);

    if (!store) return res.status(404).json(apiResponse(false, 'Store not found'));

    if (!store.shiprocketPickupId)
      return res.status(400).json(apiResponse(false, 'Store has no Shiprocket pickup ID'));

    const response = await ShiprocketService.deletePickupAddress(store.shiprocketPickupId);
    store.shiprocketPickupId = null;
    await store.save();

    return res.json(apiResponse(true, 'Pickup address deleted', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Bulk delete pickup addresses from Shiprocket
export const bulkDeletePickupAddresses = async (req, res) => {
  try {
    const { pickupIds } = req.body;
    console.log("Deleting pickup ID:", pickupIds);


    if (!pickupIds || !Array.isArray(pickupIds) || pickupIds.length === 0) {
      return res.status(400).json({ success: false, message: "pickupIds must be a non-empty array" });
    }

    const Store = (await import('../models/Store.js')).default;

    const results = [];

    for (const id of pickupIds) {
      try {
        const store = await Store.findOne({ shiprocketPickupId: id });
        const response = await ShiprocketService.deletePickupAddress(id);

        if (store) {
          store.shiprocketPickupId = null;
          await store.save();
        }

        results.push({
          id,
          status: "deleted",
          response,
          storeUpdated: !!store
        });
      } catch (err) {
        results.push({ id, status: "failed", error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Bulk delete completed",
      results
    });

  } catch (err) {
    console.error("Bulk delete error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};



// ✅ Get pickup address status
export const getPickupAddressStatus = async (req, res) => {
  try {
    const response = await ShiprocketService.getPickupLocations();
    return res.json(apiResponse(true, 'Pickup address status fetched', response));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Webhook (shipment updates)
export const webhookTracking = async (req, res) => {
  try {
    // Token verification
    const receivedToken = req.headers['x-api-key'];
    const expectedToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
    
    if (!expectedToken) {
      console.warn('⚠️ SHIPROCKET_WEBHOOK_TOKEN not configured in .env');
      // Continue without verification for now (optional)
    } else if (receivedToken !== expectedToken) {
      console.error('❌ Webhook token mismatch');
      return res.status(401).json(apiResponse(false, 'Unauthorized: Invalid token'));
    }
    
    const payload = req.body;
    const Order = await getOrderModel();

    if (payload?.awb && payload?.current_status) {
      await Order.findOneAndUpdate(
        { awb: payload.awb },
        { shiprocket_status: payload.current_status },
        { new: true }
      );
    }

    return res.json(apiResponse(true, 'Webhook received', payload));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Shiprocket login (token generation)
export const shiprocketLogin = async (req, res) => {
  try {
    const token = await shiprocketClient.login();
    const { expiresAt, expiresInMs } = shiprocketClient.getStatus();
    return res.json(apiResponse(true, 'Shiprocket login successful', { token, expiresAt, expiresInMs }));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Shiprocket status (diagnostics)
export const shiprocketStatus = async (req, res) => {
  try {
    const statusInfo = shiprocketClient.getStatus();
    return res.json(apiResponse(true, 'Shiprocket status', statusInfo));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message));
  }
};

// ✅ Shiprocket health (connectivity)
export const shiprocketHealth = async (req, res) => {
  try {
    const data = await ShiprocketService.getChannels();
    return res.json(apiResponse(true, 'Shiprocket reachable', { ok: true, sample: data }));
  } catch (err) {
    return res.status(500).json(apiResponse(false, err.message, { ok: false }));
  }
};


// Auto-sync orders with Shiprocket
export const syncOrdersWithShiprocket = async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds)) {
      return res.status(400).json(apiResponse(false, 'Order IDs array is required', null));
    }

    // Import required models
    const Order = (await import('../models/Order.js')).default;
    const Store = (await import('../models/Store.js')).default;

    const results = [];

    for (const orderId of orderIds) {
      try {
        const order = await Order.findById(orderId).populate('storeId').populate('createdBy');
        if (!order) {
          results.push({
            orderId,
            success: false,
            error: "Order not found"
          });
          continue;
        }

        // Check if already synced
        if (order.shiprocket?.shipment_id) {
          results.push({
            orderId,
            success: false,
            error: "Order already synced with Shiprocket"
          });
          continue;
        }

        // Check store pickup configuration
        if (!order.storeId.shiprocket?.pickup_address_id) {
          results.push({
            orderId,
            success: false,
            error: "Store pickup address not configured"
          });
          continue;
        }

        // Prepare Shiprocket payload
        const shiprocketPayload = {
          order_id: order.orderId,
          order_date: order.createdAt.toISOString().split('T')[0],
          pickup_location: order.storeId.shiprocket.pickup_address_id,
          
          billing_customer_name: `${order.createdBy.firstName} ${order.createdBy.lastName}`,
          billing_address: order.address.address_1,
          billing_address_2: order.address.flatHouse || '',
          billing_city: order.address.city,
          billing_pincode: order.address.pincode,
          billing_state: order.address.state,
          billing_email: order.createdBy.email || `${order.createdBy.phone}@orsolum.com`,
          billing_phone: order.createdBy.phone,
          
          shipping_customer_name: `${order.createdBy.firstName} ${order.createdBy.lastName}`,
          shipping_address: order.address.address_1,
          shipping_address_2: order.address.flatHouse || '',
          shipping_city: order.address.city,
          shipping_pincode: order.address.pincode,
          shipping_state: order.address.state,
          shipping_email: order.createdBy.email || `${order.createdBy.phone}@orsolum.com`,
          shipping_phone: order.createdBy.phone,
          
          payment_method: order.paymentStatus === "SUCCESS" ? "Prepaid" : "COD",
          sub_total: order.summary.totalAmount,
          length: 15,
          breadth: 10,
          height: 5,
          weight: 0.5,
          
          order_items: order.productDetails.map(item => ({
            name: item.productId?.productName || "Product",
            sku: item.productId?.toString() || item._id.toString(),
            units: item.quantity,
            selling_price: item.productPrice
          }))
        };

        // Create Shiprocket order
        const shiprocketResponse = await ShiprocketService.createOrder(shiprocketPayload);
        
        if (shiprocketResponse.data) {
          // Update order with Shiprocket details
          await Order.findByIdAndUpdate(orderId, {
            shiprocket: {
              shipment_id: shiprocketResponse.data.shipment_id,
              awb: shiprocketResponse.data.awb_code,
              status: 'created',
              last_updated: new Date()
            },
            status: "Product shipped"
          });

          results.push({
            orderId,
            success: true,
            shipment_id: shiprocketResponse.data.shipment_id,
            awb: shiprocketResponse.data.awb_code
          });
        } else {
          results.push({
            orderId,
            success: false,
            error: "Failed to create Shiprocket order"
          });
        }

      } catch (error) {
        console.error(`Sync error for order ${orderId}:`, error);
        results.push({
          orderId,
          success: false,
          error: error.message
        });
      }
    }

    return res.status(200).json(apiResponse(true, 'Orders synced with Shiprocket', {
      results,
      summary: {
        total: orderIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    }));

  } catch (error) {
    console.error('Sync orders with Shiprocket error:', error);
    return res.status(500).json(apiResponse(false, error.message, null));
  }
};

// Get all orders with Shiprocket status
export const getOrdersWithShiprocketStatus = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, storeId } = req.query;

    // Import Order model
    const Order = (await import('../models/Order.js')).default;

    const skip = (page - 1) * limit;
    const filter = {};

    if (status) filter.status = status;
    if (storeId) filter.storeId = storeId;

    const orders = await Order.find(filter)
      .populate('createdBy', 'firstName lastName phone email')
      .populate('storeId', 'name shiprocket.pickup_address_id')
      .populate('productDetails.productId', 'productName sellingPrice')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const ordersWithShiprocket = orders.map(order => ({
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      customer: {
        name: `${order.createdBy.firstName} ${order.createdBy.lastName}`,
        phone: order.createdBy.phone,
        email: order.createdBy.email
      },
      store: {
        name: order.storeId.name,
        pickup_configured: !!(order.storeId.shiprocket?.pickup_address_id)
      },
      totalAmount: order.summary.grandTotal,
      shiprocket: {
        synced: !!(order.shiprocket?.shipment_id),
        shipment_id: order.shiprocket?.shipment_id || null,
        awb: order.shiprocket?.awb || null,
        status: order.shiprocket?.status || null,
        last_updated: order.shiprocket?.last_updated || null
      },
      createdAt: order.createdAt,
      estimatedDate: order.estimatedDate
    }));

    const totalOrders = await Order.countDocuments(filter);
    const syncedOrders = await Order.countDocuments({
      ...filter,
      'shiprocket.shipment_id': { $exists: true, $ne: null }
    });

    return res.status(200).json(apiResponse(true, 'Orders with Shiprocket status retrieved', {
      orders: ordersWithShiprocket,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalOrders,
        totalPages: Math.ceil(totalOrders / limit)
      },
      summary: {
        total_orders: totalOrders,
        synced_orders: syncedOrders,
        pending_sync: totalOrders - syncedOrders,
        sync_percentage: totalOrders > 0 ? Math.round((syncedOrders / totalOrders) * 100) : 0
      }
    }));

  } catch (error) {
    console.error('Get orders with Shiprocket status error:', error);
    return res.status(500).json(apiResponse(false, error.message, null));
  }
};

// Bulk sync orders
export const bulkSyncOrders = async (req, res) => {
  try {
    const { filters = {} } = req.body;

    // Import Order model
    const Order = (await import('../models/Order.js')).default;

    // Find orders that need syncing
    const query = {
      status: { $in: ["Pending", "Accepted", "Product shipped"] },
      'shiprocket.shipment_id': { $exists: false }
    };

    if (filters.storeId) query.storeId = filters.storeId;
    if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
    if (filters.dateFrom) query.createdAt = { $gte: new Date(filters.dateFrom) };
    if (filters.dateTo) query.createdAt = { ...query.createdAt, $lte: new Date(filters.dateTo) };

    const ordersToSync = await Order.find(query)
      .populate('storeId')
      .populate('createdBy')
      .limit(filters.limit || 100);

    if (ordersToSync.length === 0) {
      return res.status(200).json(apiResponse(true, 'No orders found for syncing', {
        total: 0,
        synced: 0,
        failed: 0
      }));
    }

    const results = [];

    for (const order of ordersToSync) {
      try {
        // Check store pickup configuration
        if (!order.storeId.shiprocket?.pickup_address_id) {
          results.push({
            orderId: order._id,
            success: false,
            error: "Store pickup address not configured"
          });
          continue;
        }

        // Prepare and create Shiprocket order
        const shiprocketPayload = {
          order_id: order.orderId,
          order_date: order.createdAt.toISOString().split('T')[0],
          pickup_location: order.storeId.shiprocket.pickup_address_id,
          
          billing_customer_name: `${order.createdBy.firstName} ${order.createdBy.lastName}`,
          billing_address: order.address.address_1,
          billing_address_2: order.address.flatHouse || '',
          billing_city: order.address.city,
          billing_pincode: order.address.pincode,
          billing_state: order.address.state,
          billing_email: order.createdBy.email || `${order.createdBy.phone}@orsolum.com`,
          billing_phone: order.createdBy.phone,
          
          shipping_customer_name: `${order.createdBy.firstName} ${order.createdBy.lastName}`,
          shipping_address: order.address.address_1,
          shipping_address_2: order.address.flatHouse || '',
          shipping_city: order.address.city,
          shipping_pincode: order.address.pincode,
          shipping_state: order.address.state,
          shipping_email: order.createdBy.email || `${order.createdBy.phone}@orsolum.com`,
          shipping_phone: order.createdBy.phone,
          
          payment_method: order.paymentStatus === "SUCCESS" ? "Prepaid" : "COD",
          sub_total: order.summary.totalAmount,
          length: 15,
          breadth: 10,
          height: 5,
          weight: 0.5,
          
          order_items: order.productDetails.map(item => ({
            name: item.productId?.productName || "Product",
            sku: item.productId?.toString() || item._id.toString(),
            units: item.quantity,
            selling_price: item.productPrice
          }))
        };

        const shiprocketResponse = await ShiprocketService.createOrder(shiprocketPayload);
        
        if (shiprocketResponse.data) {
          // Update order
          await Order.findByIdAndUpdate(order._id, {
            shiprocket: {
              shipment_id: shiprocketResponse.data.shipment_id,
              awb: shiprocketResponse.data.awb_code,
              status: 'created',
              last_updated: new Date()
            },
            status: "Product shipped"
          });

          results.push({
            orderId: order._id,
            order_number: order.orderId,
            success: true,
            shipment_id: shiprocketResponse.data.shipment_id,
            awb: shiprocketResponse.data.awb_code
          });
        }

      } catch (error) {
        console.error(`Bulk sync error for order ${order._id}:`, error);
        results.push({
          orderId: order._id,
          order_number: order.orderId,
          success: false,
          error: error.message
        });
      }
    }

    return res.status(200).json(apiResponse(true, 'Bulk sync completed', {
      results,
      summary: {
        total: ordersToSync.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    }));

  } catch (error) {
    console.error('Bulk sync orders error:', error);
    return res.status(500).json(apiResponse(false, error.message, null));
  }
};
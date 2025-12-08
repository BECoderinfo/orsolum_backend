import Notification from '../models/Notification.js';
import { ObjectId } from 'mongoose';

/**
 * Send notification to all retailers
 */
export const sendNotificationToAllRetailers = async (notificationData) => {
  try {
    const notification = new Notification({
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type || 'info',
      image: notificationData.image,
      action: {
        label: notificationData.actionLabel,
        type: notificationData.actionType || 'none',
        value: notificationData.actionValue,
      },
      targetRoles: ['retailer'],
      targetUserIds: [], // Empty = all retailers
      meta: notificationData.meta || {},
      expiresAt: notificationData.expiresAt ? new Date(notificationData.expiresAt) : null,
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending notification to all retailers:', error);
    throw error;
  }
};

/**
 * Send notification to specific retailer
 */
export const sendNotificationToRetailer = async (retailerId, notificationData) => {
  try {
    const notification = new Notification({
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type || 'info',
      image: notificationData.image,
      action: {
        label: notificationData.actionLabel,
        type: notificationData.actionType || 'none',
        value: notificationData.actionValue,
      },
      targetRoles: ['retailer'],
      targetUserIds: [new ObjectId(retailerId)],
      meta: notificationData.meta || {},
      expiresAt: notificationData.expiresAt ? new Date(notificationData.expiresAt) : null,
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending notification to retailer:', error);
    throw error;
  }
};

/**
 * Product approved notification
 */
export const notifyProductApproved = async (retailerId, product) => {
  try {
    const notification = new Notification({
      title: 'Product Approved',
      message: `Your product '${product.productName}' has been approved and is now live.`,
      type: 'info',
      image: 'Notifications/product-approved.png',
      action: {
        label: 'View Product',
        type: 'screen',
        value: `/dashboard/products/view/${product._id}`,
      },
      targetRoles: ['retailer'],
      targetUserIds: [new ObjectId(retailerId)],
      meta: {
        priority: 'medium',
        category: 'product',
        productId: product._id.toString(),
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending product approved notification:', error);
    // Don't throw - notification failure shouldn't break the main flow
  }
};

/**
 * Product rejected notification
 */
export const notifyProductRejected = async (retailerId, product, reason = '') => {
  try {
    const notification = new Notification({
      title: 'Product Rejected',
      message: `Your product '${product.productName}' has been rejected. ${reason ? reason : 'Please check and update the details.'}`,
      type: 'alert',
      image: 'Notifications/product-rejected.png',
      action: {
        label: 'Edit Product',
        type: 'screen',
        value: `/dashboard/products/edit/${product._id}`,
      },
      targetRoles: ['retailer'],
      targetUserIds: [new ObjectId(retailerId)],
      meta: {
        priority: 'high',
        category: 'product',
        productId: product._id.toString(),
        rejectionReason: reason,
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending product rejected notification:', error);
    // Don't throw - notification failure shouldn't break the main flow
  }
};

/**
 * New order notification
 */
export const notifyNewOrder = async (retailerId, order) => {
  try {
    const notification = new Notification({
      title: 'New Order Received',
      message: `You have received a new order ${order.orderId} worth ₹${order.summary?.grandTotal || order.summary?.totalAmount || 0}. Please process it soon.`,
      type: 'order',
      image: 'Notifications/new-order.png',
      action: {
        label: 'View Order',
        type: 'order',
        value: order._id.toString(),
      },
      targetRoles: ['retailer'],
      targetUserIds: [new ObjectId(retailerId)],
      meta: {
        priority: 'high',
        category: 'order',
        orderId: order._id.toString(),
        orderNumber: order.orderId,
        amount: order.summary?.grandTotal || order.summary?.totalAmount || 0,
        status: order.status || 'Pending',
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending new order notification:', error);
    // Don't throw - notification failure shouldn't break the main flow
  }
};

/**
 * Order status changed notification
 */
export const notifyOrderStatusChange = async (retailerId, order, newStatus) => {
  try {
    const statusMessages = {
      'Accepted': 'Order has been accepted. Please prepare for shipping.',
      'Product shipped': 'Order has been shipped and is on the way.',
      'On the way': 'Order is out for delivery.',
      'Your Destination': 'Order has reached the delivery location.',
      'Delivered': 'Order has been delivered successfully.',
      'Cancelled': 'Order has been cancelled.',
      'Rejected': 'Order has been rejected.',
    };

    const notification = new Notification({
      title: `Order ${newStatus}`,
      message: `Order ${order.orderId} status updated: ${statusMessages[newStatus] || newStatus}`,
      type: 'order',
      image: `Notifications/order-${newStatus.toLowerCase().replace(/\s+/g, '-')}.png`,
      action: {
        label: 'View Order',
        type: 'order',
        value: order._id.toString(),
      },
      targetRoles: ['retailer'],
      targetUserIds: [new ObjectId(retailerId)],
      meta: {
        priority: newStatus === 'Delivered' || newStatus === 'Cancelled' ? 'medium' : 'high',
        category: 'order',
        orderId: order._id.toString(),
        orderNumber: order.orderId,
        status: newStatus,
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending order status change notification:', error);
    // Don't throw - notification failure shouldn't break the main flow
  }
};

/**
 * Low stock notification
 */
export const notifyLowStock = async (retailerId, product, currentStock) => {
  try {
    const notification = new Notification({
      title: 'Low Stock Alert',
      message: `Your product '${product.productName}' is running low on stock. Current stock: ${currentStock} units.`,
      type: 'alert',
      image: 'Notifications/low-stock.png',
      action: {
        label: 'Update Stock',
        type: 'screen',
        value: `/dashboard/products/edit/${product._id}`,
      },
      targetRoles: ['retailer'],
      targetUserIds: [new ObjectId(retailerId)],
      meta: {
        priority: 'high',
        category: 'product',
        productId: product._id.toString(),
        currentStock,
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending low stock notification:', error);
    // Don't throw - notification failure shouldn't break the main flow
  }
};

/**
 * Delivery status notification (for retailer)
 */
export const notifyDeliveryStatus = async (retailerId, order, deliveryStatus) => {
  try {
    const statusMessages = {
      'On the way': `Order ${order.orderId} has been picked up and is out for delivery.`,
      'Your Destination': `Order ${order.orderId} has reached the customer location.`,
      'Delivered': `Order ${order.orderId} has been delivered successfully. Payment will be settled in next cycle.`,
    };

    const notification = new Notification({
      title: `Order ${deliveryStatus}`,
      message: statusMessages[deliveryStatus] || `Order ${order.orderId} delivery status: ${deliveryStatus}`,
      type: 'order',
      image: `Notifications/delivery-${deliveryStatus.toLowerCase().replace(/\s+/g, '-')}.png`,
      action: {
        label: 'View Order',
        type: 'order',
        value: order._id.toString(),
      },
      targetRoles: ['retailer'],
      targetUserIds: [new ObjectId(retailerId)],
      meta: {
        priority: deliveryStatus === 'Delivered' ? 'medium' : 'high',
        category: 'delivery',
        orderId: order._id.toString(),
        orderNumber: order.orderId,
        deliveryStatus,
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending delivery status notification:', error);
    // Don't throw - notification failure shouldn't break the main flow
  }
};

/**
 * Store offer notification (for retailer)
 */
export const notifyStoreOffer = async (retailerId, offer) => {
  try {
    const notification = new Notification({
      title: 'New Store Offer',
      message: `Your store offer '${offer.title}' has been created successfully.`,
      type: 'promo',
      image: 'Notifications/store-offer.png',
      action: {
        label: 'View Offer',
        type: 'screen',
        value: `/dashboard/offers/view/${offer._id}`,
      },
      targetRoles: ['retailer'],
      targetUserIds: [new ObjectId(retailerId)],
      meta: {
        priority: 'medium',
        category: 'offer',
        offerId: offer._id.toString(),
        offerType: offer.offerType,
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending store offer notification:', error);
  }
};

/**
 * Admin message notification (for retailer/user)
 */
export const notifyAdminMessage = async (userId, messageData) => {
  try {
    const notification = new Notification({
      title: messageData.title || 'Admin Message',
      message: messageData.message,
      type: messageData.type || 'info',
      image: messageData.image || 'Notifications/admin-message.png',
      action: {
        label: messageData.actionLabel || 'View',
        type: messageData.actionType || 'none',
        value: messageData.actionValue || '',
      },
      targetRoles: messageData.targetRoles || ['retailer', 'user'],
      targetUserIds: messageData.targetUserIds ? messageData.targetUserIds.map(id => new ObjectId(id)) : [],
      meta: {
        priority: messageData.priority || 'medium',
        category: 'admin',
        ...messageData.meta,
      },
      createdBy: messageData.adminId ? new ObjectId(messageData.adminId) : null,
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending admin message notification:', error);
  }
};

/**
 * New product added notification (for retailer)
 */
export const notifyNewProduct = async (retailerId, product) => {
  try {
    const notification = new Notification({
      title: 'New Product Added',
      message: `Your product '${product.productName}' has been added successfully and is pending approval.`,
      type: 'info',
      image: 'Notifications/new-product.png',
      action: {
        label: 'View Product',
        type: 'screen',
        value: `/dashboard/products/view/${product._id}`,
      },
      targetRoles: ['retailer'],
      targetUserIds: [new ObjectId(retailerId)],
      meta: {
        priority: 'medium',
        category: 'product',
        productId: product._id.toString(),
        status: 'pending',
      },
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error sending new product notification:', error);
  }
};
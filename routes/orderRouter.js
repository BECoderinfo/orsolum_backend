import express from "express";
import { addProductToCart, incrementProductQuantityInCart, decrementProductQuantityInCart, deleteProductFromCart, cartDetails, allCartDetails, couponCodeList, createAddress, editAddress, getAddress, getAllAddress, createOrder, cancelOrder, orderList, orderDetails, retailerOrderList, retailerPendingOrderList, retailerOrderHistoryList, retailerOrderDetails, orderChangeStatus, createOrderV2, orderListV2, orderDetailsV2, retailerOrderDetailsV2, paymentWebhookCall, getUserAllAddress, createOrderWithShiprocket, processPaymentAndUpdateShiprocket, retailerAssignedDeliveries, retailerAvailableDeliveryBoys, retailerAssignOrderToDeliveryBoy, retailerDeliveryBoyDashboard } from "../controllers/orderController.js";
import { retailerAuthentication, userAuthentication } from "../middlewares/middleware.js";
import { webhookTracking } from '../controllers/shiprocketController.js';
import { createSlotBooking, getUserSlotBookings } from "../controllers/slotBookingController.js";
const orderRouter = express.Router();

// cart
orderRouter.post('/add/product/in/cart/v1', userAuthentication, addProductToCart);
orderRouter.put('/increment/product/in/cart/:id/v1', userAuthentication, incrementProductQuantityInCart);
orderRouter.put('/decrement/product/in/cart/:id/v1', userAuthentication, decrementProductQuantityInCart);
orderRouter.delete('/delete/product/from/cart/:id/v1', userAuthentication, deleteProductFromCart);
orderRouter.get('/cart/details/:id/v1', userAuthentication, cartDetails);
orderRouter.get('/all/cart/details/v1', userAuthentication, allCartDetails);
orderRouter.get('/coupon/code/list/v1', userAuthentication, couponCodeList);

// address
orderRouter.post('/create/address/v1', userAuthentication, createAddress);
orderRouter.put('/edit/address/:id/v1', userAuthentication, editAddress);
orderRouter.get('/get/address/:id/v1', userAuthentication, getAddress);
orderRouter.get('/get/address/v1', userAuthentication, getAllAddress);
orderRouter.get('/get/address/user/list/v1', userAuthentication, getUserAllAddress);

// order // very old flow
// orderRouter.post('/create/order/v1', userAuthentication, createOrder);
// orderRouter.put('/cancel/order/:id/v1', userAuthentication, cancelOrder);
// orderRouter.get('/order/list/v1', userAuthentication, orderList);
// orderRouter.get('/order/details/:id/v1', userAuthentication, orderDetails);

// order new flow
orderRouter.post('/create/order/v2', userAuthentication, createOrderV2);
orderRouter.put('/cancel/order/:id/v1', userAuthentication, cancelOrder);
orderRouter.get('/order/list/v2', userAuthentication, orderListV2);
orderRouter.get('/order/details/:id/v2', userAuthentication, orderDetailsV2);
orderRouter.post('/create/order/with/shiprocket/v1', userAuthentication, createOrderWithShiprocket);
orderRouter.post('/process/payment/and/update/shiprocket/v1', userAuthentication, processPaymentAndUpdateShiprocket);




// payment webhook
orderRouter.post('/payment/webhook/v1', paymentWebhookCall);

// ✅ Shiprocket Webhook - Alternative route (no 'shiprocket' keyword)
orderRouter.post('/delivery/tracking/webhook', webhookTracking);

// retailer // very old flow
// orderRouter.get('/retailer/order/list/v1', retailerAuthentication, retailerOrderList);
// orderRouter.get('/retailer/order/details/:id/v1', retailerAuthentication, retailerOrderDetails);
// orderRouter.put('/retailer/order/change/status/:id/v1', retailerAuthentication, orderChangeStatus);

// retailer new flow
orderRouter.get('/retailer/pending/order/list/v2', retailerAuthentication, retailerPendingOrderList);
orderRouter.get('/retailer/order/history/list/v2', retailerAuthentication, retailerOrderHistoryList);
orderRouter.get('/retailer/order/details/:id/v2', retailerAuthentication, retailerOrderDetailsV2);
orderRouter.get('/retailer/delivery/assigned/list/v1', retailerAuthentication, retailerAssignedDeliveries);
orderRouter.get('/retailer/delivery/boys/v1', retailerAuthentication, retailerAvailableDeliveryBoys);
orderRouter.get('/retailer/delivery/boys/dashboard/v1', retailerAuthentication, retailerDeliveryBoyDashboard);
orderRouter.post('/retailer/delivery/assign/v1', retailerAuthentication, retailerAssignOrderToDeliveryBoy);
orderRouter.put('/retailer/order/change/status/:id/v1', retailerAuthentication, orderChangeStatus);

// Slot Booking (User App)
orderRouter.post('/slot/booking/create/v1', userAuthentication, createSlotBooking);
orderRouter.get('/slot/bookings/list/v1', userAuthentication, getUserSlotBookings);

export default orderRouter;
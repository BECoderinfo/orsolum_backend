import express from "express";
import { body } from 'express-validator';
import { createAdmin, loginAdmin, uploadStoreCategoryImage, createStoreCategory, editStoreCategory, deleteStoreCategory, listStoreCategory, listStores, storeDetails, acceptStore, rejectStore, createStore, deleteStore, listProducts, productDetails, acceptProduct, rejectProduct, createCouponCode, updateCouponCode, deleteCouponCode, listCouponCode, createMembership, updateMembership, getMembershipDetails, listUsers, userDetails, inActiveUserDetails, listPayments, paymentDetails, listLocalStoreOrders, localStoreOrderDetails, listOnlineOrders, onlineOrderDetails, getOnlineReturnOrder, getReturnOrderDetails, returnAdminChangeStatus } from "../controllers/adminController.js";
import { adminAuthentication, userAuthentication } from "../middlewares/middleware.js";
import { createWorkHours, getAllWorkHours, updateWorkHours, deleteWorkHours } from "../controllers/workHoursController.js";
import ShiprocketService from '../helper/shiprocketService.js';
import { processGoogleMapsLink } from '../helper/latAndLong.js';
const adminRouter = express.Router();

// Admin
// adminRouter.post('/create/admin/v1', createAdmin);
adminRouter.post('/login/admin/v1', loginAdmin);

// store categories
// image upload
adminRouter.post('/retailer/upload/store/category/image/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], adminAuthentication, uploadStoreCategoryImage);
adminRouter.post('/admin/create/store/category/v1', adminAuthentication, createStoreCategory);
adminRouter.put('/admin/edit/store/category/:id/v1', adminAuthentication, editStoreCategory);
adminRouter.delete('/admin/delete/store/category/:id/v1', adminAuthentication, deleteStoreCategory);
adminRouter.get('/admin/list/store/category/v1', adminAuthentication, listStoreCategory);

// store
adminRouter.get('/admin/list/store/v1', adminAuthentication, listStores);
adminRouter.get('/admin/store/details/:id/v1', adminAuthentication, storeDetails);
adminRouter.post('/admin/accept/store/v1', adminAuthentication, acceptStore);
adminRouter.post('/admin/reject/store/v1', adminAuthentication, rejectStore);
adminRouter.post('/admin/create/store/v1', adminAuthentication, createStore);
adminRouter.delete('/admin/delete/store/:id/v1', adminAuthentication, deleteStore);

// product
adminRouter.get('/admin/list/product/v1', adminAuthentication, listProducts);
adminRouter.get('/admin/product/details/:id/v1', adminAuthentication, productDetails);
adminRouter.post('/admin/accept/product/v1', adminAuthentication, acceptProduct);
adminRouter.post('/admin/reject/product/v1', adminAuthentication, rejectProduct);

// coupon code
adminRouter.post('/admin/create/coupon/code/v1', adminAuthentication, createCouponCode);
adminRouter.put('/admin/update/coupon/code/:id/v1', adminAuthentication, updateCouponCode);
adminRouter.delete('/admin/delete/coupon/code/:id/v1', adminAuthentication, deleteCouponCode);
adminRouter.get('/admin/list/coupon/code/v1', adminAuthentication, listCouponCode);

// premium membership
// admin
adminRouter.post('/admin/create/membership/v1', adminAuthentication, createMembership);
adminRouter.put('/admin/update/membership/:id/v1', adminAuthentication, updateMembership);
// user
adminRouter.get('/user/membership/details/v1', userAuthentication, getMembershipDetails);

// user management
adminRouter.get('/admin/list/users/v1', adminAuthentication, listUsers);
adminRouter.get('/admin/user/details/:id/v1', adminAuthentication, userDetails);
adminRouter.post('/admin/user/inactice/:id/v1', adminAuthentication, inActiveUserDetails);

// payment management
adminRouter.get('/admin/payments/v1', adminAuthentication, listPayments);
adminRouter.get('/admin/payment/details/:id/v1', adminAuthentication, paymentDetails);

// order management
adminRouter.get('/admin/local-store/orders/v1', adminAuthentication, listLocalStoreOrders);
adminRouter.get('/admin/local-store/order/details/:id/v1', adminAuthentication, localStoreOrderDetails);
adminRouter.get('/admin/online/orders/v1', adminAuthentication, listOnlineOrders);
adminRouter.get('/admin/online/order/details/:id/v1', adminAuthentication, onlineOrderDetails);

//Return
adminRouter.get('/admin/online/return/v2', adminAuthentication, getOnlineReturnOrder);
adminRouter.get('/admin/online/return/details/:id/v2', adminAuthentication, getReturnOrderDetails);
adminRouter.put('/admin/online/return/changestatus/:id/v2', adminAuthentication, returnAdminChangeStatus);

//WorkHours 
adminRouter.post('/admin/create/workhours/v1', adminAuthentication, createWorkHours);
adminRouter.get('/get/all/workhours/v1', getAllWorkHours);
adminRouter.put('/admin/update/workhours/:id/v1', adminAuthentication, updateWorkHours);
adminRouter.delete('/admin/delete/workhours/:id/v1', adminAuthentication, deleteWorkHours);

export default adminRouter;
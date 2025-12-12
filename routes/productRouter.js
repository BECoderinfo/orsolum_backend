import express from "express";
import { body } from 'express-validator';
import { uploadProductImage, createProduct, editProduct, deleteProduct, productDetails, productList, getLocalStoreHomePageData, getLocalStoreHomePageDataV2, getAllCategories, getLocalPopularCategories, getAllStores, getStoreDetails, getStoreProductList, getCategoryProductList, getProductDetails, deleteProductImage } from "../controllers/productController.js";
import { retailerAuthentication, userAuthentication } from "../middlewares/middleware.js";
import { uploadProductImagesMulter } from "../helper/uploadImage.js";
const productRouter = express.Router();

// image upload
productRouter.post('/retailer/upload/product/image/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], retailerAuthentication, uploadProductImage); // not in used

// retailer
productRouter.post('/retailer/create/product/v1', retailerAuthentication, uploadProductImagesMulter.array('productImages', 10), createProduct);
productRouter.put('/retailer/edit/product/:id/v1', retailerAuthentication, uploadProductImagesMulter.array('productImages', 10), editProduct);
productRouter.delete('/retailer/delete/product/:id/v1', retailerAuthentication, deleteProduct);
productRouter.get('/retailer/product/list/v1', retailerAuthentication, productList);
productRouter.get('/retailer/product/details/:id/v1', retailerAuthentication, productDetails);
productRouter.put('/retailer/delete/product/image/:id/v1', retailerAuthentication, deleteProductImage);

// user
productRouter.get('/user/local/store/home/page/v1', userAuthentication, getLocalStoreHomePageData); // not in used
productRouter.post('/user/local/store/home/page/v2', userAuthentication, getLocalStoreHomePageDataV2);
productRouter.get('/user/get/all/categories/v1', userAuthentication, getAllCategories);
productRouter.get('/user/local/popular/categories/v1', userAuthentication, getLocalPopularCategories);
productRouter.get('/user/get/all/stores/v1', userAuthentication, getAllStores);
productRouter.get('/user/store/details/:id/v1', userAuthentication, getStoreDetails);
productRouter.get('/user/store/product/list/:id/v1', userAuthentication, getStoreProductList);
productRouter.get('/user/category/product/list/:id/v1', userAuthentication, getCategoryProductList); // not in used
productRouter.get('/user/store/product/details/:id/v1', userAuthentication, getProductDetails);

export default productRouter;
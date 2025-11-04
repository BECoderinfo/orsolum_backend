import express from "express";
import { body } from 'express-validator';
import { uploadStoreImage, createStore, listOfCategories, editStore, storeDetails, deleteStoreImage, saveAllOffers, createStoreOffer, deleteStoreOffer, createOffers, deleteStoreSelectedOffer, saveAllPopularProducts, createPopularProduct, deletePopularProduct, searchPopularProduct } from "../controllers/storeController.js";
import { retailerAuthentication } from "../middlewares/middleware.js";
import { uploadStoreImagesMulter } from "../helper/uploadImage.js";
const retailerRouter = express.Router();

// image upload
retailerRouter.post('/retailer/upload/store/image/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], retailerAuthentication, uploadStoreImage); // not in used

// store
retailerRouter.post('/retailer/create/store/v1', retailerAuthentication, uploadStoreImagesMulter.array("images", 10), createStore);
retailerRouter.put('/retailer/edit/store/:id/v1', retailerAuthentication, uploadStoreImagesMulter.array("images", 10), editStore);
retailerRouter.get('/retailer/store/details/v1', retailerAuthentication, storeDetails);
retailerRouter.put('/delete/store/image/v1', retailerAuthentication, deleteStoreImage);

// category
retailerRouter.get('/retailer/categories/list/v1', retailerAuthentication, listOfCategories);

// store offers // old flow
// retailerRouter.post('/retailer/save/all/offers/v1', retailerAuthentication, saveAllOffers);
// retailerRouter.put('/retailer/create/store/offer/:id/v1', retailerAuthentication, createStoreOffer);
// retailerRouter.delete('/retailer/delete/store/offer/:store/:offer/v1', retailerAuthentication, deleteStoreOffer);

// store offers // new flow
retailerRouter.post('/retailer/create/offers/v1', retailerAuthentication, createOffers);
retailerRouter.delete('/retailer/delete/selected/offer/:id/v1', retailerAuthentication, deleteStoreSelectedOffer);

// popular products
retailerRouter.post('/retailer/save/all/popular/products/v1', retailerAuthentication, saveAllPopularProducts);
retailerRouter.post('/retailer/create/popular/product/v1', retailerAuthentication, createPopularProduct); // not in used
retailerRouter.delete('/retailer/delete/popular/product/:store/:id/v1', retailerAuthentication, deletePopularProduct); // not in used
retailerRouter.get('/retailer/search/popular/product/v1', retailerAuthentication, searchPopularProduct);

export default retailerRouter;
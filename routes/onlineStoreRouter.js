import express from "express";
import {
  uploadBrandImage,
  createBrand,
  updateBrand,
  deleteBrand,
  listBrands,
  uploadCategoryImage,
  createCategory,
  updateCategory,
  deleteCategory,
  listCategory,
  uploadSubCategoryImage,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
  listSubCategory,
  uploadOnlineProductImage,
  createProduct,
  updateProduct,
  deleteProduct,
  listProducts,
  createProductUnit,
  updateProductUnit,
  deleteProductUnit,
  onlineStoreHomePage,
  allTrendingProducts,
  allCategories,
  allSubCategories,
  allBrands,
  onlineStoreExploreCards,
  onlineStorePopularCategories,
  onlineStorePopularBrands,
  onlineStoreDiscovery,
  onlineProductsList,
  onlineProductsDetails,
  incrementOnlineProductQuantityInCart,
  addOnlineProductToCart,
  decrementOnlineProductQuantityInCart,
  deleteOnlineProductFromCart,
  onlineStoreCartDetails,
  createOnlineOrder,
  cancelOnlineOrder,
  onlineOrderList,
  onlineOrderDetails,
  adminProductDetails,
  listSubCategoryByCategory,
  returnChangeStatus,
  onlineOrderChangeStatus,
} from "../controllers/onlineStoreController.js";
import {
  adminAuthentication,
  userAuthentication,
  sellerAuthentication,
} from "../middlewares/middleware.js";
import { body } from "express-validator";
import { uploadReturnImage } from "../helper/uploadImage.js";
const onlineStoreRouter = express.Router();

// admin routes
// brand
onlineStoreRouter.post('/admin/upload/brand/image/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], adminAuthentication, uploadBrandImage);
onlineStoreRouter.post('/admin/create/brand/v1', adminAuthentication, createBrand);
onlineStoreRouter.put('/admin/update/brand/:id/v1', adminAuthentication, updateBrand);
onlineStoreRouter.delete('/admin/delete/brand/:id/v1', adminAuthentication, deleteBrand);
onlineStoreRouter.get('/admin/list/brands/v1', adminAuthentication, listBrands);

// category
onlineStoreRouter.post('/admin/upload/category/image/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], adminAuthentication, uploadCategoryImage);
onlineStoreRouter.post('/admin/create/category/v1', adminAuthentication, createCategory);
onlineStoreRouter.put('/admin/update/category/:id/v1', adminAuthentication, updateCategory);
onlineStoreRouter.delete('/admin/delete/category/:id/v1', adminAuthentication, deleteCategory);
onlineStoreRouter.get('/admin/list/categories/v1', adminAuthentication, listCategory);

// ✅ Seller – readonly category list (used in seller panel Add Product)
onlineStoreRouter.get(
  "/online/seller/list/categories/v1",
  sellerAuthentication,
  listCategory
);

// sub category
onlineStoreRouter.post('/admin/upload/sub/category/image/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], adminAuthentication, uploadSubCategoryImage);
onlineStoreRouter.post('/admin/create/sub/category/v1', adminAuthentication, createSubCategory);
onlineStoreRouter.put('/admin/update/sub/category/:id/v1', adminAuthentication, updateSubCategory);
onlineStoreRouter.delete('/admin/delete/sub/category/:id/v1', adminAuthentication, deleteSubCategory);
onlineStoreRouter.get(
  "/admin/list/sub/categories/v1",
  adminAuthentication,
  listSubCategory
);
onlineStoreRouter.get(
  "/admin/list/sub/categories/:id/v1",
  adminAuthentication,
  listSubCategoryByCategory
);

// ✅ Seller – readonly sub‑categories (filtered by category)
onlineStoreRouter.get(
  "/online/seller/list/sub/categories/:id/v1",
  sellerAuthentication,
  listSubCategoryByCategory
);

// product
onlineStoreRouter.post('/admin/upload/online/product/image/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], adminAuthentication, uploadOnlineProductImage);
onlineStoreRouter.post(
  "/admin/create/product/v1",
  adminAuthentication,
  createProduct
);
onlineStoreRouter.put(
  "/admin/update/product/:id/v1",
  adminAuthentication,
  updateProduct
);
onlineStoreRouter.delete(
  "/admin/delete/product/:id/v1",
  adminAuthentication,
  deleteProduct
);
onlineStoreRouter.get(
  "/admin/list/online/product/v1",
  adminAuthentication,
  listProducts
);
onlineStoreRouter.get(
  "/admin/details/online/product/:id/v1",
  adminAuthentication,
  adminProductDetails
);

// ✅ Seller – basic product CRUD used in seller panel
onlineStoreRouter.post(
  "/online/seller/product/add/v1",
  sellerAuthentication,
  createProduct
);
onlineStoreRouter.put(
  "/online/seller/product/update/:id/v1",
  sellerAuthentication,
  updateProduct
);
onlineStoreRouter.delete(
  "/online/seller/product/delete/:id/v1",
  sellerAuthentication,
  deleteProduct
);
onlineStoreRouter.get(
  "/online/seller/product/list/v1",
  sellerAuthentication,
  listProducts
);
onlineStoreRouter.get(
  "/online/seller/product/details/:id/v1",
  sellerAuthentication,
  adminProductDetails
);
// units
onlineStoreRouter.post('/admin/create/product/unit/v1', adminAuthentication, createProductUnit);
onlineStoreRouter.put('/admin/update/product/unit/:id/v1', adminAuthentication, updateProductUnit);
onlineStoreRouter.delete('/admin/delete/product/unit/:id/v1', adminAuthentication, deleteProductUnit);


// USER
onlineStoreRouter.get('/online/store/home/page/v1', userAuthentication, onlineStoreHomePage);
onlineStoreRouter.get('/online/store/all/trending/products/v1', userAuthentication, allTrendingProducts);
onlineStoreRouter.get('/online/store/all/categories/v1', userAuthentication, allCategories);
onlineStoreRouter.get('/online/store/all/sub/categories/v1', userAuthentication, allSubCategories);
onlineStoreRouter.get('/online/store/all/brands/v1', userAuthentication, allBrands);
onlineStoreRouter.get('/online/store/discovery/v1', userAuthentication, onlineStoreDiscovery);
onlineStoreRouter.get('/online/store/explore/cards/v1', userAuthentication, onlineStoreExploreCards);
onlineStoreRouter.get('/online/store/popular/categories/v1', userAuthentication, onlineStorePopularCategories);
onlineStoreRouter.get('/online/store/popular/brands/v1', userAuthentication, onlineStorePopularBrands);
onlineStoreRouter.get('/online/store/products/list/v1', userAuthentication, onlineProductsList);
onlineStoreRouter.get('/online/store/products/details/:id/v1', userAuthentication, onlineProductsDetails);

// cart
onlineStoreRouter.post('/add/online/product/in/cart/v1', userAuthentication, addOnlineProductToCart);
onlineStoreRouter.put('/increment/online/product/in/cart/:productId/:unitId/v1', userAuthentication, incrementOnlineProductQuantityInCart);
onlineStoreRouter.put('/decrement/online/product/in/cart/:productId/:unitId/v1', userAuthentication, decrementOnlineProductQuantityInCart);
onlineStoreRouter.delete('/delete/online/product/from/cart/:productId/:unitId/v1', userAuthentication, deleteOnlineProductFromCart);
onlineStoreRouter.get('/online/cart/details/v1', userAuthentication, onlineStoreCartDetails);

// order
onlineStoreRouter.post('/create/online/order/v1', userAuthentication, createOnlineOrder);
onlineStoreRouter.put('/cancel/online/order/:id/v1', userAuthentication, cancelOnlineOrder);
onlineStoreRouter.get('/online/order/list/v1', userAuthentication, onlineOrderList);
onlineStoreRouter.get('/online/order/details/:id/v1', userAuthentication, onlineOrderDetails);
onlineStoreRouter.put('/online/order/change/status/:id/v1', onlineOrderChangeStatus)
onlineStoreRouter.put('/order/return/:id/v1', userAuthentication , uploadReturnImage.single('returnImage') ,returnChangeStatus);

export default onlineStoreRouter;
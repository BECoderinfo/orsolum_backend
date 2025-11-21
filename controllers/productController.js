import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import Store from '../models/Store.js';
import User from '../models/User.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import StoreCategory from '../models/StoreCategory.js';
import mongoose from 'mongoose';
import { signedUrl } from '../helper/s3.config.js';
import { getDistance } from "geolib";

let limit = process.env.LIMIT;
limit = limit ? Number(limit) : 10;

const { ObjectId } = mongoose.Types;

const extractProductImageKeys = (files = []) => {
  if (!Array.isArray(files) || !files.length) return [];
  return files
    .map((file) => file?.key || file?.location || file?.path)
    .filter((key) => typeof key === "string" && key.trim().length)
    .map((key) => key.trim());
};

const parseProductImagesField = (incoming) => {
  if (!incoming) return [];
  if (Array.isArray(incoming)) {
    return incoming
      .filter((img) => typeof img === "string" && img.trim().length)
      .map((img) => img.trim());
  }
  if (typeof incoming === "string") {
    try {
      const parsed = JSON.parse(incoming);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((img) => typeof img === "string" && img.trim().length)
          .map((img) => img.trim());
      }
    } catch (err) {
      // ignore JSON parse errors and fallback to comma separated parsing
    }
    return incoming
      .split(",")
      .map((img) => img.trim())
      .filter((img) => img.length);
  }
  return [];
};

const mergeProductImages = (...lists) => {
  const flat = lists.flat().filter(Boolean);
  return [...new Set(flat)];
};

function calculateDiscount(mrp, sellingPrice) {
    if (mrp <= 0 || sellingPrice < 0 || sellingPrice > mrp) {
        return "Invalid prices";
    }
    let discount = ((mrp - sellingPrice) / mrp) * 100;
    return discount.toFixed(2) + "% OFF";
}

export const uploadProductImage = async (req, res) => {
    try {
        signedUrl(req, res, 'Product/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadProductImage', error, req, res);
    }
}

/**
 * @route   POST /api/retailer/create/product/v1
 * @desc    Create a product under a retailer's store
 * @access  Private (Retailer)
 */
export const createProduct = async (req, res) => {
    try {
      const { productName, companyName, mrp, sellingPrice, information, storeId, qty } = req.body;
  
      // ✅ Validate mandatory fields
      if (!productName || !companyName || !mrp || !sellingPrice || !information || !storeId) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message:
            "Please provide all product details (productName, companyName, mrp, sellingPrice, information, storeId)",
        });
      }
  
      // ✅ Convert numeric fields to Number
      const parsedMrp = Number(mrp);
      const parsedSellingPrice = Number(sellingPrice);
  
      if (isNaN(parsedMrp) || isNaN(parsedSellingPrice)) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "MRP and Selling Price must be valid numbers",
        });
      }
  
      // ✅ Image Handling
      const productImages = mergeProductImages(
        parseProductImagesField(req.body?.productImages),
        extractProductImageKeys(req.files)
      );
  
      // ✅ Verify Store Ownership (fixed ObjectId mismatch issue)
      const store = await Store.findById(storeId);
      if (!store) {
        return res.status(status.NotFound).json({
          status: jsonStatus.NotFound,
          success: false,
          message: "Store not found",
        });
      }
  
      // Convert both IDs to string for comparison
      if (store.createdBy.toString() !== req.user._id.toString()) {
        return res.status(status.Forbidden).json({
          status: jsonStatus.Forbidden,
          success: false,
          message: "You are not the owner of this store",
        });
      }
  
      // ✅ Calculate discount percentage
      const offPer = calculateDiscount(parsedMrp, parsedSellingPrice);
      if (offPer === "Invalid prices") {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Invalid MRP or Selling Price. MRP must be greater than Selling Price",
        });
      }
  
      // ✅ Create new product
      const newProduct = new Product({
        productName,
        companyName,
        mrp: parsedMrp,
        sellingPrice: parsedSellingPrice,
        information,
        qty,
        offPer,
        storeId,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        productImages,
      });
  
      const savedProduct = await newProduct.save();
  
      // ✅ Success response
      res.status(status.Create).json({
        status: jsonStatus.Create,
        success: true,
        message: "Product created successfully",
        data: savedProduct,
      });
    } catch (error) {
      console.error("❌ Error creating product:", error);
      res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: error.message,
      });
      return catchError("createProduct", error, req, res);
    }
  };
  

export const editProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = { ...req.body };

        const product = await Product.findOne({ _id: id, createdBy: req.user._id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        const updateData = { updatedBy: req.user._id };

        if (Object.prototype.hasOwnProperty.call(payload, "details")) {
            let productDetails = payload.details;
            if (typeof productDetails === "string" && productDetails.trim().length > 0) {
                try {
                    productDetails = JSON.parse(productDetails);
                } catch (err) {
                    return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: 'Invalid JSON format for details.' });
                }
            }
            if (!productDetails) {
                productDetails = [];
            }
            updateData.details = productDetails;
        }

        const additionalImages = mergeProductImages(
            parseProductImagesField(payload.productImages),
            extractProductImageKeys(req.files)
        );

        if (additionalImages.length) {
            const existingImages = Array.isArray(product.productImages) ? product.productImages : [];
            updateData.productImages = mergeProductImages(existingImages, additionalImages);
        }

        const simpleFields = ["productName", "companyName", "information", "qty", "status", "manufacturer"];
        simpleFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(payload, field)) {
                updateData[field] = payload[field];
            }
        });

        if (Object.prototype.hasOwnProperty.call(payload, "storeId")) {
            const newStoreId = payload.storeId;
            const isStore = await Store.findOne({ createdBy: req.user._id, _id: newStoreId });
            if (!isStore) {
                return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Store not found with this account" });
            }
            updateData.storeId = newStoreId;
        }

        const hasMrp = Object.prototype.hasOwnProperty.call(payload, "mrp");
        const hasSellingPrice = Object.prototype.hasOwnProperty.call(payload, "sellingPrice");

        if (hasMrp || hasSellingPrice) {
            const finalMrp = hasMrp ? Number(payload.mrp) : Number(product.mrp);
            const finalSellingPrice = hasSellingPrice ? Number(payload.sellingPrice) : Number(product.sellingPrice);

            if (isNaN(finalMrp) || isNaN(finalSellingPrice)) {
                return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "MRP and Selling price must be valid numbers" });
            }

            const offPer = calculateDiscount(finalMrp, finalSellingPrice);
            if (offPer === "Invalid prices") {
                return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Something wrong with MRP or Selling price" });
            }

            updateData.mrp = finalMrp;
            updateData.sellingPrice = finalSellingPrice;
            updateData.offPer = offPer;
        }

        if (Object.keys(updateData).length === 1) { // only updatedBy present
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Please provide at least one field to update" });
        }

        const editProduct = await Product.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: editProduct });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('editProduct', error, req, res);
    }
};

export const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findOne({ _id: id, createdBy: req.user._id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        await Product.findByIdAndUpdate(id, { deleted: true, updatedBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteProduct', error, req, res);
    }
};

export const productDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findOne({ _id: id, createdBy: req.user._id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        const productDetails = await Product.aggregate([
            {
                $match: {
                    _id: new ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: "createdBy",
                    foreignField: "createdBy",
                    as: "similarProducts",
                    pipeline: [
                        {
                            $match: {
                                _id: {
                                    $ne: new ObjectId(id)
                                }
                            }
                        },
                        {
                            $sort: {
                                createdAt: -1
                            }
                        }
                    ]
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: productDetails[0] });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('productDetails', error, req, res);
    }
};

export const deleteProductImage = async (req, res) => {
    try {
        const { id } = req.params;
        const { index } = req.body;

        if (typeof index !== "number" || index < 0) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Invalid index provided." });
        }

        const product = await Product.findOne({ _id: id, createdBy: req.user._id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        if (index >= product.productImages.length) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Index out of bounds." });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            {
                $pull: {
                    productImages: product.productImages[index]
                }
            },
            { new: true, runValidators: true }
        );

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: updatedProduct });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteProductImage', error, req, res);
    }
};

export const productList = async (req, res) => {
    try {

        let { skip } = req.query;
        skip = skip || 1;

        const list = await Product.aggregate([
            {
                $match: {
                    deleted: false,
                    createdBy: new ObjectId(req.user._id)
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $skip: (Number(skip) - 1) * limit
            },
            {
                $limit: limit
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('productList', error, req, res);
    }
};

export const getLocalStoreHomePageData = async (req, res) => {
    try {

        const categories = await StoreCategory.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $limit: 8
            }
        ]);

        const stores = await Store.aggregate([
            {
                $match: {
                    status: "A"
                }
            },
            {
                $lookup: {
                    from: "store_categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category_name"
                }
            },
            {
                $addFields: {
                    category_name: {
                        $ifNull: [
                            { $arrayElemAt: ["$category_name.name", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $project: {
                    productImages: 1,
                    category_name: 1,
                    name: 1,
                    address: 1
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $limit: 5
            }
        ]);

        if (lat && long) {
            const userLocation = { latitude: parseFloat(lat), longitude: parseFloat(long) };
            const speedKmPerHour = 30; // Adjust for travel mode

            stores = stores.map(store => {
                if (store.location && store.location.coordinates) {
                    const storeLocation = {
                        latitude: store.location.coordinates[1],
                        longitude: store.location.coordinates[0]
                    };

                    const distance = getDistance(userLocation, storeLocation) / 1000; // Convert to km
                    const estimatedTime = (distance / speedKmPerHour) * 60; // Convert to minutes

                    return {
                        ...store,
                        distanceKm: Math.ceil(distance),
                        estimatedTimeMinutes: Math.ceil(estimatedTime)
                    };
                }
                return {
                    ...store,
                    distanceKm: null,
                    estimatedTimeMinutes: null
                };
            });
        } else {
            // If user location is not available, set distance and time to null for all stores
            stores = stores.map(store => ({
                ...store,
                distanceKm: null,
                estimatedTimeMinutes: null
            }));
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: { categories, stores } });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getLocalStoreHomePageData', error, req, res);
    }
};

export const getLocalStoreHomePageDataV2 = async (req, res) => {
    try {
        const { lat, long } = req.body;

        if (lat && long) {
            // Update user location if latitude and longitude are provided
            await User.findByIdAndUpdate(req.user._id, { lat, long }, { new: true, runValidators: true });
        } else {
            // Clear user location if latitude and longitude are not provided
            await User.findByIdAndUpdate(req.user._id, { lat: "", long: "" }, { new: true, runValidators: true });
        }

        // Fetch categories (unchanged from original code)
        const categories = await StoreCategory.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $limit: 8
            }
        ]);

        let stores = [];

        if (lat && long) {
            // Fetch stores within 15 km radius
            stores = await Store.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [parseFloat(long), parseFloat(lat)] // Longitude first, then latitude
                        },
                        distanceField: "distance",
                        maxDistance: 15000, // 15 km in meters
                        spherical: true
                    }
                },
                {
                    $match: {
                        status: "A"
                    }
                },
                {
                    $lookup: {
                        from: "store_categories",
                        localField: "category",
                        foreignField: "_id",
                        as: "category_name"
                    }
                },
                {
                    $addFields: {
                        category_name: {
                            $ifNull: [
                                { $arrayElemAt: ["$category_name.name", 0] },
                                null
                            ]
                        }
                    }
                },
                {
                    $project: {
                        productImages: 1,
                        category_name: 1,
                        name: 1,
                        address: 1,
                        images: 1,
                        location: 1
                    }
                },
                {
                    $sort: {
                        createdAt: -1
                    }
                },
                {
                    $limit: 5
                }
            ]);
        }

        if (lat && long) {
            const userLocation = { latitude: parseFloat(lat), longitude: parseFloat(long) };
            const speedKmPerHour = 30; // Adjust for travel mode

            stores = stores.map(store => {
                if (store.location && store.location.coordinates) {
                    const storeLocation = {
                        latitude: store.location.coordinates[1],
                        longitude: store.location.coordinates[0]
                    };

                    const distance = getDistance(userLocation, storeLocation) / 1000; // Convert to km
                    const estimatedTime = (distance / speedKmPerHour) * 60; // Convert to minutes

                    return {
                        ...store,
                        distanceKm: Math.ceil(distance),
                        estimatedTimeMinutes: Math.ceil(estimatedTime)
                    };
                }
                return {
                    ...store,
                    distanceKm: null,
                    estimatedTimeMinutes: null
                };
            });
        } else {
            // If user location is not available, set distance and time to null for all stores
            stores = stores.map(store => ({
                ...store,
                distanceKm: null,
                estimatedTimeMinutes: null
            }));
        }

        let totalCartCount = await Cart.find({ createdBy: req.user._id, deleted: false });
        if (totalCartCount.length > 0) {
            let total = 0;
            totalCartCount.map(elem => {
                total += elem.quantity;
            });
            totalCartCount = total;
        } else {
            totalCartCount = 0;
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: { categories, stores, totalCartCount } });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getLocalStoreHomePageDataV2', error, req, res);
    }
};

export const getAllCategories = async (req, res) => {
    try {

        const categories = await StoreCategory.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: categories });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getAllCategories', error, req, res);
    }
};

export const getAllStores = async (req, res) => {
    try {
        const { category, search, relevance, nearMe, offers } = req.query;
        let { skip } = req.query;
        skip = skip || 1;
        const { lat, long } = req.user || {};

        let matchObj = {
            status: "A",
            name: {
                $regex: search, $options: 'i'
            }
        };

        if (category) {
            matchObj = {
                ...matchObj,
                category: new ObjectId(category)
            };
        }

        const aggregationPipeline = [];

        if (nearMe === "1" && lat && long) {
            aggregationPipeline.unshift({
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [parseFloat(long), parseFloat(lat)]
                    },
                    distanceField: "distance",
                    maxDistance: 15000, // 15 km
                    spherical: true
                }
            });
        } else if (lat && long) {
            matchObj = {
                ...matchObj,
                location: {
                    $geoWithin: {
                        $centerSphere: [[parseFloat(long), parseFloat(lat)], 15000 / 6378.1]
                    }
                }
            };
        }

        aggregationPipeline.push(
            {
                $match: matchObj
            },
            {
                $lookup: {
                    from: "store_offers",
                    localField: "_id",
                    foreignField: "storeId",
                    as: "storeOffers"
                }
            },
            {
                $lookup: {
                    from: "store_categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category_name"
                }
            },
            {
                $addFields: {
                    storeOffersCount: { $size: "$storeOffers" },
                    category_name: {
                        $ifNull: [
                            { $arrayElemAt: ["$category_name.name", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $project: {
                    productImages: 1,
                    category_name: 1,
                    name: 1,
                    address: 1,
                    storeOffersCount: 1,
                    images: 1,
                    location: 1
                }
            }
        );

        if (nearMe !== "1") {
            const sortStage = (offers === "1")
                ? { $sort: { storeOffersCount: -1, createdAt: -1 } }
                : { $sort: { createdAt: -1 } };

            aggregationPipeline.push(sortStage);
        }

        aggregationPipeline.push(
            {
                $skip: (Number(skip) - 1) * limit
            },
            {
                $limit: limit
            }
        );

        let stores = await Store.aggregate(aggregationPipeline);

        if (lat && long) {
            const userLocation = { latitude: parseFloat(lat), longitude: parseFloat(long) };
            const speedKmPerHour = 30; // Adjust for travel mode

            stores = stores.map(store => {
                if (store.location && store.location.coordinates) {
                    const storeLocation = {
                        latitude: store.location.coordinates[1],
                        longitude: store.location.coordinates[0]
                    };

                    const distance = getDistance(userLocation, storeLocation) / 1000; // Convert to km
                    const estimatedTime = (distance / speedKmPerHour) * 60; // Convert to minutes

                    return {
                        ...store,
                        distanceKm: Math.ceil(distance),
                        estimatedTimeMinutes: Math.ceil(estimatedTime)
                    };
                }
                return {
                    ...store,
                    distanceKm: null,
                    estimatedTimeMinutes: null
                };
            });
        } else {
            // If user location is not available, set distance and time to null for all stores
            stores = stores.map(store => ({
                ...store,
                distanceKm: null,
                estimatedTimeMinutes: null
            }));
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: stores });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getAllStores', error, req, res);
    }
};

export const getStoreDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user ? req.user._id : null; // Assume userId is available in the request

        const store = await Store.findById(id);
        if (!store) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Not Found" });
        }

        let storeDetails = await Store.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: "store_categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category_name"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },
            {
                $addFields: {
                    category_name: {
                        $ifNull: [
                            { $arrayElemAt: ["$category_name.name", 0] },
                            null
                        ]
                    },
                    userDetails: {
                        $ifNull: [
                            { $arrayElemAt: ["$userDetails", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $lookup: {
                    from: "store_offers",
                    localField: "_id",
                    foreignField: "storeId",
                    as: "storeOffers",
                    pipeline: [
                        {
                            $match: {
                                deleted: false
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: "store_popular_products",
                    localField: "_id",
                    foreignField: "storeId",
                    as: "popularProducts",
                    pipeline: [
                        {
                            $lookup: {
                                from: "products",
                                localField: "productId",
                                foreignField: "_id",
                                as: "productDetails",
                                pipeline: [
                                    {
                                        $lookup: {
                                            from: "carts",
                                            let: { productId: "$_id" },
                                            pipeline: [
                                                {
                                                    $match: {
                                                        $expr: {
                                                            $and: [
                                                                { $eq: ["$productId", "$$productId"] },
                                                                { $eq: ["$createdBy", new ObjectId(userId)] },
                                                                { $eq: ["$deleted", false] }
                                                            ]
                                                        }
                                                    }
                                                },
                                                {
                                                    $group: {
                                                        _id: "$productId",
                                                        totalQuantity: { $sum: "$quantity" }
                                                    }
                                                }
                                            ],
                                            as: "cartInfo"
                                        }
                                    },
                                    {
                                        $addFields: {
                                            cartQuantity: {
                                                $ifNull: [{ $arrayElemAt: ["$cartInfo.totalQuantity", 0] }, 0]
                                            }
                                        }
                                    },
                                    {
                                        $project: { cartInfo: 0 } // Exclude cartInfo array from main product
                                    }
                                ]
                            }
                        },
                        {
                            $addFields: {
                                productDetails: {
                                    $ifNull: [
                                        { $arrayElemAt: ["$productDetails", 0] },
                                        null
                                    ]
                                }
                            }
                        }
                    ]
                }
            }
        ]);

        let distance = null;
        let estimatedTime = null;

        if (userId) {
            const user = await User.findById(userId);
            if (user && user.lat && user.long) {
                const userLocation = {
                    latitude: parseFloat(user.lat),
                    longitude: parseFloat(user.long)
                };

                const storeLocation = {
                    latitude: store.location.coordinates[1],
                    longitude: store.location.coordinates[0]
                };

                distance = getDistance(userLocation, storeLocation) / 1000; // Convert to km

                const speedKmPerHour = 30; // Adjust based on travel mode (e.g., walking ~5 km/h, car ~30 km/h)
                estimatedTime = (distance / speedKmPerHour) * 60; // Convert to minutes
                distance = Math.ceil(distance);
                estimatedTime = Math.ceil(estimatedTime);
            }
        }

        let cartCount = 0;
        let carts = await Cart.find({ createdBy: req.user._id, deleted: false, storeId: id });
        if (carts.length > 0) {
            carts.map(elem => {
                cartCount += elem.quantity;
            })
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: { ...storeDetails[0], distanceKm: distance, estimatedTimeMinutes: estimatedTime, cartCount },
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getStoreDetails', error, req, res);
    }
};

export const getStoreProductList = async (req, res) => {
    try {

        const { id } = req.params;
        const { search } = req.query;
        let { skip } = req.query;
        skip = skip || 1;

        const store = await Store.findById(id);
        if (!store) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Not Found" });
        }

        const userId = req.user._id;

        const list = await Product.aggregate([
            {
                $match: {
                    deleted: false,
                    storeId: new ObjectId(id),
                    productName: {
                        $regex: search, $options: 'i'
                    }
                }
            },
            {
                $lookup: {
                    from: "carts",
                    let: { productId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$productId", "$$productId"] },
                                        { $eq: ["$createdBy", new ObjectId(userId)] },
                                        { $eq: ["$deleted", false] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$productId",
                                totalQuantity: { $sum: "$quantity" }
                            }
                        }
                    ],
                    as: "cartInfo"
                }
            },
            {
                $addFields: {
                    cartQuantity: {
                        $ifNull: [{ $arrayElemAt: ["$cartInfo.totalQuantity", 0] }, 0]
                    }
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $skip: (Number(skip) - 1) * limit
            },
            {
                $limit: limit
            },
            {
                $project: {
                    cartInfo: 0 // Remove cartInfo field from final result
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getStoreProductList', error, req, res);
    }
};

export const getCategoryProductList = async (req, res) => {
    try {

        const { id } = req.params;

        const category = await StoreCategory.findById(id);
        if (!category) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Not Found" });
        }

        const list = await Product.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $lookup: {
                    from: "stores",
                    localField: "storeId",
                    foreignField: "_id",
                    as: "storeDetails"
                }
            },
            {
                $addFields: {
                    storeDetails: {
                        $ifNull: [
                            { $arrayElemAt: ["$storeDetails", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $match: {
                    "storeDetails.category": new ObjectId(id)
                }
            },
            {
                $project: {
                    storeDetails: 0
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getCategoryProductList', error, req, res);
    }
};

export const getProductDetails = async (req, res) => {
    try {

        const { id } = req.params;

        const product = await Product.findOne({ _id: id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        const userId = req.user._id;

        const productDetails = await Product.aggregate([
            {
                $match: { _id: new ObjectId(id) }
            },
            {
                $lookup: {
                    from: "carts",
                    let: { productId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$productId", "$$productId"] },
                                        { $eq: ["$createdBy", new ObjectId(userId)] },
                                        { $eq: ["$deleted", false] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$productId",
                                totalQuantity: { $sum: "$quantity" }
                            }
                        }
                    ],
                    as: "cartInfo"
                }
            },
            {
                $addFields: {
                    cartQuantity: {
                        $ifNull: [{ $arrayElemAt: ["$cartInfo.totalQuantity", 0] }, 0]
                    }
                }
            },
            {
                $lookup: {
                    from: "products",
                    let: { createdBy: "$createdBy", currentProductId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$createdBy", "$$createdBy"] },
                                        { $ne: ["$_id", "$$currentProductId"] }
                                    ]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "carts",
                                let: { productId: "$_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ["$productId", "$$productId"] },
                                                    { $eq: ["$createdBy", new ObjectId(userId)] },
                                                    { $eq: ["$deleted", false] }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        $group: {
                                            _id: "$productId",
                                            totalQuantity: { $sum: "$quantity" }
                                        }
                                    }
                                ],
                                as: "cartInfo"
                            }
                        },
                        {
                            $addFields: {
                                cartQuantity: {
                                    $ifNull: [{ $arrayElemAt: ["$cartInfo.totalQuantity", 0] }, 0]
                                }
                            }
                        },
                        {
                            $sort: { createdAt: -1 }
                        },
                        {
                            $limit: 6
                        },
                        {
                            $project: { cartInfo: 0 } // Exclude cartInfo array
                        }
                    ],
                    as: "similarProducts"
                }
            },
            {
                $project: { cartInfo: 0 } // Exclude cartInfo array from main product
            }
        ]);

        let cartCount = 0;
        let carts = await Cart.find({ createdBy: req.user._id, deleted: false });
        if (carts.length > 0) {
            carts.map(elem => {
                cartCount += elem.quantity;
            })
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: productDetails, cartCount });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getProductDetails', error, req, res);
    }
};
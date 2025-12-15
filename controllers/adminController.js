import { jsonStatus, status } from '../helper/api.responses.js';
import { generateToken } from '../helper/generateToken.js';
import { catchError } from '../helper/service.js';
import Admin from '../models/Admin.js';
import Store from '../models/Store.js';
import Product from '../models/Product.js';
import CouponCode from '../models/CouponCode.js';
import StoreCategory from '../models/StoreCategory.js';
import PremiumMembership from '../models/PremiumMembership.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import OnlineOrder from '../models/OnlineStore/OnlineOrder.js';
import Return from '../models/Return.js';
import Refund from '../models/Refund.js';
import StoreOffer from '../models/StoreOffer.js';
import StorePopularProduct from '../models/StorePopularProduct.js';
import Cart from '../models/Cart.js';
import PickupAddress from '../models/PickupAddress.js';
import Offer from '../models/Offer.js';
import WelcomeImage from '../models/WelcomeImage.js';
import OnlineProduct from '../models/OnlineStore/OnlineProduct.js';
import ProductUnitOnline from '../models/OnlineStore/ProductUnit.js';
import ProductCategory from '../models/OnlineStore/Category.js';
import AppSettings from '../models/AppSettings.js';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { signedUrl } from '../helper/s3.config.js';
import axios from 'axios';
import ShiprocketService from '../helper/shiprocketService.js';
import { processGoogleMapsLink } from '../helper/latAndLong.js';

const { ObjectId } = mongoose.Types;

export const validatePassword = (password) => {
    let errors = [];
  
    if (!password) errors.push("Password is required");
    if (password.length < 6) errors.push("Minimum 6 characters");
    if (!/[A-Z]/.test(password)) errors.push("At least one uppercase letter");
    if (!/[0-9]/.test(password)) errors.push("At least one number");
  
    if (errors.length > 0) {
      return errors.join(", ");
    }
  
    return null;
  };
  
  
  export const createAdmin = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          field: "password",
          message: "Please enter email & password",
        });
      }
  
      const exists = await Admin.findOne({ email });
      if (exists) {
        return res.status(409).json({
          success: false,
          field: "email",
          message: "Admin already exists with this email",
        });
      }
  
      const errorMessage = validatePassword(password);
      if (errorMessage) {
        return res.status(400).json({
          success: false,
          field: "password",
          message: errorMessage,
        });
      }
  
      await Admin.create({ email, password, role: "admin" });
  
      return res.status(201).json({
        success: true,
        message: "Admin created successfully",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };
  
  
  export const listAdmins = async (req, res) => {
    try {
      const admins = await Admin.find({ role: "admin" }).select("-password");
  
      return res.status(200).json({
        success: true,
        message: "Admins fetched successfully",
        data: admins,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch admins",
        error: error.message,
      });
    }
  };
  
  
  export const deleteAdmin = async (req, res) => {
    try {
      const adminId = req.params.id;
  
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: "Admin not found",
        });
      }
  
      await Admin.findByIdAndDelete(adminId);
  
      return res.status(200).json({
        success: true,
        message: "Admin deleted successfully",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete admin",
        error: error.message,
      });
    }
  };
  
  
  
  export const updateAdminPassword = async (req, res) => {
    try {
      const { password } = req.body;
  
      const errorMessage = validatePassword(password);
      if (errorMessage) {
        return res.status(400).json({
          success: false,
          field: "password",
          message: errorMessage,
        });
      }
  
      const admin = await Admin.findById(req.params.id);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: "Admin not found",
        });
      }
  
      admin.password = password;
      await admin.save();
  
      return res.status(200).json({
        success: true,
        message: "Password updated successfully",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

export const loginAdmin = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      if (!email || !password) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Please enter credentials",
        });
      }
  
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Invalid credentials (email not found)",
        });
      }
  
      const checkPass = bcrypt.compareSync(password, admin.password);
      if (!checkPass) {
        return res.status(status.Unauthorized).json({
          status: jsonStatus.Unauthorized,
          success: false,
          message: "Invalid credentials (password mismatch)",
        });
      }
  
      const token = generateToken(admin._id);
  
      res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        token,
      });
    } catch (error) {
      console.error("❌ loginAdmin error:", error.message);
      res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: error.message,
      });
      return catchError("loginAdmin", error, req, res);
    }
  };
  

export const uploadStoreCategoryImage = async (req, res) => {
    try {
        signedUrl(req, res, 'Store_category/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadStoreCategoryImage', error, req, res);
    }
}

export const createStoreCategory = async (req, res) => {
    try {
        const { name, image } = req.body;

        if (!name || !image) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter Category` });
        }

        let newCategory = new StoreCategory({ name, image, createdBy: req.user._id, updatedBy: req.user._id });
        newCategory = await newCategory.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: newCategory });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createStoreCategory', error, req, res);
    }
};

export const editStoreCategory = async (req, res) => {
    try {
        const { name, image } = req.body;
        const { id } = req.params;

        if (!name || !image) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter Category` });
        }

        const category = await StoreCategory.findById(id);
        if (!category) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Category not found" });
        }

        const editCategory = await StoreCategory.findByIdAndUpdate(id, { name, image, updatedBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: editCategory });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('editStoreCategory', error, req, res);
    }
};

export const deleteStoreCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await StoreCategory.findById(id);
        if (!category) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Category not found" });
        }

        await StoreCategory.findByIdAndUpdate(id, { deleted: true, updatedBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteStoreCategory', error, req, res);
    }
};

export const listStoreCategory = async (req, res) => {
    try {

        const listCategories = await StoreCategory.aggregate([
            {
                $match: {
                    deleted: false
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: listCategories });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listStoreCategory', error, req, res);
    }
};

export const listStores = async (req, res) => {
    try {

        const { search, role } = req.query;

        const pipeline = [];

        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        { name: { $regex: search, $options: 'i' } },
                        { phone: { $regex: search, $options: 'i' } }
                    ]
                }
            });
        }

        pipeline.push({
            $sort: {
                createdAt: -1
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
                $lookup: {
                    from: "users",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "storeCreator",
                    pipeline: [
                        {
                            $project: { role: 1 }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    creatorRole: { $arrayElemAt: ["$storeCreator.role", 0] }
                }
            });

        // Filter by role if provided (retailer or seller)
        if (role === "retailer" || role === "seller") {
            pipeline.push({
                $match: {
                    creatorRole: role
                }
            });
        }

        const list = await Store.aggregate(pipeline);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listStores', error, req, res);
    }
};

export const storeDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const store = await Store.findById(id);
        if (!store) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Store details not found" });
        }

        const details = await Store.aggregate([
            {
                $match: {
                    _id: new ObjectId(id)
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
                    from: "store_offers",
                    let: { storeId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$storeId", "$$storeId"] },
                                        { $eq: ["$deleted", false] }
                                    ]
                                }
                            }
                        },
                        {
                            $sort: {
                                createdAt: -1
                            }
                        }
                    ],
                    as: "storeOffers"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "retailerDetails"
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
                    retailerDetails: {
                        $ifNull: [
                            { $arrayElemAt: ["$retailerDetails", 0] },
                            null
                        ]
                    }
                }
            }
        ]);

        if (!details.length) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Store details not found" });
        }

        const storeDetails = details[0];
        const shiprocketInfo = storeDetails.shiprocket || {};
        const pickupIds = shiprocketInfo.pickup_addresses || [];

        let pickupAddresses = [];
        if (pickupIds.length) {
            pickupAddresses = await PickupAddress.find({ _id: { $in: pickupIds } })
                .select("-__v")
                .lean();
        }

        const defaultPickupId = shiprocketInfo.default_pickup_address?.toString() || null;
        const defaultPickup = defaultPickupId
            ? pickupAddresses.find((addr) => addr._id.toString() === defaultPickupId)
            : null;

        storeDetails.shiprocket = {
            ...shiprocketInfo,
            pickup_addresses_ids: pickupIds,
            pickup_addresses_data: pickupAddresses,
            default_pickup_address_id: defaultPickupId,
            default_pickup_address_data: defaultPickup || null
        };

        const popularProducts = await StorePopularProduct.aggregate([
            {
                $match: {
                    storeId: new ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "product"
                }
            },
            {
                $unwind: {
                    path: "$product",
                    preserveNullAndEmptyArrays: false
                }
            },
            {
                $project: {
                    _id: "$product._id",
                    productName: "$product.productName",
                    primaryImage: "$product.primaryImage",
                    mrp: "$product.mrp",
                    sellingPrice: "$product.sellingPrice",
                    offPer: "$product.offPer",
                    status: "$product.status",
                    createdAt: "$product.createdAt"
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

        storeDetails.popularProducts = popularProducts;

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: storeDetails });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('storeDetails', error, req, res);
    }
};

export const acceptStore = async (req, res) => {
    try {
        const { store } = req.body

        const findStore = await Store.findById(store);
        if (!findStore) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Store details not found" });
        }

        await Store.findByIdAndUpdate(store, { updatedBy: req.user._id, status: "A" }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Store accepted" });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('acceptStore', error, req, res);
    }
};

export const rejectStore = async (req, res) => {
    try {
        const { store } = req.body

        const findStore = await Store.findById(store);
        if (!findStore) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Store details not found" });
        }

        await Store.findByIdAndUpdate(store, { updatedBy: req.user._id, status: "R" }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Store rejected" });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('rejectStore', error, req, res);
    }
};

export const updateStoreRating = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, ratingCount } = req.body || {};

        if (rating === undefined && ratingCount === undefined) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Provide rating or ratingCount to update"
            });
        }

        const updatePayload = {
            updatedBy: req.user._id
        };

        if (rating !== undefined) {
            const parsedRating = Number(rating);
            if (Number.isNaN(parsedRating) || parsedRating < 0 || parsedRating > 5) {
                return res.status(status.BadRequest).json({
                    status: jsonStatus.BadRequest,
                    success: false,
                    message: "Rating must be a number between 0 and 5"
                });
            }
            updatePayload.rating = Number(parsedRating.toFixed(2));
        }

        if (ratingCount !== undefined) {
            const parsedCount = parseInt(ratingCount, 10);
            if (Number.isNaN(parsedCount) || parsedCount < 0) {
                return res.status(status.BadRequest).json({
                    status: jsonStatus.BadRequest,
                    success: false,
                    message: "ratingCount must be a positive integer"
                });
            }
            updatePayload.ratingCount = parsedCount;
        }

        const updatedStore = await Store.findByIdAndUpdate(
            id,
            updatePayload,
            { new: true, runValidators: true }
        );

        if (!updatedStore) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Store not found"
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Store rating updated",
            data: updatedStore
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('updateStoreRating', error, req, res);
    }
};

export const createStore = async (req, res) => {
    try {
        const { name, category, information, phone, address, email, directMe } = req.body;

        if (!name || !category || !information || !phone || !address || !email) {
            return res.status(400).json({ success: false, message: "All store details are required" });
        }

        // Convert Google Maps link to coordinates (optional)
        let coordinates = [77.209, 28.6139]; // Default Delhi
        if (directMe) {
            const coords = await processGoogleMapsLink(directMe);
            if (coords?.lat && coords?.lng) coordinates = [coords.lng, coords.lat];
        }

        // Create Store in DB
        const newStore = await Store.create({
            name,
            category,
            information,
            phone,
            address,
            email,
            directMe,
            location: { type: "Point", coordinates },
            createdBy: req.user._id,
            updatedBy: req.user._id,
            status: "A" // Auto-approve admin-created stores
        });

        return res.status(201).json({
            success: true,
            message: "Store created successfully with Shiprocket pickup",
            data: newStore,
        });
    } catch (error) {
        console.error("❌ Error creating store:", error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteStore = async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please provide a valid store id",
            });
        }

        const store = await Store.findById(id);
        if (!store) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Store not found",
            });
        }

        const pickupAddresses = await PickupAddress.find({ storeId: id }).lean();

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await Product.deleteMany({ storeId: id }).session(session);
                await StoreOffer.deleteMany({ storeId: id }).session(session);
                await StorePopularProduct.deleteMany({ storeId: id }).session(session);
                await Cart.deleteMany({ storeId: id }).session(session);
                await PickupAddress.deleteMany({ storeId: id }).session(session);
                await Store.deleteOne({ _id: id }).session(session);
            });
        } finally {
            session.endSession();
        }

        const pickupIdsToDelete = new Set();
        if (store.shiprocket?.pickup_address_id) {
            pickupIdsToDelete.add(store.shiprocket.pickup_address_id);
        }

        pickupAddresses.forEach((address) => {
            if (address?.shiprocket?.pickup_address_id) {
                pickupIdsToDelete.add(address.shiprocket.pickup_address_id);
            }
        });

        for (const pickupId of pickupIdsToDelete) {
            try {
                await ShiprocketService.deletePickupAddress(pickupId);
            } catch (shipError) {
                console.warn(`⚠️ Failed to delete Shiprocket pickup ${pickupId}:`, shipError.message);
            }
        }

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Store deleted successfully",
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message,
        });
        return catchError("deleteStore", error, req, res);
    }
};

export const listProducts = async (req, res) => {
    try {
        const { search } = req.query;

        const matchStage = {
            deleted: false
        };

        // Add regex search if a search term is provided
        if (search) {
            matchStage.productName = {
                $regex: search,
                $options: "i" // case-insensitive
            };
        }

        // ✅ Only show products from retailer panel stores (stores created by users with role "retailer")
        const list = await Product.aggregate([
            {
                $match: matchStage
            },
            {
                $lookup: {
                    from: "stores",
                    localField: "storeId",
                    foreignField: "_id",
                    as: "store",
                    pipeline: [
                        {
                            $lookup: {
                                from: "users",
                                localField: "createdBy",
                                foreignField: "_id",
                                as: "storeCreator",
                                pipeline: [
                                    {
                                        $project: { role: 1 }
                                    }
                                ]
                            }
                        },
                        {
                            $addFields: {
                                creatorRole: { $arrayElemAt: ["$storeCreator.role", 0] }
                            }
                        },
                        {
                            $match: {
                                creatorRole: "retailer" // Only stores created by retailers
                            }
                        }
                    ]
                }
            },
            {
                $match: {
                    "store.0": { $exists: true } // Only products from retailer stores
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
        return catchError('listProducts', error, req, res);
    }
};

export const listSellerProducts = async (req, res) => {
    try {
        const { search } = req.query;

        const matchStage = {
            deleted: false
        };

        // Add regex search if a search term is provided
        if (search) {
            matchStage.productName = {
                $regex: search,
                $options: "i" // case-insensitive
            };
        }

        // ✅ Only show products from seller panel stores (stores created by users with role "seller")
        const list = await Product.aggregate([
            {
                $match: matchStage
            },
            {
                $lookup: {
                    from: "stores",
                    localField: "storeId",
                    foreignField: "_id",
                    as: "store",
                    pipeline: [
                        {
                            $lookup: {
                                from: "users",
                                localField: "createdBy",
                                foreignField: "_id",
                                as: "storeCreator",
                                pipeline: [
                                    {
                                        $project: { role: 1 }
                                    }
                                ]
                            }
                        },
                        {
                            $addFields: {
                                creatorRole: { $arrayElemAt: ["$storeCreator.role", 0] }
                            }
                        },
                        {
                            $match: {
                                creatorRole: "seller" // Only stores created by sellers
                            }
                        }
                    ]
                }
            },
            {
                $match: {
                    "store.0": { $exists: true } // Only products from seller stores
                }
            },
            {
                $lookup: {
                    from: "product_categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "category",
                    pipeline: [
                        {
                            $project: {
                                name: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: "product_sub_categories",
                    localField: "subCategoryId",
                    foreignField: "_id",
                    as: "subCategory",
                    pipeline: [
                        {
                            $project: {
                                name: 1
                            }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    categoryName: { $arrayElemAt: ["$category.name", 0] },
                    subCategoryName: { $arrayElemAt: ["$subCategory.name", 0] },
                    storeName: { $arrayElemAt: ["$store.name", 0] }
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list, totalCount: list.length });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listSellerProducts', error, req, res);
    }
};

export const productDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const productDetails = await Product.aggregate([
            {
                $match: {
                    _id: new ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: "stores",
                    localField: "storeId",
                    foreignField: "_id",
                    as: "store",
                    pipeline: [
                        {
                            $project: {
                                name: 1,
                                createdBy: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: "product_categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "category",
                    pipeline: [
                        {
                            $project: {
                                name: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: "product_sub_categories",
                    localField: "subCategoryId",
                    foreignField: "_id",
                    as: "subCategory",
                    pipeline: [
                        {
                            $project: {
                                name: 1
                            }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    storeName: { $arrayElemAt: ["$store.name", 0] },
                    categoryName: { $arrayElemAt: ["$category.name", 0] },
                    subCategoryName: { $arrayElemAt: ["$subCategory.name", 0] }
                }
            }
        ]);

        if (!productDetails || productDetails.length === 0) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found" });
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: productDetails[0] });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('productDetails', error, req, res);
    }
};

// ================== ADMIN SELF STORE & PRODUCTS ==================

export const getAdminStore = async (req, res) => {
    try {
        const adminId = req.user._id;
        const store = await Store.findOne({ createdBy: adminId, type: "admin", deleted: { $ne: true } }).lean();
        return res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: store });
    } catch (error) {
        return catchError("getAdminStore", error, req, res);
    }
};

export const upsertAdminStore = async (req, res) => {
    try {
        const adminId = req.user._id;
        const {
            name,
            category,
            information,
            phone,
            address,
            email,
            directMe,
            city,
            state,
            pincode,
        } = req.body;

        let store = await Store.findOne({ createdBy: adminId, type: "admin", deleted: { $ne: true } });

        // gather images
        let images = store?.images || [];
        if (req.files && req.files.length) {
            images = req.files.map((f) => f.location || f.key).filter(Boolean);
        }
        const coverImage = images[0] || store?.coverImage || "";

        // coordinates
        let coordinates = store?.location?.coordinates || [77.209, 28.6139];
        if (directMe) {
            try {
                const coords = await processGoogleMapsLink(directMe);
                if (coords?.lat && coords?.lng) coordinates = [coords.lng, coords.lat];
            } catch (e) { /* ignore */ }
        }

        if (!store) {
            store = await Store.create({
                name,
                category,
                information,
                phone,
                address,
                email,
                directMe,
                city,
                state,
                pincode,
                images,
                coverImage,
                location: { type: "Point", coordinates },
                createdBy: adminId,
                updatedBy: adminId,
                type: "admin",
                onboardingCompleted: true,
                status: "A",
            });
        } else {
            store.name = name ?? store.name;
            store.category = category ?? store.category;
            store.information = information ?? store.information;
            store.phone = phone ?? store.phone;
            store.address = address ?? store.address;
            store.email = email ?? store.email;
            store.directMe = directMe ?? store.directMe;
            store.city = city ?? store.city;
            store.state = state ?? store.state;
            store.pincode = pincode ?? store.pincode;
            store.images = images;
            store.coverImage = coverImage;
            store.location = { type: "Point", coordinates };
            store.type = "admin";
            store.status = store.status || "A";
            store.updatedBy = adminId;
            await store.save();
        }

        return res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: store });
    } catch (error) {
        return catchError("upsertAdminStore", error, req, res);
    }
};

export const deleteAdminStore = async (req, res) => {
    try {
        const adminId = req.user._id;
        await Store.updateOne({ createdBy: adminId, type: "admin" }, { $set: { deleted: true } });
        return res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Admin store deleted" });
    } catch (error) {
        return catchError("deleteAdminStore", error, req, res);
    }
};

const flattenUploads = (files = []) => {
    const list = Array.isArray(files) ? files : [];
    return list.map((f) => f.location || f.key).filter(Boolean);
};

export const listAdminProducts = async (req, res) => {
    try {
        const adminId = req.user._id;
        const { search = "", storeId } = req.query;
        const store = await Store.findOne({ createdBy: adminId, type: "admin", deleted: { $ne: true } }).lean();
        if (!store) {
            return res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: [] });
        }
        const match = {
            createdBy: new ObjectId(adminId),
            type: "admin",
            deleted: { $ne: true },
        };
        if (storeId) {
            match.storeId = new ObjectId(storeId);
        } else {
            match.storeId = store._id;
        }
        if (search) {
            match.$or = [
                { name: { $regex: search, $options: "i" } },
                { productName: { $regex: search, $options: "i" } },
            ];
        }
        const list = await Product.find(match)
            .populate("storeId", "name")
            .sort({ createdAt: -1 })
            .lean();
        return res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        return catchError("listAdminProducts", error, req, res);
    }
};

export const createAdminProduct = async (req, res) => {
    try {
        const adminId = req.user._id;
        const store = await Store.findOne({ createdBy: adminId, type: "admin", deleted: { $ne: true } });
        if (!store) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Admin store not found. Create store first." });
        }
        const { name, productName, description, price, mrp, sellingPrice, stock, categoryId } = req.body;
        const images = flattenUploads(req.files);
        const product = await Product.create({
            name: name || productName,
            productName: productName || name,
            description,
            price: Number(price) || 0,
            mrp: Number(mrp) || Number(price) || 0,
            sellingPrice: Number(sellingPrice) || Number(price) || 0,
            stock: Number(stock) || 0,
            totalStock: Number(stock) || 0,
            categoryId: categoryId && ObjectId.isValid(categoryId) ? new ObjectId(categoryId) : undefined,
            images,
            primaryImage: images[0] || "",
            storeId: store._id,
            createdBy: adminId,
            type: "admin",
            source: "admin",
            deleted: false,
        });
        return res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: product });
    } catch (error) {
        return catchError("createAdminProduct", error, req, res);
    }
};

export const updateAdminProduct = async (req, res) => {
    try {
        const adminId = req.user._id;
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Invalid product id" });
        }
        const product = await Product.findOne({ _id: new ObjectId(id), createdBy: adminId, type: "admin", deleted: { $ne: true } });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found" });
        }
        const { name, productName, description, price, mrp, sellingPrice, stock, categoryId } = req.body;
        const images = flattenUploads(req.files);
        if (name) product.name = name;
        if (productName) product.productName = productName;
        if (description) product.description = description;
        if (price !== undefined) product.price = Number(price) || 0;
        if (mrp !== undefined) product.mrp = Number(mrp) || product.price;
        if (sellingPrice !== undefined) product.sellingPrice = Number(sellingPrice) || product.price;
        if (stock !== undefined) {
            product.stock = Number(stock) || 0;
            product.totalStock = Number(stock) || 0;
        }
        if (categoryId && ObjectId.isValid(categoryId)) product.categoryId = new ObjectId(categoryId);
        if (images.length) {
            product.images = images;
            product.primaryImage = images[0];
        }
        await product.save();
        return res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: product });
    } catch (error) {
        return catchError("updateAdminProduct", error, req, res);
    }
};

export const deleteAdminProduct = async (req, res) => {
    try {
        const adminId = req.user._id;
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Invalid product id" });
        }
        await Product.updateOne({ _id: new ObjectId(id), createdBy: adminId, type: "admin" }, { $set: { deleted: true } });
        return res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Product deleted" });
    } catch (error) {
        return catchError("deleteAdminProduct", error, req, res);
    }
};

export const acceptProduct = async (req, res) => {
    try {
        const { product } = req.body

        const findProduct = await Product.findById(product);
        if (!findProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found" });
        }

        await Product.findByIdAndUpdate(product, { updatedBy: req.user._id, status: "A" }, { new: true, runValidators: true });

        // Send notification to retailer
        try {
            const { notifyProductApproved } = await import('../helper/notificationHelper.js');
            await notifyProductApproved(findProduct.createdBy, findProduct);
        } catch (notifError) {
            console.error('Error sending product approval notification:', notifError);
            // Continue even if notification fails
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Product accepted" });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('acceptProduct', error, req, res);
    }
};

export const rejectProduct = async (req, res) => {
    try {
        const { product, reason } = req.body

        const findProduct = await Product.findById(product);
        if (!findProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found" });
        }

        await Product.findByIdAndUpdate(product, { updatedBy: req.user._id, status: "R" }, { new: true, runValidators: true });

        // Send notification to retailer
        try {
            const { notifyProductRejected } = await import('../helper/notificationHelper.js');
            await notifyProductRejected(findProduct.createdBy, findProduct, reason || '');
        } catch (notifError) {
            console.error('Error sending product rejection notification:', notifError);
            // Continue even if notification fails
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Product rejected" });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('rejectProduct', error, req, res);
    }
};

export const deleteLocalProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please provide a valid product id",
            });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Product not found",
            });
        }

        await Product.findByIdAndUpdate(
            id,
            { deleted: true, updatedBy: req.user._id },
            { new: true, runValidators: true }
        );

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Product deleted successfully",
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message,
        });
        return catchError("deleteLocalProduct", error, req, res);
    }
};

export const createCouponCode = async (req, res) => {
    try {

        let newCouponCode = new CouponCode({ ...req.body, createdBy: req.user._id });
        newCouponCode = await newCouponCode.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: newCouponCode });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createCouponCode', error, req, res);
    }
};

export const updateCouponCode = async (req, res) => {
    try {

        const { id } = req.params;

        const findCoupon = await CouponCode.findById(id);
        if (!findCoupon) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Coupon not found" });
        }

        const updateCouponCode = await CouponCode.findByIdAndUpdate(id, { ...req.body, createdBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: updateCouponCode });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('updateCouponCode', error, req, res);
    }
};

export const deleteCouponCode = async (req, res) => {
    try {

        const { id } = req.params;

        const findCoupon = await CouponCode.findById(id);
        if (!findCoupon) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Coupon not found" });
        }

        if (findCoupon.deleted) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Coupon Code already deleted" });
        }

        await CouponCode.findByIdAndUpdate(id, { deleted: true }, { new: true, runValidators: true });

        res.status(status.Deleted).json({ status: jsonStatus.Deleted, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteCouponCode', error, req, res);
    }
};

export const listCouponCode = async (req, res) => {
    try {
        const list = await CouponCode.find({ deleted: false }).sort({ createdAt: -1 });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listCouponCode', error, req, res);
    }
};

export const createMembership = async (req, res) => {
    try {
        let newMembership = new PremiumMembership({ createdBy: req.user._id, updatedBy: req.user._id, price: 599, perMonth: 3 });
        newMembership = await newMembership.save();

        res.status(status.Create).json({ status: jsonStatus.Create });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createMembership', error, req, res);
    }
};

export const updateMembership = async (req, res) => {
    try {
        const { id } = req.params;

        let update = await PremiumMembership.findByIdAndUpdate(id, { ...req.body, updatedBy: req.user._id });

        res.status(status.OK).json({ status: jsonStatus.OK });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('updateMembership', error, req, res);
    }
};

export const getMembershipDetails = async (req, res) => {
    try {

        let details = await PremiumMembership.find();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: details[0] || {} });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getMembershipDetails', error, req, res);
    }
};

export const listUsers = async (req, res) => {
    try {
        const { search } = req.query;
        let query = {
            role: "user"
        };

        // Add search functionality
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: users
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('listUsers', error, req, res);
    }
};

export const userDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Get user details
        const user = await User.findById(id).select('-password');
        if (!user) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "User not found"
            });
        }

        // Get user's orders
        const orders = await Order.find({ createdBy: id })
            .sort({ createdAt: -1 });

        // Get user's payments
        const payments = await Payment.find({ userId: id })
            .sort({ createdAt: -1 });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                user,
                recentOrders: orders,
                recentPayments: payments
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('userDetails', error, req, res);
    }
};

export const inActiveUserDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { activeStatus } = req.body;

        if (typeof activeStatus !== "boolean") {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Something wrong with delete status"
            });
        }

        // Get user details
        const user = await User.findById(id).select('-password');
        if (!user) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "User not found"
            });
        }

        await User.findByIdAndUpdate(id, { active: activeStatus }, { new: true, runValidators: true });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('inActiveUserDetails', error, req, res);
    }
};

export const listPayments = async (req, res) => {
    try {

        const payments = await Payment.find().sort({ createdAt: -1 });

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Payments retrieved successfully",
            data: payments
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listPayments', error, req, res);
    }
};

export const paymentDetails = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid payment ID"
            });
        }

        const payment = await Payment.findById(id);

        if (!payment) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Payment not found"
            });
        }

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Payment details retrieved successfully",
            data: payment
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('paymentDetails', error, req, res);
    }
};

export const listLocalStoreOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .sort({ createdAt: -1 });

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Local store orders retrieved successfully",
            data: orders
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listLocalStoreOrders', error, req, res);
    }
};

export const localStoreOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid order ID"
            });
        }

        const order = await Order.findById(id)
            .populate('createdBy', 'name email phone')
            .populate('storeId', 'name phone address')
            .populate('productDetails.productId', 'productName productImage');

        if (!order) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found"
            });
        }

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Order details retrieved successfully",
            data: order
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('localStoreOrderDetails', error, req, res);
    }
};

export const listOnlineOrders = async (req, res) => {
    try {
        const orders = await OnlineOrder.find()
            .sort({ createdAt: -1 });

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Online orders retrieved successfully",
            data: orders
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listOnlineOrders', error, req, res);
    }
};

export const onlineOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid order ID"
            });
        }

        // Use aggregation to get complete order details with proper population
        const order = await OnlineOrder.aggregate([
            {
                $match: {
                    _id: new ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                $unwind: {
                    path: '$userDetails',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $unwind: {
                    path: '$productDetails',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'online_products',
                    localField: 'productDetails.productId',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            {
                $unwind: {
                    path: '$productInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    'productDetails.productName': '$productInfo.name',
                    'productDetails.productImages': '$productInfo.images',
                    'productDetails.manufacturer': '$productInfo.manufacturer',
                    'productDetails.information': '$productInfo.information'
                }
            },
            {
                $group: {
                    _id: '$_id',
                    createdBy: { $first: '$userDetails' },
                    cf_order_id: { $first: '$cf_order_id' },
                    invoiceUrl: { $first: '$invoiceUrl' },
                    address: { $first: '$address' },
                    orderId: { $first: '$orderId' },
                    status: { $first: '$status' },
                    isReturn: { $first: '$isReturn' },
                    returnStatus: { $first: '$returnStatus' },
                    paymentStatus: { $first: '$paymentStatus' },
                    estimatedDate: { $first: '$estimatedDate' },
                    deliverdTime: { $first: '$deliverdTime' },
                    summary: { $first: '$summary' },
                    refund: { $first: '$refund' },
                    refundId: { $first: '$refundId' },
                    isPremiumPurchase: { $first: '$isPremiumPurchase' },
                    createdAt: { $first: '$createdAt' },
                    updatedAt: { $first: '$updatedAt' },
                    productDetails: {
                        $push: {
                            $cond: [
                                { $ne: ['$productDetails.productId', null] },
                                '$productDetails',
                                '$$REMOVE'
                            ]
                        }
                    }
                }
            }
        ]);

        if (!order || order.length === 0) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found"
            });
        }

        const orderData = order[0];

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Order details retrieved successfully",
            data: orderData
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('onlineOrderDetails', error, req, res);
    }
};

export const getOnlineReturnOrder = async (req, res) => {
    try {
        const orders = await OnlineOrder.find({
            isReturn: "true"
        }).sort({ createdAt: -1 });

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Online orders retrieved successfully",
            data: orders
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listOnlineOrders', error, req, res);
    }
}

export const getReturnOrderDetails = async (req, res) => {
     try {

        const { id } = req.params;

        const isOrder = await Return.findOne({
            order: id
        });

        if(!isOrder) {
             return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid Order ID"
            });
        }

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Online orders return details retrieved successfully",
            data: isOrder
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listOnlineOrders', error, req, res);
    }
}

export const returnAdminChangeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { ReturnStatus } = req.body;

    if (!ReturnStatus) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Refund status can't be empty",
      });
    }

    const statusArr = ["Approved", "Rejected", "PickedUp", "Success"];

    if (!statusArr.includes(ReturnStatus)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please enter valid refund status status",
      });
    }

    const isOrder = await OnlineOrder.findById(id);
    if (!isOrder) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Order not found",
      });
    }

    let changeReturnStatus = {};

    if (ReturnStatus === "Approved") {        
      changeReturnStatus = await OnlineOrder.findByIdAndUpdate(
        id,
        { returnStatus: ReturnStatus },
        { new: true, runValidators: true }
      );
    } else if (ReturnStatus === "Rejected") {
      changeReturnStatus = await OnlineOrder.findByIdAndUpdate(
        id,
        { returnStatus: ReturnStatus },
        { new: true, runValidators: true }
      );
    } else if (ReturnStatus === "PickedUp") {
      changeReturnStatus = await OnlineOrder.findByIdAndUpdate(
        id,
        { returnStatus: ReturnStatus },
        { new: true, runValidators: true }
      );
    } else if (ReturnStatus === "Success") {
      const paymentResponse = await Payment.findOne({ orderId: id });   

      console.log(paymentResponse);

      const refundId = `REFUND_${Date.now()}`;
      const refund = await axios.post(
        `${process.env.CF_CREATE_PRODUCT_URL}/${paymentResponse.paymentResonse.order.order_id}/refunds`,
        {
          refund_amount: isOrder.summary.grandTotal,
          refund_id: refundId,
        },
        {
          headers: {
            "x-api-version": "2023-08-01",
            "x-client-id": process.env.CF_CLIENT_ID,
            "x-client-secret": process.env.CF_CLIENT_SECRET,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(refund);
      

      let newRefund = new Refund({
        type: "LocalStore",
        cfOrderId: isOrder.cf_order_id,
        cfOrderResponseId: paymentResponse.paymentResonse.order.order_id,
        refundResponse: refund.data,
        userId: req.user._id,
        orderId: isOrder._id,
        amount: isOrder.summary.grandTotal,
        refundId,
        rejected: true,
        retailerId: req.user._id,
      });
      newRefund = await newRefund.save();

      await Payment.findByIdAndUpdate(paymentResponse._id, {
        refund: true,
        refundId,
      });

    await OnlineOrder.findByIdAndUpdate(
        id,
        { returnStatus: ReturnStatus, refund: true, refundId },
        { new: true, runValidators: true }
      );
    }

    res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: changeReturnStatus });

  } catch (error) {
    console.error("error", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    // return catchError("refundChangeStatus", error, req, res);
  }
};

// ==================== ADMIN OFFERS APIs ====================

export const createOffer = async (req, res) => {
    try {
        const { title, description, image, isGlobal, storeId } = req.body;

        if (!title || !description) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Title and description are required"
            });
        }

        // Validate storeId if not global
        if (!isGlobal && !storeId) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Store ID is required when offer is not global"
            });
        }

        // Check if store exists (if not global)
        if (!isGlobal && storeId) {
            const store = await Store.findById(storeId);
            if (!store) {
                return res.status(status.NotFound).json({
                    status: jsonStatus.NotFound,
                    success: false,
                    message: "Store not found"
                });
            }
        }

        const newOffer = new Offer({
            title: title.trim(),
            description: description.trim(),
            image: image || null,
            isGlobal: isGlobal !== undefined ? isGlobal : true,
            storeId: isGlobal ? null : storeId,
            createdBy: req.user._id
        });

        const savedOffer = await newOffer.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            message: "Offer created successfully",
            data: savedOffer
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('createOffer', error, req, res);
    }
};

export const listOffers = async (req, res) => {
    try {
        const offers = await Offer.find({})
            .populate('storeId', 'name')
            .populate('createdBy', 'email')
            .sort({ createdAt: -1 });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: offers
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('listOffers', error, req, res);
    }
};

export const updateOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, image, isGlobal, storeId } = req.body;

        const offer = await Offer.findById(id);
        if (!offer) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Offer not found"
            });
        }

        // Validate storeId if not global
        if (!isGlobal && !storeId) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Store ID is required when offer is not global"
            });
        }

        // Check if store exists (if not global)
        if (!isGlobal && storeId) {
            const store = await Store.findById(storeId);
            if (!store) {
                return res.status(status.NotFound).json({
                    status: jsonStatus.NotFound,
                    success: false,
                    message: "Store not found"
                });
            }
        }

        offer.title = title ? title.trim() : offer.title;
        offer.description = description ? description.trim() : offer.description;
        if (image !== undefined) offer.image = image;
        if (isGlobal !== undefined) offer.isGlobal = isGlobal;
        if (isGlobal) {
            offer.storeId = null;
        } else {
            offer.storeId = storeId || offer.storeId;
        }
        offer.updatedBy = req.user._id;

        const updatedOffer = await offer.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Offer updated successfully",
            data: updatedOffer
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('updateOffer', error, req, res);
    }
};

export const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;

        const offer = await Offer.findById(id);
        if (!offer) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Offer not found"
            });
        }

        await Offer.findByIdAndDelete(id);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Offer deleted successfully"
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('deleteOffer', error, req, res);
    }
};

// ==================== ADMIN WELCOME IMAGE APIs ====================

export const getWelcomeImage = async (req, res) => {
    try {
        // Get the latest welcome image
        const welcomeImage = await WelcomeImage.findOne({})
            .sort({ createdAt: -1 })
            .populate('createdBy', 'email');

        if (!welcomeImage) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                data: null,
                message: "No welcome image found"
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: welcomeImage
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getWelcomeImage', error, req, res);
    }
};

export const uploadWelcomeImage = async (req, res) => {
    try {
        const { imagePath } = req.body;

        if (!imagePath) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Image path is required"
            });
        }

        // Delete old welcome images
        await WelcomeImage.deleteMany({});

        // Create new welcome image
        const newWelcomeImage = new WelcomeImage({
            imagePath: imagePath.trim(),
            createdBy: req.user._id,
            updatedBy: req.user._id
        });

        const savedImage = await newWelcomeImage.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            message: "Welcome image uploaded successfully",
            data: savedImage
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('uploadWelcomeImage', error, req, res);
    }
};

export const deleteWelcomeImage = async (req, res) => {
    try {
        await WelcomeImage.deleteMany({});

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Welcome image removed successfully"
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('deleteWelcomeImage', error, req, res);
    }
};

// ==================== ADMIN POPULAR PRODUCTS API ====================

export const saveStorePopularProducts = async (req, res) => {
    try {
        const { storeId } = req.params;
        const { productIds } = req.body;

        // Validate input
        if (!Array.isArray(productIds)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please provide a valid array of Product IDs."
            });
        }

        // Validate store exists (admin can manage any store)
        const store = await Store.findById(storeId);
        if (!store) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Store not found"
            });
        }

        // Check if products exist (optional validation - admin can add any products)
        if (productIds.length > 0) {
            const products = await Product.find({
                _id: { $in: productIds }
            });

            if (products.length !== productIds.length) {
                return res.status(status.NotFound).json({
                    status: jsonStatus.NotFound,
                    success: false,
                    message: "Some products were not found"
                });
            }
        }

        // Remove old popular products for this store (admin can manage any store)
        await StorePopularProduct.deleteMany({ storeId });

        // Create new popular product documents
        if (productIds.length > 0) {
            const popularProductDocs = productIds.map(productId => ({
                productId,
                storeId,
                createdBy: store.createdBy // Keep original store owner as createdBy
            }));

            await StorePopularProduct.insertMany(popularProductDocs);
        }

        // Fetch updated popular products
        const updatedPopularProducts = await StorePopularProduct.find({ storeId })
            .populate('productId');

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            message: "Popular products saved successfully",
            data: updatedPopularProducts
        });
    } catch (error) {
        console.error("Error in saveStorePopularProducts:", error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('saveStorePopularProducts', error, req, res);
    }
};

// Helper endpoint to sync existing seller products to OnlineProduct
export const syncSellerProductsToOnline = async (req, res) => {
    try {
        // Get all sellers
        const sellers = await User.find({ role: "seller", deleted: false }).select("_id");
        const sellerIds = sellers.map(seller => seller._id);

        if (sellerIds.length === 0) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                message: "No sellers found",
                data: { synced: 0, skipped: 0, failed: 0 }
            });
        }

        // Get all seller products with categoryId and subCategoryId
        const products = await Product.find({
            createdBy: { $in: sellerIds },
            deleted: false,
            categoryId: { $exists: true, $ne: null },
            subCategoryId: { $exists: true, $ne: null }
        });

        let synced = 0;
        let skipped = 0;
        let failed = 0;

        for (const product of products) {
            try {
                // Check if OnlineProduct already exists
                const existingOnlineProduct = await OnlineProduct.findOne({
                    createdBy: product.createdBy,
                    name: product.productName,
                    manufacturer: product.companyName
                }).sort({ createdAt: -1 });

                if (existingOnlineProduct) {
                    skipped++;
                    continue;
                }

                // Create OnlineProduct
                const onlineProductPayload = {
                    name: product.productName,
                    information: product.information,
                    manufacturer: product.companyName,
                    images: product.productImages || [],
                    details: product.details || [],
                    categoryId: product.categoryId,
                    subCategoryId: product.subCategoryId,
                    createdBy: product.createdBy,
                    updatedBy: product.createdBy,
                };

                const onlineProduct = await OnlineProduct.create(onlineProductPayload);

                // Create primary unit
                const primaryUnit = product.units && product.units.length > 0 
                    ? product.units[0] 
                    : {
                        qty: product.qty || "1",
                        mrp: product.mrp,
                        sellingPrice: product.sellingPrice,
                        offPer: product.offPer
                    };

                const unitPayload = {
                    qty: primaryUnit.qty || "1",
                    mrp: primaryUnit.mrp || product.mrp,
                    sellingPrice: primaryUnit.sellingPrice || product.sellingPrice,
                    offPer: primaryUnit.offPer || product.offPer,
                    parentProduct: onlineProduct._id,
                };

                await ProductUnitOnline.create(unitPayload);
                synced++;
            } catch (err) {
                console.error(`Failed to sync product ${product._id}:`, err.message);
                failed++;
            }
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: `Sync completed: ${synced} synced, ${skipped} skipped, ${failed} failed`,
            data: { synced, skipped, failed, total: products.length }
        });
    } catch (error) {
        console.error("Error in syncSellerProductsToOnline:", error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('syncSellerProductsToOnline', error, req, res);
    }
};

// ✅ Fix Purse Products Category - Move from Clothes to Cosmetics
export const fixPurseProductsCategory = async (req, res) => {
    try {
        // Find "Clothes" and "Cosmetics" categories
        const clothesCategory = await ProductCategory.findOne({ 
            name: { $regex: /^clothes?$/i }, 
            deleted: false 
        });
        const cosmeticsCategory = await ProductCategory.findOne({ 
            name: { $regex: /^cosmetics?$/i }, 
            deleted: false 
        });

        if (!clothesCategory) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Clothes category not found"
            });
        }

        if (!cosmeticsCategory) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Cosmetics category not found"
            });
        }

        // Find all subcategories under Clothes category
        const ProductSubCategory = mongoose.model('product_sub_category');
        const clothesSubCategories = await ProductSubCategory.find({
            categoryId: clothesCategory._id,
            deleted: false
        });

        const clothesSubCategoryIds = clothesSubCategories.map(sc => sc._id);

        // Find products with "purse" in name that are in Clothes category
        const purseProducts = await OnlineProduct.find({
            categoryId: clothesCategory._id,
            name: { $regex: /purse|handbag|wallet|clutch/i },
            deleted: false
        });

        // Also find products in Clothes subcategories that might be purses
        const purseProductsInSubCategories = await OnlineProduct.find({
            subCategoryId: { $in: clothesSubCategoryIds },
            name: { $regex: /purse|handbag|wallet|clutch/i },
            deleted: false
        });

        const allPurseProducts = [...purseProducts, ...purseProductsInSubCategories];
        const uniquePurseProducts = Array.from(
            new Map(allPurseProducts.map(p => [p._id.toString(), p])).values()
        );

        // Find Cosmetics subcategories to assign purse products
        const cosmeticsSubCategories = await ProductSubCategory.find({
            categoryId: cosmeticsCategory._id,
            deleted: false
        }).sort({ createdAt: 1 }); // Get first available subcategory

        if (cosmeticsSubCategories.length === 0) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "No subcategories found in Cosmetics category. Please create a subcategory first."
            });
        }

        const defaultCosmeticsSubCategory = cosmeticsSubCategories[0];

        // Update products to Cosmetics category
        let updated = 0;
        let failed = 0;

        for (const product of uniquePurseProducts) {
            try {
                await OnlineProduct.findByIdAndUpdate(product._id, {
                    categoryId: cosmeticsCategory._id,
                    subCategoryId: defaultCosmeticsSubCategory._id,
                    updatedBy: req.user._id
                });
                updated++;
            } catch (err) {
                console.error(`Failed to update product ${product._id}:`, err);
                failed++;
            }
        }

        // Also update local products (Product model) if they exist
        const localPurseProducts = await Product.find({
            categoryId: clothesCategory._id,
            productName: { $regex: /purse|handbag|wallet|clutch/i },
            deleted: false
        });

        for (const product of localPurseProducts) {
            try {
                await Product.findByIdAndUpdate(product._id, {
                    categoryId: cosmeticsCategory._id,
                    subCategoryId: defaultCosmeticsSubCategory._id,
                    updatedBy: req.user._id
                });
                updated++;
            } catch (err) {
                console.error(`Failed to update local product ${product._id}:`, err);
                failed++;
            }
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: `Successfully moved ${updated} purse products from Clothes to Cosmetics category`,
            data: {
                updated,
                failed,
                total: uniquePurseProducts.length + localPurseProducts.length,
                cosmeticsCategory: {
                    _id: cosmeticsCategory._id,
                    name: cosmeticsCategory.name
                },
                defaultSubCategory: {
                    _id: defaultCosmeticsSubCategory._id,
                    name: defaultCosmeticsSubCategory.name
                }
            }
        });
    } catch (error) {
        console.error("Error in fixPurseProductsCategory:", error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('fixPurseProductsCategory', error, req, res);
    }
};

/* ===========================
    APP THEME SETTINGS APIs
=========================== */

// Get current app theme settings (for admin panel and user app)
export const getAppThemeSettings = async (req, res) => {
    try {
        const settings = await AppSettings.getSingleton();
        
        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Theme settings fetched successfully",
            data: settings
        });
    } catch (error) {
        console.error("❌ getAppThemeSettings error:", error.message);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('getAppThemeSettings', error, req, res);
    }
};

// Update app theme settings (admin only)
export const updateAppThemeSettings = async (req, res) => {
    try {
        const adminId = req.user.id; // From authentication middleware
        const {
            primaryColor,
            secondaryColor,
            animations,
            themeColors
        } = req.body;

        // Validate primary color format (hex color)
        if (primaryColor && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(primaryColor)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid primary color format. Use hex format (e.g., #1F6728)"
            });
        }

        // Validate secondary color format if provided
        if (secondaryColor && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(secondaryColor)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid secondary color format. Use hex format (e.g., #1f67293e)"
            });
        }

        // Get current settings to merge with new ones
        const currentSettings = await AppSettings.getSingleton();
        
        // Prepare update data
        const updateData = {
            primaryColor: primaryColor || currentSettings.primaryColor,
            secondaryColor: secondaryColor || currentSettings.secondaryColor,
            animations: animations ? {
                ...currentSettings.animations,
                ...animations
            } : currentSettings.animations,
            themeColors: themeColors ? {
                ...currentSettings.themeColors,
                ...themeColors
            } : currentSettings.themeColors,
            updatedBy: adminId
        };

        // Update settings using singleton pattern
        const updatedSettings = await AppSettings.updateSettings(updateData, adminId);

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Theme settings updated successfully",
            data: updatedSettings
        });
    } catch (error) {
        console.error("❌ updateAppThemeSettings error:", error.message);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('updateAppThemeSettings', error, req, res);
    }
};
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
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { signedUrl } from '../helper/s3.config.js';
import axios from 'axios';
import ShiprocketService from '../helper/shiprocketService.js';
import { processGoogleMapsLink } from '../helper/latAndLong.js';

const { ObjectId } = mongoose.Types;

export const createAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter Credentials` });
        }

        let newAdmin = new Admin({ email, password });
        newAdmin = await newAdmin.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, message: "Admin created successfully" });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createAdmin', error, req, res);
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

        const { search } = req.query;

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
            });

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
                    localField: "_id",
                    foreignField: "storeId",
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

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: details[0] });
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

export const createStore = async (req, res) => {
    try {
        const { name, category, information, phone, address, email, directMe, city, state, pincode } = req.body;

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

        // Shiprocket Pickup Creation
        const pickupPayload = {
            pickup_location: name.replace(/\s+/g, "_").toLowerCase(),
            name,
            email,
            phone,
            address,
            city: city || "Delhi",
            state: state || "Delhi",
            country: "India",
            pin_code: pincode || "110001",
        };

        try {
            const shipResponse = await ShiprocketService.createPickupAddress(pickupPayload);
            if (shipResponse?.pickup_location || shipResponse?.id) {
                newStore.shiprocket = {
                    pickup_address_id: shipResponse.pickup_location || shipResponse.id,
                    pickup_location: pickupPayload,
                };
                await newStore.save();
            }
        } catch (err) {
            console.warn("⚠️ Shiprocket pickup creation failed:", err.message);
        }

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

        const list = await Product.aggregate([
            {
                $match: matchStage
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

export const productDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found" });
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: product });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('productDetails', error, req, res);
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

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Product accepted" });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('acceptProduct', error, req, res);
    }
};

export const rejectProduct = async (req, res) => {
    try {
        const { product } = req.body

        const findProduct = await Product.findById(product);
        if (!findProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found" });
        }

        await Product.findByIdAndUpdate(product, { updatedBy: req.user._id, status: "R" }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Product rejected" });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('rejectProduct', error, req, res);
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

        const order = await OnlineOrder.findById(id)
            .populate('createdBy', 'name email phone')
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
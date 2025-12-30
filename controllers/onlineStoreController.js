import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import mongoose from 'mongoose';
import Brand from '../models/OnlineStore/Brand.js';
import Category from '../models/OnlineStore/Category.js';
import SubCategory from '../models/OnlineStore/SubCategory.js';
import OnlineProduct from '../models/OnlineStore/OnlineProduct.js';
import ProductUnit from '../models/OnlineStore/ProductUnit.js';
import OnlineStoreCart from '../models/OnlineStore/OnlineStoreCart.js';
import Address from '../models/Address.js';
import CouponCode from '../models/CouponCode.js';
import OnlineOrder from '../models/OnlineStore/OnlineOrder.js';
import Return from '../models/Return.js'
import axios from 'axios';
import { signedUrl } from '../helper/s3.config.js';
import Payment from '../models/Payment.js';
import Refund from '../models/Refund.js';
import CoinHistory from '../models/CoinHistory.js';
import { 
    calculateCoinsEarned, 
    validateAndGetMaxCoinsUsable, 
    deductCoins,
    refundCoins,
    hasPreviousOrders 
} from '../helper/coinHelper.js';
import User from '../models/User.js';
import Admin from '../models/Admin.js';
import PopularCategory from '../models/PopularCategory.js';
import ProductSubCategory from '../models/OnlineStore/SubCategory.js';
import CouponHistory from '../models/CouponHistory.js';
import StoreCategory from '../models/StoreCategory.js';
import Product from '../models/Product.js';

const { ObjectId } = mongoose.Types;

let limit = process.env.LIMIT;
limit = limit ? Number(limit) : 10;

// Calculate Offer Percentage
const calculateOffPer = (mrp, sellingPrice) => {
    const discount = ((mrp - sellingPrice) / mrp) * 100;
    const returnedValue = discount % 1 === 0 ? discount.toFixed(0) : discount.toFixed(2);
    return `${returnedValue}`; // numeric string; UI can append "% OFF"
};

// Helper: resolve an OnlineProduct when caller might send either
// - direct OnlineProduct _id, or
// - local Product _id (retailer product)
const resolveOnlineProductByAnyId = async (id) => {
    if (!id || !ObjectId.isValid(id)) {
        return null;
    }

    // Try OnlineProduct directly first
    let onlineProduct = await OnlineProduct.findById(id);
    if (onlineProduct) {
        return onlineProduct;
    }

    // If not found, treat id as local Product _id and try to find linked OnlineProduct
    const localProduct = await Product.findById(id);
    if (!localProduct) {
        return null;
    }

    // Match by seller + name + manufacturer (same logic as sync in productController)
    onlineProduct = await OnlineProduct.findOne({
        createdBy: localProduct.createdBy,
        name: localProduct.productName,
        manufacturer: localProduct.companyName
    }).sort({ createdAt: -1 });

    return onlineProduct;
};

export const uploadBrandImage = async (req, res) => {
    try {
        signedUrl(req, res, 'online_store_brand/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadBrandImage', error, req, res);
    }
}

export const createBrand = async (req, res) => {
    try {

        let newBrand = new Brand({ ...req.body, createdBy: req.user._id });
        newBrand = await newBrand.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: newBrand });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createBrand', error, req, res);
    }
};

export const updateBrand = async (req, res) => {
    try {
        const { id } = req.params;

        const findBrand = await Brand.findById(id);
        if (!findBrand) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Brand not found" });
        }

        let updateBrand = await Brand.findByIdAndUpdate(id, { ...req.body, createdBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: updateBrand });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('updateBrand', error, req, res);
    }
};

export const deleteBrand = async (req, res) => {
    try {

        const { id } = req.params;

        const findBrand = await Brand.findById(id);
        if (!findBrand) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Brand not found" });
        }

        await Brand.findByIdAndUpdate(id, { deleted: true, createdBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.Deleted).json({ status: jsonStatus.Deleted, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteBrand', error, req, res);
    }
};

export const listBrands = async (req, res) => {
    try {

        const list = await Brand.find({ deleted: false });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listBrands', error, req, res);
    }
};

export const uploadCategoryImage = async (req, res) => {
    try {
        signedUrl(req, res, 'online_store_category/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadCategoryImage', error, req, res);
    }
}

export const createCategory = async (req, res) => {
    try {

        let newCategory = new Category({ ...req.body, createdBy: req.user._id });
        newCategory = await newCategory.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: newCategory });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createCategory', error, req, res);
    }
};

export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const findCategory = await Category.findById(id);
        if (!findCategory) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Category not found" });
        }

        let updateCategory = await Category.findByIdAndUpdate(id, { ...req.body, createdBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: updateCategory });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('updateCategory', error, req, res);
    }
};

export const deleteCategory = async (req, res) => {
    try {

        const { id } = req.params;

        const findCategory = await Category.findById(id);
        if (!findCategory) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Category not found" });
        }

        await Category.findByIdAndUpdate(id, { deleted: true, createdBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.Deleted).json({ status: jsonStatus.Deleted, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteCategory', error, req, res);
    }
};

export const listCategory = async (req, res) => {
    try {

        const list = await Category.find({ deleted: false })
            .sort({ createdAt: -1 }); // Sort by creation date, newest first

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listCategory', error, req, res);
    }
};

export const uploadSubCategoryImage = async (req, res) => {
    try {
        signedUrl(req, res, 'online_store_sub_category/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadSubCategoryImage', error, req, res);
    }
}

export const createSubCategory = async (req, res) => {
    try {

        let newSubCategory = new SubCategory({ ...req.body, createdBy: req.user._id });
        newSubCategory = await newSubCategory.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: newSubCategory });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createSubCategory', error, req, res);
    }
};

export const updateSubCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const findSubCategory = await SubCategory.findById(id);
        if (!findSubCategory) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Sub Category not found" });
        }

        let updateSubCategory = await SubCategory.findByIdAndUpdate(id, { ...req.body, createdBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: updateSubCategory });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('updateSubCategory', error, req, res);
    }
};

export const deleteSubCategory = async (req, res) => {
    try {

        const { id } = req.params;

        const findSubCategory = await SubCategory.findById(id);
        if (!findSubCategory) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Sub Category not found" });
        }

        await SubCategory.findByIdAndUpdate(id, { deleted: true, createdBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.Deleted).json({ status: jsonStatus.Deleted, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteSubCategory', error, req, res);
    }
};

export const listSubCategory = async (req, res) => {
    try {

        const list = await SubCategory.aggregate([
            {
                $match: {
                    deleted: false,
                }
            },
            {
                $lookup: {
                    from: "product_categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "productCategory"
                }
            },
            {
                $unwind: "$productCategory"
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listSubCategory', error, req, res);
    }
};

export const listSubCategoryByCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const list = await SubCategory.aggregate([
            {
                $match: {
                    deleted: false,
                    categoryId: new ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: "product_categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "productCategory"
                }
            },
            {
                $unwind: "$productCategory"
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listSubCategoryByCategory', error, req, res);
    }
};

export const uploadOnlineProductImage = async (req, res) => {
    try {
        signedUrl(req, res, 'online_product/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadOnlineProductImage', error, req, res);
    }
}

export const createProduct = async (req, res) => {
    try {

        let newProduct = new OnlineProduct({ ...req.body, createdBy: req.user._id, updatedBy: req.user._id });
        newProduct = await newProduct.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: newProduct });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createProduct', error, req, res);
    }
};

export const updateProduct = async (req, res) => {
    try {

        const { id } = req.params;
        const findProduct = await OnlineProduct.findById(id);
        if (!findProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found with this ID" });
        }

        const updatedProduct = await OnlineProduct.findByIdAndUpdate(id, { ...req.body, updatedBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: updatedProduct });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('updateProduct', error, req, res);
    }
};

export const updateOnlineProductRating = async (req, res) => {
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
                    message: "Rating must be between 0 and 5"
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

        const updatedProduct = await OnlineProduct.findByIdAndUpdate(
            id,
            updatePayload,
            { new: true, runValidators: true }
        );

        if (!updatedProduct) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Product not found"
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Product rating updated",
            data: updatedProduct
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('updateOnlineProductRating', error, req, res);
    }
};

export const deleteProduct = async (req, res) => {
    try {

        const { id } = req.params;
        const findProduct = await OnlineProduct.findById(id);
        if (!findProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found with this ID" });
        }

        await OnlineProduct.findByIdAndUpdate(id, { deleted: true, updatedBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.Deleted).json({ status: jsonStatus.Deleted, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteProduct', error, req, res);
    }
};

export const listProducts = async (req, res) => {
    try {

        const { search = "" } = req.query;
        const regex = new RegExp(search, "i");

        // Determine which creators' products to show
        // - Seller: only own products
        // - Admin/Superadmin: all seller + admin created products
        // - Others (if any): fallback to seller products
        let allowedCreatorIds = [];

        if (req?.user && req.user.role === "seller") {
            // Seller can see only their own products
            allowedCreatorIds = [req.user._id];
        } else {
            // Admin / superadmin or other roles accessing this endpoint
            const sellers = await User.find({ role: "seller", deleted: false }).select("_id");
            const admins = await Admin.find({}).select("_id");

            const sellerIds = sellers.map(seller => seller._id);
            const adminIds = admins.map(admin => admin._id);

            allowedCreatorIds = [...sellerIds, ...adminIds];
        }

        const pipeline = [
            {
                $match: {
                    deleted: false,
                    createdBy: { $in: allowedCreatorIds }
                }
            }
        ];

        // Add search filter
        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        { name: { $regex: regex } },
                        { manufacturer: { $regex: regex } }
                    ]
                }
            });
        }

        pipeline.push({
            $lookup: {
                from: "product_units",
                localField: "_id",
                foreignField: "parentProduct",
                as: "units",
                pipeline: [
                    {
                        $match: {
                            deleted: false
                        }
                    }
                ]
            }
        });

        // Add helpful fields for UI (full units array + primaryUnit for quick display)
        pipeline.push({
            $addFields: {
                primaryUnit: { $arrayElemAt: ["$units", 0] }
            }
        });

        // ✅ Identify product creator type (seller vs admin) for UI filtering
        pipeline.push(
            {
                $lookup: {
                    from: "users",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "creatorUser",
                    pipeline: [{ $project: { role: 1 } }]
                }
            },
            {
                $lookup: {
                    from: "admins",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "creatorAdmin",
                    pipeline: [{ $project: { _id: 1 } }]
                }
            },
            {
                $addFields: {
                    creatorType: {
                        $cond: [
                            { $gt: [{ $size: "$creatorAdmin" }, 0] },
                            "admin",
                            {
                                $cond: [
                                    {
                                        $eq: [
                                            { $ifNull: [{ $arrayElemAt: ["$creatorUser.role", 0] }, null] },
                                            "seller"
                                        ]
                                    },
                                    "seller",
                                    "unknown"
                                ]
                            }
                        ]
                    }
                }
            }
        );

        // ✅ Attach all-time delivered order counts for automatic trending
        pipeline.push({
            $lookup: {
                from: "online_orders",
                let: { onlinePid: "$_id" }, // $$onlinePid is the OnlineProduct _id
                as: "orderStats",
                pipeline: [
                    { $match: { status: "Delivered" } },
                    { $unwind: "$productDetails" },
                    {
                        $lookup: {
                            from: "products",
                            localField: "productDetails.productId",
                            foreignField: "_id",
                            as: "localProduct"
                        }
                    },
                    { $unwind: "$localProduct" },
                    {
                        $match: {
                            $expr: { $eq: ["$localProduct.onlineProductId", "$$onlinePid"] }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            orderCount: { $sum: 1 },
                            totalQuantity: { $sum: "$productDetails.quantity" }
                        }
                    }
                ]
            }
        });

        pipeline.push({
            $addFields: {
                orderCount: {
                    $ifNull: [{ $arrayElemAt: ["$orderStats.orderCount", 0] }, 0]
                },
                totalQuantity: {
                    $ifNull: [{ $arrayElemAt: ["$orderStats.totalQuantity", 0] }, 0]
                }
            }
        });

        // No manual flag: trending comes from orders (all-time)
        pipeline.push({
            $addFields: {
                autoTrending: { $gt: ["$orderCount", 0] }
            }
        });

        // Remove helper array
        pipeline.push({
            $project: { orderStats: 0, creatorUser: 0, creatorAdmin: 0 }
        });

        const list = await OnlineProduct.aggregate(pipeline);

        // Debug: Log the pipeline and results
        console.log("📦 Online Products Query:", {
            totalProducts: list.length,
            searchTerm: search,
            userRole: req?.user?.role,
            allowedCreatorIdsCount: allowedCreatorIds.length,
            sampleProduct: list.length > 0 ? {
                id: list[0]._id,
                name: list[0].name,
                createdBy: list[0].createdBy
            } : null
        });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        console.error("❌ Error in listProducts:", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listProducts', error, req, res);
    }
};

export const adminProductDetails = async (req, res) => {
    try {

        const { id } = req.params;

        const details = await OnlineProduct.aggregate([
            {
                $match: {
                    _id: new ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: "product_units",
                    localField: "_id",
                    foreignField: "parentProduct",
                    as: "productUnits",
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
                    from: "product_sub_categories",
                    localField: "subCategoryId",
                    foreignField: "_id",
                    as: "subCategory"
                }
            },
            {
                $lookup: {
                    from: "product_brands",
                    localField: "brandId",
                    foreignField: "_id",
                    as: "productBrand"
                }
            },
            {
                $lookup: {
                    from: "product_categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "productCategory"
                }
            },
            {
                $addFields: {
                    subCategory: { $arrayElemAt: ["$subCategory", 0] },
                    productBrand: { $arrayElemAt: ["$productBrand", 0] },
                    productCategory: { $arrayElemAt: ["$productCategory", 0] },
                    units: "$productUnits",
                    primaryUnit: { $arrayElemAt: ["$productUnits", 0] }
                }
            }
        ]);
        if (!details[0]) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found with this ID" });
        }

        // If variants are missing (common for older seller-synced products),
        // attach them from the linked local Product document.
        try {
            const hasVariants =
                (details[0].variantTemplate && String(details[0].variantTemplate).trim().length) ||
                (Array.isArray(details[0].variantGroups) && details[0].variantGroups.length);

            if (!hasVariants) {
                const linkedLocalProduct = await Product.findOne({
                    createdBy: details[0].createdBy,
                    productName: details[0].name,
                    companyName: details[0].manufacturer
                })
                    .select("variantTemplate variantGroups")
                    .lean();

                if (linkedLocalProduct) {
                    details[0].variantTemplate = linkedLocalProduct.variantTemplate || null;
                    details[0].variantGroups = Array.isArray(linkedLocalProduct.variantGroups)
                        ? linkedLocalProduct.variantGroups
                        : [];
                }
            }
        } catch (variantErr) {
            console.warn("⚠️ Failed to attach variant groups in admin product details:", variantErr?.message || variantErr);
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: details[0]
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('adminProductDetails', error, req, res);
    }
};

export const createProductUnit = async (req, res) => {
    try {

        const { qty, mrp, sellingPrice, parentProduct } = req.body;
        const offPer = calculateOffPer(mrp, sellingPrice);

        const unit = await ProductUnit.create({ qty, mrp, sellingPrice, offPer, parentProduct });

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: unit });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createProductUnit', error, req, res);
    }
};

export const updateProductUnit = async (req, res) => {
    try {

        const { qty, mrp, sellingPrice } = req.body;
        const offPer = calculateOffPer(mrp, sellingPrice);

        const unit = await ProductUnit.findByIdAndUpdate(req.params.id, { qty, mrp, sellingPrice, offPer }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: unit });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('updateProductUnit', error, req, res);
    }
};

export const deleteProductUnit = async (req, res) => {
    try {

        await ProductUnit.findByIdAndUpdate(req.params.id, { deleted: true }, { new: true, runValidators: true });

        res.status(status.Deleted).json({ status: jsonStatus.Deleted, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteProductUnit', error, req, res);
    }
};

// Helper function to normalize subcategory data with icon fallback
const normalizeSubCategory = (subCategory) => {
    if (!subCategory) return subCategory;
    // Ensure icon field exists, use image as fallback if icon is missing
    return {
        ...subCategory,
        icon: subCategory.icon || subCategory.image || null,
        displayIcon: subCategory.icon || subCategory.image || null, // Preferred: icon, fallback: image
        hasSvgIcon: subCategory.icon && subCategory.icon.endsWith('.svg')
    };
};

export const onlineStoreHomePage = async (req, res) => {
    try {
        // Fetch subcategories (limit 8)
        const subCategoriesRaw = await SubCategory.aggregate([
            { $match: { deleted: false } },
            { $sort: { createdAt: -1 } }
        ]);

        // Normalize subcategories to ensure icon field is properly included
        const subCategories = subCategoriesRaw.map(normalizeSubCategory);

        // Fetch all categories (sorted by latest)
        const categories = await Category.aggregate([
            { $match: { deleted: false } },
            { $sort: { createdAt: -1 } }
        ]);

        // Fetch brands (limit 8)
        const brands = await Brand.aggregate([
            { $match: { deleted: false } },
            { $limit: 8 }
        ]);

        // ✅ Get all seller user IDs to filter products
        const sellerUsers = await User.find({ role: "seller", deleted: false }).select("_id").lean();
        const sellerIds = sellerUsers.map(u => new ObjectId(u._id));

        // ✅ Get all admin IDs
        const adminUsers = await Admin.find({}).select("_id").lean();
        const adminIds = adminUsers.map(a => new ObjectId(a._id));

        // ✅ Combine seller and admin IDs
        const allowedCreatorIds = [...sellerIds, ...adminIds];

        // ✅ If no allowed creators, return empty trending products
        const trendingMatch = allowedCreatorIds.length > 0
            ? {
                deleted: false,
                autoTrending: true, // ✅ Use autoTrending instead of manual trending flag
                createdBy: { $in: allowedCreatorIds } // ✅ Only show seller and admin products
            }
            : { deleted: false, autoTrending: true, _id: { $in: [] } }; // Empty match if no creators

        // Fetch trending products (limit 5) - only seller and admin products
        // We now calculate trending automatically based on Delivered orders
        const trendingProducts = await OnlineProduct.aggregate([
            {
                $match: {
                    deleted: false,
                    createdBy: { $in: allowedCreatorIds }
                }
            },
            {
                $lookup: {
                    from: "online_orders",
                    let: { onlinePid: "$_id" },
                    as: "orderStats",
                    pipeline: [
                        { $match: { status: "Delivered" } },
                        { $unwind: "$productDetails" },
                        {
                            $lookup: {
                                from: "products",
                                localField: "productDetails.productId",
                                foreignField: "_id",
                                as: "localProduct"
                            }
                        },
                        { $unwind: "$localProduct" },
                        {
                            $match: {
                                $expr: { $eq: ["$localProduct.onlineProductId", "$$onlinePid"] }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                orderCount: { $sum: 1 }
                            }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    orderCount: { $ifNull: [{ $arrayElemAt: ["$orderStats.orderCount", 0] }, 0] }
                }
            },
            {
                $match: {
                    orderCount: { $gt: 0 } // ✅ Only show products with at least 1 delivered order
                }
            },
            { $sort: { orderCount: -1, createdAt: -1 } },
            {
                $lookup: {
                    from: "product_units",
                    localField: "_id",
                    foreignField: "parentProduct",
                    as: "units",
                    pipeline: [{ $match: { deleted: false } }]
                }
            },
            {
                $lookup: {
                    from: "product_sub_categories",
                    localField: "subCategoryId",
                    foreignField: "_id",
                    as: "subCategory"
                }
            },
            {
                $addFields: {
                    units: { $ifNull: [{ $arrayElemAt: ["$units", 0] }, null] },
                    subCategory: { $arrayElemAt: ["$subCategory", 0] }
                }
            },
            { $limit: 5 },
            {
                $project: {
                    units: 1,
                    images: 1,
                    name: 1,
                    subCategoryPercentageOff: "$subCategory.percentageOff"
                }
            }
        ]);

        // Modify unit details if user is premium and percentageOff > 0
        if (req.user.isPremium) {
            trendingProducts.forEach(product => {
                if (product.units) {
                    const { sellingPrice, mrp } = product.units;
                    const subcategoryPercentage = product.subCategoryPercentageOff || 0;

                    if (subcategoryPercentage > 0) {
                        const discountPrice = Math.round(sellingPrice * (1 - subcategoryPercentage / 100));

                        product.units = {
                            ...product.units,
                            mrp: sellingPrice, // Show selling price as MRP
                            sellingPrice: discountPrice, // Apply new discount price
                            offPer: `${subcategoryPercentage}` // numeric string, append "% OFF" on UI
                        };
                    }
                }
            });
        }

        // Fetch cart items
        let totalCartCount = 0;
        const cartItems = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });

        const cartCountMap = new Map();
        cartItems.forEach(cart => {
            totalCartCount += cart.quantity;
            cartCountMap.set(`${cart.productId}_${cart.unitId}`, cart.quantity);
        });

        // Assign cart count to trending products
        trendingProducts.forEach(product => {
            if (product.units) {
                product.units.cartCount = cartCountMap.get(`${product._id}_${product.units._id}`) || 0;
            }
        });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: { subCategories, categories, brands, trendingProducts, totalCartCount }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('onlineStoreHomePage', error, req, res);
    }
};

export const allTrendingProducts = async (req, res) => {
    try {
        const search = req.query.search?.trim() || '';
        const page = parseInt(req.query.skip) || 1;
        const skip = (page - 1) * limit;

        // ✅ Get all seller user IDs to filter products
        const sellerUsers = await User.find({ role: "seller", deleted: false }).select("_id").lean();
        const sellerIds = sellerUsers.map(u => new ObjectId(u._id));

        // ✅ Get all admin IDs
        const adminUsers = await Admin.find({}).select("_id").lean();
        const adminIds = adminUsers.map(a => new ObjectId(a._id));

        // ✅ Combine seller and admin IDs
        const allowedCreatorIds = [...sellerIds, ...adminIds];

        // Build match conditions
        const matchConditions = allowedCreatorIds.length > 0
            ? {
                deleted: false,
                autoTrending: true, // ✅ Use autoTrending instead of manual trending flag
                createdBy: { $in: allowedCreatorIds } // ✅ Only show seller and admin products
            }
            : { deleted: false, autoTrending: true, _id: { $in: [] } }; // Empty match if no creators

        // Add search filter if provided
        if (search) {
            matchConditions.name = { $regex: search, $options: 'i' };
        }

        const trendingProducts = await OnlineProduct.aggregate([
            {
                $match: {
                    deleted: false,
                    createdBy: { $in: allowedCreatorIds },
                    ...(search ? { name: { $regex: search, $options: 'i' } } : {})
                }
            },
            {
                $lookup: {
                    from: "online_orders",
                    let: { pid: "$_id" },
                    as: "orderStats",
                    pipeline: [
                        { $match: { status: "Delivered" } },
                        { $unwind: "$productDetails" },
                        {
                            $match: {
                                $expr: { $eq: ["$productDetails.productId", "$$pid"] }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                orderCount: { $sum: 1 }
                            }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    orderCount: { $ifNull: [{ $arrayElemAt: ["$orderStats.orderCount", 0] }, 0] }
                }
            },
            {
                $match: {
                    orderCount: { $gt: 0 } // ✅ Only show products with at least 1 delivered order
                }
            },
            { $sort: { orderCount: -1, createdAt: -1 } },
            {
                $lookup: {
                    from: "product_units",
                    localField: "_id",
                    foreignField: "parentProduct",
                    as: "units",
                    pipeline: [{ $match: { deleted: false } }]
                }
            },
            {
                $lookup: {
                    from: "product_sub_categories",
                    localField: "subCategoryId",
                    foreignField: "_id",
                    as: "subCategory"
                }
            },
            {
                $addFields: {
                    units: { $ifNull: [{ $arrayElemAt: ["$units", 0] }, null] },
                    subCategory: { $arrayElemAt: ["$subCategory", 0] }
                }
            },
            {
                $project: {
                    units: 1,
                    images: 1,
                    name: 1,
                    subCategoryPercentageOff: "$subCategory.percentageOff"
                }
            },
            { $skip: skip },
            { $limit: limit }
        ]);

        // Modify unit details if user is premium and percentageOff > 0
        if (req.user.isPremium) {
            trendingProducts.forEach(product => {
                if (product.units) {
                    const { sellingPrice, mrp } = product.units;
                    const subcategoryPercentage = product.subCategoryPercentageOff || 0;

                    if (subcategoryPercentage > 0) {
                        const discountPrice = Math.round(sellingPrice * (1 - subcategoryPercentage / 100));

                        product.units = {
                            ...product.units,
                            mrp: sellingPrice, // Show selling price as MRP
                            sellingPrice: discountPrice, // Apply new discount price
                            offPer: `${subcategoryPercentage}` // numeric string, append "% OFF" on UI
                        };
                    }
                }
            });
        }

        // Build count match conditions (same as main query - must match only those with orders)
        const trendingStats = await OnlineProduct.aggregate([
            {
                $match: {
                    deleted: false,
                    createdBy: { $in: allowedCreatorIds },
                    ...(search ? { name: { $regex: search, $options: 'i' } } : {})
                }
            },
            {
                $lookup: {
                    from: "online_orders",
                    let: { pid: "$_id" },
                    as: "orderStats",
                    pipeline: [
                        { $match: { status: "Delivered" } },
                        { $unwind: "$productDetails" },
                        {
                            $match: {
                                $expr: { $eq: ["$productDetails.productId", "$$pid"] }
                            }
                        },
                        { $group: { _id: null, orderCount: { $sum: 1 } } }
                    ]
                }
            },
            {
                $addFields: {
                    orderCount: { $ifNull: [{ $arrayElemAt: ["$orderStats.orderCount", 0] }, 0] }
                }
            },
            {
                $match: {
                    orderCount: { $gt: 0 }
                }
            },
            { $count: "total" }
        ]);

        const totalCount = trendingStats[0]?.total || 0;

        // Fetch cart items
        let totalCartCount = 0;
        const cartItems = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });

        const cartCountMap = new Map();
        cartItems.forEach(cart => {
            totalCartCount += cart.quantity;
            cartCountMap.set(`${cart.productId}_${cart.unitId}`, cart.quantity);
        });

        // Assign cart count to trending products
        trendingProducts.forEach(product => {
            if (product.units) {
                product.units.cartCount = cartCountMap.get(`${product._id}_${product.units._id}`) || 0;
            }
        });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: { trendingProducts, totalCartCount },
            pagination: {
                total: totalCount,
                page: page,
                pageSize: limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('allTrendingProducts', error, req, res);
    }
};

export const allCategories = async (req, res) => {
    try {

        const search = req.query.search?.trim() || '';

        // get all cart count

        const categories = await Category.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $lookup: {
                    from: "product_sub_categories",
                    localField: "_id",
                    foreignField: "categoryId",
                    as: "subCategories",
                    pipeline: [
                        {
                            $match: {
                                deleted: false,
                                ...(search && {
                                    name: { $regex: search, $options: 'i' } // Search in subcategory names
                                })
                            }
                        }
                    ]
                }
            },
            {
                $match: {
                    ...(search && {
                        $or: [
                            { name: { $regex: search, $options: 'i' } }, // Search in category names
                            { "subCategories.name": { $regex: search, $options: 'i' } } // Search in subcategory names
                        ]
                    })
                }
            }
        ]);

        let totalCartCount = 0;
        const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
        if (carts.length > 0) {
            carts.map(elem => {
                totalCartCount += elem.quantity;
            })
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: { categories, totalCartCount } });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('allCategories', error, req, res);
    }
};

export const allSubCategories = async (req, res) => {
    try {

        const search = req.query.search?.trim() || '';

        // get all cart count

        const dataRaw = await SubCategory.aggregate([
            {
                $match: {
                    deleted: false,
                    storeType: 'online', // Only online store subcategories
                    ...(search && {
                        name: { $regex: search, $options: 'i' }
                    })
                }
            },
            {
                $sort: { createdAt: -1 } // Sort by newest first - ensures all are included
            }
            // ✅ NO LIMIT - Return all subcategories
        ]);

        // Normalize subcategories to ensure icon field is properly included
        const data = dataRaw.map(normalizeSubCategory);

        let totalCartCount = 0;
        const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
        if (carts.length > 0) {
            carts.map(elem => {
                totalCartCount += elem.quantity;
            })
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                data,
                totalCartCount,
                total: data.length // ✅ Add total count for reference
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('allSubCategories', error, req, res);
    }
};

export const allBrands = async (req, res) => {
    try {

        const search = req.query.search?.trim() || '';

        // get all cart count

        const data = await Brand.aggregate([
            {
                $match: {
                    deleted: false,
                    ...(search && {
                        name: { $regex: search, $options: 'i' }
                    })
                }
            }
        ]);

        let totalCartCount = 0;
        const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
        if (carts.length > 0) {
            carts.map(elem => {
                totalCartCount += elem.quantity;
            })
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: { data, totalCartCount } });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('allBrands', error, req, res);
    }
};

const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildMatchStage = (searchText) => ({
    deleted: false,
    ...(searchText && { name: { $regex: searchText, $options: 'i' } })
});

const buildMeta = (total, page, pageSize) => ({
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
});

const buildDiscoverySection = ({ key, title, items, meta, viewAllEndpoint, description }) => ({
    key,
    title,
    description: description || "",
    viewAllEndpoint,
    meta,
    items
});

const parseSectionsParam = (sectionsParam) => {
    if (!sectionsParam) {
        return new Set(["explore", "popularCategories", "popularBrands"]);
    }

    const normalized = sectionsParam
        .split(",")
        .map((section) => section.trim().toLowerCase())
        .filter(Boolean);

    const allowed = new Set(["explore", "popularcategories", "popularbrands"]);
    const resolved = normalized
        .map((key) => {
            if (key === "popularcategories") return "popularCategories";
            if (key === "popularbrands") return "popularBrands";
            if (key === "explore") return "explore";
            return null;
        })
        .filter(Boolean);

    if (!resolved.length) {
        return new Set(["explore", "popularCategories", "popularBrands"]);
    }

    return new Set(resolved);
};

const fetchUserCartCount = async (userId) => {
    let totalCartCount = 0;
    const carts = await OnlineStoreCart.find({ deleted: false, createdBy: userId });
    if (carts.length > 0) {
        carts.forEach(elem => {
            totalCartCount += elem.quantity;
        });
    }
    return totalCartCount;
};

export const onlineStoreDiscovery = async (req, res) => {
    try {
        const normalized = (value) => value?.trim() || '';

        const defaultLimit = limit || 10;

        const exploreSearch = normalized(req.query.exploreSearch) || normalized(req.query.search);
        const categorySearch = normalized(req.query.categorySearch) || normalized(req.query.search);
        const brandSearch = normalized(req.query.brandSearch) || normalized(req.query.search);

        const explorePage = parsePositiveInt(req.query.exploreSkip, 1);
        const categoryPage = parsePositiveInt(req.query.categorySkip, 1);
        const brandPage = parsePositiveInt(req.query.brandSkip, 1);

        const exploreLimitVal = parsePositiveInt(req.query.exploreLimit, defaultLimit);
        const categoryLimitVal = parsePositiveInt(req.query.categoryLimit, defaultLimit);
        const brandLimitVal = parsePositiveInt(req.query.brandLimit, defaultLimit);

        const exploreMatch = buildMatchStage(exploreSearch);
        const categoryMatch = buildMatchStage(categorySearch);
        const brandMatch = buildMatchStage(brandSearch);

        if (req.query.categoryId) {
            exploreMatch.categoryId = new ObjectId(req.query.categoryId);
        }

        const skipCalc = (page, pageSize) => (page - 1) * pageSize;

        const requestedSections = parseSectionsParam(req.query.sections);

        const shouldSendExplore = requestedSections.has("explore");
        const shouldSendCategories = requestedSections.has("popularCategories");
        const shouldSendBrands = requestedSections.has("popularBrands");

        const fetchExplore = async () => {
            // ✅ User requirement: Admin panel me subcategory hai, User app me Category hai
            // So we need to return SubCategories as Categories for user app
            const [items, total] = await Promise.all([
                SubCategory.aggregate([
                    {
                        $match: {
                            ...exploreMatch,
                            deleted: false,
                            storeType: 'online' // Only online store subcategories
                        }
                    },
                    { $sort: { createdAt: -1 } },
                    { $skip: skipCalc(explorePage, exploreLimitVal) },
                    { $limit: exploreLimitVal }
                ]),
                SubCategory.countDocuments({
                    ...exploreMatch,
                    deleted: false,
                    storeType: 'online'
                })
            ]);
            return { items, total };
        };

        const fetchCategories = async () => {
            const [items, total] = await Promise.all([
                Category.aggregate([
                    { $match: categoryMatch },
                    { $sort: { createdAt: -1 } },
                    { $skip: skipCalc(categoryPage, categoryLimitVal) },
                    { $limit: categoryLimitVal }
                ]),
                Category.countDocuments(categoryMatch)
            ]);
            return { items, total };
        };

        const fetchBrands = async () => {
            const [items, total] = await Promise.all([
                Brand.aggregate([
                    { $match: brandMatch },
                    { $sort: { createdAt: -1 } },
                    { $skip: skipCalc(brandPage, brandLimitVal) },
                    { $limit: brandLimitVal }
                ]),
                Brand.countDocuments(brandMatch)
            ]);
            return { items, total };
        };

        const [exploreData, categoriesData, brandsData] = await Promise.all([
            shouldSendExplore ? fetchExplore() : Promise.resolve(null),
            shouldSendCategories ? fetchCategories() : Promise.resolve(null),
            shouldSendBrands ? fetchBrands() : Promise.resolve(null)
        ]);

        const totalCartCount = await fetchUserCartCount(req.user._id);

        const sections = {};

        if (shouldSendExplore && exploreData) {
            sections.explore = buildDiscoverySection({
                key: "explore",
                title: "Explore",
                description: "Discover quick picks handpicked for you",
                items: exploreData.items,
                meta: buildMeta(exploreData.total, explorePage, exploreLimitVal),
                viewAllEndpoint: "/api/online/store/all/categories/v1" // Changed to categories endpoint since we're showing categories now
            });
        }

        if (shouldSendCategories && categoriesData) {
            sections.popularCategories = buildDiscoverySection({
                key: "popularCategories",
                title: "Popular Categories",
                description: "Top categories users are browsing right now",
                items: categoriesData.items,
                meta: buildMeta(categoriesData.total, categoryPage, categoryLimitVal),
                viewAllEndpoint: "/api/online/store/all/categories/v1"
            });
        }

        if (shouldSendBrands && brandsData) {
            sections.popularBrands = buildDiscoverySection({
                key: "popularBrands",
                title: "Popular Brands",
                description: "Trending brands trusted by our customers",
                items: brandsData.items,
                meta: buildMeta(brandsData.total, brandPage, brandLimitVal),
                viewAllEndpoint: "/api/online/store/all/brands/v1"
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                totalCartCount,
                requestedSections: Array.from(requestedSections),
                sections,
                ...(sections.explore && { explore: sections.explore }),
                ...(sections.popularCategories && { popularCategories: sections.popularCategories }),
                ...(sections.popularBrands && { popularBrands: sections.popularBrands })
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('onlineStoreDiscovery', error, req, res);
    }
};

const buildSectionResponse = ({ key, title, description, items, total, page, pageSize, viewAllEndpoint }) => ({
    section: key,
    title,
    description,
    items,
    meta: buildMeta(total, page, pageSize),
    viewAllEndpoint
});

export const onlineStoreExploreCards = async (req, res) => {
    try {
        const search = req.query.search?.trim() || req.query.exploreSearch?.trim() || '';
        const page = parsePositiveInt(req.query.skip || req.query.page, 1);
        const pageSize = parsePositiveInt(req.query.limit || req.query.exploreLimit, limit || 10);

        const match = buildMatchStage(search);
        if (req.query.categoryId) {
            match.categoryId = new ObjectId(req.query.categoryId);
        }

        const skip = (page - 1) * pageSize;

        // ✅ User requirement: Admin panel me subcategory hai, User app me Category hai
        // So we need to return SubCategories as Categories for user app
        const [items, total] = await Promise.all([
            SubCategory.aggregate([
                {
                    $match: {
                        ...match,
                        deleted: false,
                        storeType: 'online' // Only online store subcategories
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ]),
            SubCategory.countDocuments({
                ...match,
                deleted: false,
                storeType: 'online'
            })
        ]);

        const totalCartCount = await fetchUserCartCount(req.user._id);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                totalCartCount,
                ...buildSectionResponse({
                    key: "explore",
                    title: "Explore",
                    description: "Discover quick picks handpicked for you",
                    items,
                    total,
                    page,
                    pageSize,
                    viewAllEndpoint: "/api/online/store/all/categories/v1" // Changed to categories endpoint since we're showing categories now
                })
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('onlineStoreExploreCards', error, req, res);
    }
};

export const onlineStorePopularCategories = async (req, res) => {
    try {
        const search = req.query.search?.trim() || req.query.categorySearch?.trim() || '';
        const page = parsePositiveInt(req.query.skip || req.query.page, 1);
        const pageSize = parsePositiveInt(req.query.limit || req.query.categoryLimit, limit || 10);
        const skip = (page - 1) * pageSize;

        // ✅ Build pipeline: most ordered categories from delivered ONLINE orders
        const baseMatch = {
            status: "Delivered"
        };

        const pipeline = [
            { $match: baseMatch },
            { $unwind: "$productDetails" },
            {
                $group: {
                    _id: "$productDetails.productId",
                    orderCount: { $sum: { $toInt: "$productDetails.quantity" } }
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },
            {
                $match: {
                    "product.deleted": { $ne: true }
                }
            },
            {
                $group: {
                    _id: "$product.categoryId",
                    orderCount: { $sum: "$orderCount" }
                }
            },
            {
                $lookup: {
                    from: "product_categories",
                    localField: "_id",
                    foreignField: "_id",
                    as: "category"
                }
            },
            { $unwind: "$category" },
            {
                $match: {
                    "category.deleted": false,
                    ...(search
                        ? { "category.name": { $regex: search, $options: "i" } }
                        : {})
                }
            },
            {
                $sort: {
                    orderCount: -1,
                    "category.name": 1
                }
            },
            {
                $facet: {
                    paginated: [
                        { $skip: skip },
                        { $limit: pageSize },
                        {
                            $project: {
                                _id: "$category._id",
                                name: "$category.name",
                                image: "$category.image",
                                orderCount: 1,
                                createdAt: "$category.createdAt",
                                updatedAt: "$category.updatedAt"
                            }
                        }
                    ],
                    total: [
                        { $count: "count" }
                    ]
                }
            }
        ];

        const aggResult = await OnlineOrder.aggregate(pipeline);
        let items = aggResult[0]?.paginated || [];
        const total = aggResult[0]?.total?.[0]?.count || 0;

        // ✅ Attach up to 2 sample product images per category for UI tiles
        if (items.length) {
            const categoryIds = items.map((c) => c._id);

            const sampleProducts = await Product.aggregate([
                {
                    $match: {
                        deleted: { $ne: true },
                        categoryId: { $in: categoryIds }
                    }
                },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: "$categoryId",
                        products: {
                            $push: {
                                _id: "$_id",
                                image: {
                                    $ifNull: [
                                        { $arrayElemAt: ["$productImages", 0] },
                                        "$primaryImage"
                                    ]
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        products: { $slice: ["$products", 2] }
                    }
                }
            ]);

            const sampleMap = new Map(
                sampleProducts.map((p) => [p._id.toString(), p.products])
            );

            items = items.map((cat) => ({
                ...cat,
                sampleProducts: sampleMap.get(cat._id.toString()) || []
            }));
        }

        const totalCartCount = await fetchUserCartCount(req.user._id);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                totalCartCount,
                ...buildSectionResponse({
                    key: "popularCategories",
                    title: "Popular Categories",
                    description: "Top categories users are ordering the most",
                    items,
                    total,
                    page,
                    pageSize,
                    viewAllEndpoint: "/api/online/store/all/categories/v1"
                })
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('onlineStorePopularCategories', error, req, res);
    }
};

// ✅ User-facing: popular categories created in admin panel
export const onlineStorePopularCategoriesFromAdmin = async (req, res) => {
    try {
        const search = req.query.search?.trim() || '';
        const page = parsePositiveInt(req.query.skip || req.query.page, 1);
        const pageSize = parsePositiveInt(req.query.limit || req.query.categoryLimit, limit || 10);

        const skip = (page - 1) * pageSize;

        const match = {
            deleted: false,
            ...(search ? { name: { $regex: search, $options: 'i' } } : {})
        };

        const [popularCategories, total] = await Promise.all([
            PopularCategory.aggregate([
                { $match: match },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ]),
            PopularCategory.countDocuments(match)
        ]);

        // ✅ Get all seller user IDs to filter products
        const sellerUsers = await User.find({ role: "seller", deleted: false }).select("_id").lean();
        const sellerIds = sellerUsers.map(u => new ObjectId(u._id));

        // ✅ Get all admin IDs
        const adminUsers = await Admin.find({}).select("_id").lean();
        const adminIds = adminUsers.map(a => new ObjectId(a._id));

        // ✅ Combine seller and admin IDs
        const allowedCreatorIds = [...sellerIds, ...adminIds];

        // ✅ For each PopularCategory, find matching online Category by name and fetch products
        const items = await Promise.all(
            popularCategories.map(async (popularCat) => {
                // Find matching online Category by name (case-insensitive, trim spaces, handle special characters)
                const popularCatName = popularCat.name.trim();

                // Normalize names for better matching (remove extra spaces, handle special chars)
                const normalizeName = (name) => {
                    return name
                        .toLowerCase()
                        .trim()
                        .replace(/\s+/g, ' ') // Multiple spaces to single space
                        .replace(/&/g, 'and') // & to and
                        .replace(/[^\w\s]/g, ''); // Remove special chars except spaces
                };

                const normalizedPopularName = normalizeName(popularCatName);

                // Strategy 1: Try exact match first (do not restrict by storeType to ensure matching with all product categories)
                let matchingCategory = await Category.findOne({
                    deleted: false,
                    $or: [
                        { name: { $regex: new RegExp(`^${popularCatName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
                        { name: { $regex: new RegExp(popularCatName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }
                    ]
                });

                // Strategy 2: If PopularCategory has storeCategoryId, try matching via StoreCategory name
                if (!matchingCategory && popularCat.storeCategoryId) {
                    const storeCategory = await StoreCategory.findById(popularCat.storeCategoryId).lean();
                    if (storeCategory && storeCategory.name) {
                        const storeCatName = storeCategory.name.trim();
                        matchingCategory = await Category.findOne({
                            deleted: false,
                            $or: [
                                { name: { $regex: new RegExp(`^${storeCatName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
                                { name: { $regex: new RegExp(storeCatName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }
                            ]
                        });
                    }
                }

                // Strategy 3: If still not found, try normalized matching with all categories
                if (!matchingCategory) {
                    const allCategories = await Category.find({
                        deleted: false
                    }).lean();

                    // Find best match using normalized names
                    for (const cat of allCategories) {
                        const normalizedCatName = normalizeName(cat.name);
                        if (normalizedCatName === normalizedPopularName ||
                            normalizedCatName.includes(normalizedPopularName) ||
                            normalizedPopularName.includes(normalizedCatName)) {
                            matchingCategory = cat;
                            break;
                        }
                    }
                }

                let products = [];
                let categoryInfo = null;

                // ✅ Fetch products even if category match not found - match by category name in products
                if (allowedCreatorIds.length > 0) {
                    // If category matched, use categoryId
                    if (matchingCategory) {
                        categoryInfo = {
                            _id: matchingCategory._id,
                            name: matchingCategory.name,
                            image: matchingCategory.image
                        };
                    }

                    // ✅ Build product match query - always filter by createdBy
                    const productMatchBase = {
                        deleted: false,
                        createdBy: { $in: allowedCreatorIds }
                    };

                    // ✅ If matching category found, use categoryId; otherwise, fetch all products and filter by category name
                    const productMatch = matchingCategory
                        ? {
                            ...productMatchBase,
                            categoryId: matchingCategory._id
                        }
                        : productMatchBase;

                    // ✅ Build aggregation pipeline
                    const pipeline = [
                        {
                            $match: productMatch
                        },
                        {
                            $lookup: {
                                from: "product_categories",
                                localField: "categoryId",
                                foreignField: "_id",
                                as: "category"
                            }
                        },
                        {
                            $addFields: {
                                category: { $arrayElemAt: ["$category", 0] }
                            }
                        }
                    ];

                    // ✅ If no category match, filter by category name matching PopularCategory name
                    if (!matchingCategory) {
                        pipeline.push({
                            $match: {
                                "category": { $ne: null },
                                "category.deleted": false,
                                $or: [
                                    { "category.name": { $regex: new RegExp(`^${popularCatName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
                                    { "category.name": { $regex: new RegExp(popularCatName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
                                    { "category.name": { $regex: new RegExp(normalizedPopularName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
                                    // ✅ Add more flexible matching - check if category name contains popular category name or vice versa
                                    { "category.name": { $regex: new RegExp(popularCatName.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }
                                ]
                            }
                        });
                    } else {
                        // ✅ Even if category matched, ensure category is not null and valid
                        pipeline.push({
                            $match: {
                                "category": { $ne: null },
                                "category.deleted": false
                            }
                        });
                    }

                    // ✅ Continue with units lookup
                    pipeline.push(
                        {
                            $lookup: {
                                from: "product_units",
                                localField: "_id",
                                foreignField: "parentProduct",
                                as: "units",
                                pipeline: [
                                    { $match: { deleted: false } }
                                ]
                            }
                        },
                        {
                            $addFields: {
                                units: { $ifNull: [{ $arrayElemAt: ["$units", 0] }, null] }
                            }
                        },
                        {
                            $match: {
                                units: { $ne: null }
                            }
                        },
                        {
                            $lookup: {
                                from: "product_sub_categories",
                                localField: "subCategoryId",
                                foreignField: "_id",
                                as: "subCategory"
                            }
                        },
                        {
                            $addFields: {
                                subCategory: { $arrayElemAt: ["$subCategory", 0] },
                                subCategoryPercentageOff: { $ifNull: [{ $arrayElemAt: ["$subCategory.percentageOff", 0] }, 0] }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                name: 1,
                                manufacturer: 1,
                                information: 1,
                                images: 1,
                                details: 1,
                                categoryId: 1,
                                subCategoryId: 1,
                                trending: 1,
                                rating: 1,
                                ratingCount: 1,
                                units: 1,
                                category: 1,
                                subCategory: 1,
                                subCategoryPercentageOff: 1,
                                createdAt: 1,
                                updatedAt: 1
                            }
                        },
                        { $sort: { createdAt: -1 } }
                    );

                    products = await OnlineProduct.aggregate(pipeline);

                    // ✅ If products found but category info not set, set it from first product's category
                    if (products.length > 0 && !categoryInfo && products[0].category) {
                        categoryInfo = {
                            _id: products[0].category._id,
                            name: products[0].category.name,
                            image: products[0].category.image
                        };
                    }

                    // Modify unit details if user is premium and percentageOff > 0
                    if (req.user.isPremium) {
                        products.forEach(product => {
                            if (product.units) {
                                const { sellingPrice, mrp } = product.units;
                                const subcategoryPercentage = product.subCategoryPercentageOff || 0;

                                if (subcategoryPercentage > 0) {
                                    const discountPrice = Math.round(sellingPrice * (1 - subcategoryPercentage / 100));
                                    const calculatedOffPer = calculateOffPer(sellingPrice, discountPrice);

                                    product.units = {
                                        ...product.units,
                                        mrp: sellingPrice,
                                        sellingPrice: discountPrice,
                                        offPer: calculatedOffPer
                                    };
                                } else if (product.units.offPer) {
                                    // Clean offPer for non-premium users too
                                    const offPerValue = String(product.units.offPer).replace(/%\s*OFF/gi, '').trim();
                                    product.units.offPer = offPerValue;
                                }
                            }
                        });
                    } else {
                        // For non-premium users, ensure offPer is clean
                        products.forEach(product => {
                            if (product.units && product.units.offPer) {
                                const offPerValue = String(product.units.offPer).replace(/%\s*OFF/gi, '').trim();
                                product.units.offPer = offPerValue;
                            }
                        });
                    }

                    // Get cart counts for products
                    const productIds = products.map(p => p._id);
                    const unitIds = products.map(p => p.units?._id).filter(Boolean);

                    if (productIds.length > 0) {
                        const cartItems = await OnlineStoreCart.find({
                            deleted: false,
                            createdBy: req.user._id,
                            productId: { $in: productIds },
                            ...(unitIds.length > 0 ? { unitId: { $in: unitIds } } : {})
                        });

                        const cartCountMap = new Map();
                        cartItems.forEach(cart => {
                            cartCountMap.set(`${cart.productId}_${cart.unitId}`, cart.quantity);
                        });

                        products.forEach(product => {
                            if (product.units) {
                                product.units.cartCount = cartCountMap.get(`${product._id}_${product.units._id}`) || 0;
                            }
                        });
                    }
                }

                // ✅ Return popular category with products
                return {
                    _id: popularCat._id,
                    name: popularCat.name,
                    image: popularCat.image,
                    storeCategoryId: popularCat.storeCategoryId,
                    createdAt: popularCat.createdAt,
                    updatedAt: popularCat.updatedAt,
                    category: categoryInfo, // ✅ Category information (null if no match found)
                    products: products, // ✅ All products for this category
                    productCount: products.length,
                    // Debug info (can be removed in production)
                    _debug: {
                        matchingCategoryFound: !!matchingCategory,
                        matchingCategoryName: matchingCategory?.name || null,
                        allowedCreatorIdsCount: allowedCreatorIds.length,
                        productsFound: products.length
                    }
                };
            })
        );

        const totalCartCount = await fetchUserCartCount(req.user._id);

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                totalCartCount,
                items,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
                viewAllEndpoint: "/api/online/store/popular/admin/categories/v1"
            }
        });
    } catch (error) {
        return catchError('onlineStorePopularCategoriesFromAdmin', error, req, res);
    }
};

export const onlineStorePopularBrands = async (req, res) => {
    try {
        const search = req.query.search?.trim() || req.query.brandSearch?.trim() || '';
        const page = parsePositiveInt(req.query.skip || req.query.page, 1);
        const pageSize = parsePositiveInt(req.query.limit || req.query.brandLimit, limit || 10);

        const match = buildMatchStage(search);
        const skip = (page - 1) * pageSize;

        const [items, total] = await Promise.all([
            Brand.aggregate([
                { $match: match },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ]),
            Brand.countDocuments(match)
        ]);

        const totalCartCount = await fetchUserCartCount(req.user._id);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                totalCartCount,
                ...buildSectionResponse({
                    key: "popularBrands",
                    title: "Popular Brands",
                    description: "Trending brands trusted by our customers",
                    items,
                    total,
                    page,
                    pageSize,
                    viewAllEndpoint: "/api/online/store/all/brands/v1"
                })
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('onlineStorePopularBrands', error, req, res);
    }
};

export const onlineProductsList = async (req, res) => {
    try {

        const { category, subcategory, brand, search, skip, sort } = req.query;

        const page = parseInt(skip) || 1; // Default to page 1 if not provided
        const offset = (page - 1) * limit; // Calculate the skip value

        // Build the query conditions
        const query = { deleted: false };

        // ✅ Apply category, subcategory, and brand filters if provided
        if (category) {
            query.categoryId = new ObjectId(category);
        } else {
            // If category not provided, still ensure categoryId exists
            query.categoryId = { $exists: true, $ne: null };
        }

        if (subcategory) {
            query.subCategoryId = new ObjectId(subcategory);
        } else {
            // If subcategory not provided, still ensure subCategoryId exists
            query.subCategoryId = { $exists: true, $ne: null };
        }

        // Apply search filter on the name field using regex
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        // Determine sorting
        let sortStage = { createdAt: -1 }; // default newest
        if (sort === 'price_asc') {
            sortStage = { "units.sellingPrice": 1, "units.price": 1, createdAt: -1 };
        } else if (sort === 'price_desc') {
            sortStage = { "units.sellingPrice": -1, "units.price": -1, createdAt: -1 };
        } else if (sort === 'newest') {
            sortStage = { createdAt: -1 };
        }

        // Fetch products with applied filters and pagination
        // Only show products from seller panel stores (createdBy user with role "seller")
        // ✅ When category is provided, only show products from that category
        const products = await OnlineProduct.aggregate([
            {
                $match: query
            },
            {
                $lookup: {
                    from: "users",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "creator",
                    pipeline: [
                        {
                            $project: { role: 1 }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    creatorRole: { $arrayElemAt: ["$creator.role", 0] }
                }
            },
            {
                // Filter to only show products created by sellers
                $match: {
                    creatorRole: "seller"
                }
            },
            {
                $lookup: {
                    from: "product_categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "category"
                }
            },
            {
                $lookup: {
                    from: "product_sub_categories",
                    localField: "subCategoryId",
                    foreignField: "_id",
                    as: "subCategory"
                }
            },
            {
                $lookup: {
                    from: "product_units",
                    localField: "_id",
                    foreignField: "parentProduct",
                    as: "units",
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
                $addFields: {
                    units: { $ifNull: [{ $arrayElemAt: ["$units", 0] }, null] },
                    subCategory: { $arrayElemAt: ["$subCategory", 0] }
                }
            },
            {
                // Only show products that have units (pricing information)
                $match: {
                    units: { $ne: null }
                }
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    manufacturer: 1,
                    information: 1,
                    images: 1,
                    details: 1,
                    categoryId: 1,
                    subCategoryId: 1,
                    trending: 1,
                    rating: 1,
                    ratingCount: 1,
                    units: 1,
                    category: 1,
                    subCategory: 1,
                    subCategoryPercentageOff: "$subCategory.percentageOff",
                    createdAt: 1,
                    updatedAt: 1
                }
            },
            { $sort: sortStage },
            { $skip: offset },
            { $limit: limit }
        ]);

        // Modify unit details if user is premium and percentageOff > 0
        if (req.user.isPremium) {
            products.forEach(product => {
                if (product.units) {
                    const { sellingPrice, mrp } = product.units;
                    const subcategoryPercentage = product.subCategoryPercentageOff || 0;

                    if (subcategoryPercentage > 0) {
                        const discountPrice = Math.round(sellingPrice * (1 - subcategoryPercentage / 100));
                        // ✅ Calculate offPer properly - ensure it's just a number without "% OFF"
                        const calculatedOffPer = calculateOffPer(sellingPrice, discountPrice);

                        product.units = {
                            ...product.units,
                            mrp: sellingPrice, // Show selling price as MRP
                            sellingPrice: discountPrice, // Apply new discount price
                            offPer: calculatedOffPer // numeric string; UI can append "% OFF"
                        };
                    } else if (product.units.offPer) {
                        // ✅ Ensure offPer doesn't contain "% OFF" text - clean it if needed
                        const offPerValue = String(product.units.offPer).replace(/%\s*OFF/gi, '').trim();
                        product.units.offPer = offPerValue;
                    }
                } else if (product.units && product.units.offPer) {
                    // ✅ Clean offPer for non-premium users too
                    const offPerValue = String(product.units.offPer).replace(/%\s*OFF/gi, '').trim();
                    product.units.offPer = offPerValue;
                }
            });
        } else {
            // ✅ For non-premium users, ensure offPer is clean
            products.forEach(product => {
                if (product.units && product.units.offPer) {
                    const offPerValue = String(product.units.offPer).replace(/%\s*OFF/gi, '').trim();
                    product.units.offPer = offPerValue;
                }
            });
        }

        const productIds = products.map(p => p._id);
        const unitIds = products.map(p => p.units?._id).filter(Boolean);

        const cartItems = await OnlineStoreCart.find({
            deleted: false,
            createdBy: req.user._id,
            productId: { $in: productIds },
            // If unitIds is empty, let MongoDB handle it (no matches) – avoid $in: []
            ...(unitIds.length ? { unitId: { $in: unitIds } } : {})
        });

        let totalCartCount = 0;
        const cartCountMap = new Map();

        cartItems.forEach(cart => {
            totalCartCount += cart.quantity;
            cartCountMap.set(`${cart.productId}_${cart.unitId}`, cart.quantity);
        });

        products.forEach(product => {
            if (product.units) {
                product.units.cartCount = cartCountMap.get(`${product._id}_${product.units._id}`) || 0;
            }
        });

        // ✅ Count documents with the same basic filters (only seller products with category, subcategory, and units)
        // Get all seller user IDs first
        const sellerUsers = await User.find({ role: "seller" }).select("_id");
        const sellerUserIds = sellerUsers.map(u => u._id);

        // ✅ Count products that match all criteria: seller role, category filter (if provided), subcategory filter (if provided), and have units
        // Use the same query object which already has category/subcategory filters applied
        const countQuery = {
            ...query,
            createdBy: { $in: sellerUserIds }
        };

        // Also check that products have units
        const productsWithUnits = await OnlineProduct.aggregate([
            { $match: countQuery },
            {
                $lookup: {
                    from: "product_units",
                    localField: "_id",
                    foreignField: "parentProduct",
                    as: "units",
                    pipeline: [
                        { $match: { deleted: false } }
                    ]
                }
            },
            {
                $match: {
                    units: { $ne: [] }
                }
            },
            {
                $count: "total"
            }
        ]);

        const totalCount = productsWithUnits[0]?.total || 0;

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: { products, totalCartCount },
            pagination: {
                total: totalCount,
                page: page,
                pageSize: limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('onlineProductsList', error, req, res);
    }
};

export const onlineProductsDetails = async (req, res) => {
    try {

        const { id } = req.params;
        const viewAllSimilar = req.query.viewAllSimilar === "1";
        const similarLimit = viewAllSimilar
            ? 50
            : Number(req.query.similarLimit) > 0
                ? Number(req.query.similarLimit)
                : 8;

        const onlineProduct = await resolveOnlineProductByAnyId(id);
        if (!onlineProduct) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Product not found with this ID"
            });
        }

        const details = await OnlineProduct.aggregate([
            {
                $match: {
                    _id: new ObjectId(onlineProduct._id)
                }
            },
            {
                $lookup: {
                    from: "product_units",
                    localField: "_id",
                    foreignField: "parentProduct",
                    as: "productUnits",
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
                    from: "product_sub_categories",
                    localField: "subCategoryId",
                    foreignField: "_id",
                    as: "subCategory"
                }
            },
            {
                $addFields: {
                    subCategory: { $arrayElemAt: ["$subCategory", 0] }
                }
            },
            {
                $addFields: {
                    subCategoryPercentageOff: "$subCategory.percentageOff"
                }
            }
        ]);
        if (!details[0]) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found with this ID" });
        }

        // Attach variant template & groups from linked local Product (created via retailer panel)
        try {
            const linkedLocalProduct = await Product.findOne({
                createdBy: onlineProduct.createdBy,
                productName: onlineProduct.name,
                companyName: onlineProduct.manufacturer
            })
                .select("variantTemplate variantGroups")
                .lean();

            if (linkedLocalProduct) {
                details[0].variantTemplate = linkedLocalProduct.variantTemplate || null;
                details[0].variantGroups = Array.isArray(linkedLocalProduct.variantGroups)
                    ? linkedLocalProduct.variantGroups
                    : [];
            } else {
                details[0].variantTemplate = details[0].variantTemplate || null;
                details[0].variantGroups = details[0].variantGroups || [];
            }
        } catch (variantErr) {
            console.warn("⚠️ Failed to attach variant groups in online product details:", variantErr?.message || variantErr);
        }

        // Fetch cart items
        let totalCartCount = 0;
        const cartItems = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });

        const cartCountMap = new Map();
        cartItems.forEach(cart => {
            totalCartCount += cart.quantity;
            cartCountMap.set(`${cart.productId}_${cart.unitId}`, cart.quantity);
        });

        // Modify product units with cart count
        details[0].productUnits = details[0].productUnits.map(unit => {
            return {
                ...unit,
                cartCount: cartCountMap.get(`${details[0]._id}_${unit._id}`) || 0
            };
        });

        // Modify each unit object if user is premium and percentageOff > 0
        if (req.user.isPremium) {
            const subcategoryPercentage = details[0].subCategoryPercentageOff || 0;

            if (subcategoryPercentage > 0) {
                details[0].productUnits = details[0].productUnits.map(unit => {
                    const discountPrice = Math.round(unit.sellingPrice * (1 - subcategoryPercentage / 100));
                    // ✅ Calculate offPer properly - ensure it's just a number without "% OFF"
                    const calculatedOffPer = calculateOffPer(unit.sellingPrice, discountPrice);

                    return {
                        ...unit,
                        mrp: unit.sellingPrice, // Show selling price as MRP
                        sellingPrice: discountPrice, // Apply discount
                        offPer: calculatedOffPer // numeric string; UI can append "% OFF"
                    };
                });
            } else {
                // ✅ Clean offPer even if no premium discount
                details[0].productUnits = details[0].productUnits.map(unit => {
                    if (unit.offPer) {
                        const offPerValue = String(unit.offPer).replace(/%\s*OFF/gi, '').trim();
                        return { ...unit, offPer: offPerValue };
                    }
                    return unit;
                });
            }
        } else {
            // ✅ For non-premium users, ensure offPer is clean
            details[0].productUnits = details[0].productUnits.map(unit => {
                if (unit.offPer) {
                    const offPerValue = String(unit.offPer).replace(/%\s*OFF/gi, '').trim();
                    return { ...unit, offPer: offPerValue };
                }
                return unit;
            });
        }

        // Fetch similar products
        const similarProducts = await OnlineProduct.aggregate([
            {
                $match: {
                    subCategoryId: new ObjectId(details[0].subCategoryId),
                    deleted: false
                }
            },
            {
                $lookup: {
                    from: "product_units",
                    localField: "_id",
                    foreignField: "parentProduct",
                    as: "productUnits",
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
                    from: "product_sub_categories",
                    localField: "subCategoryId",
                    foreignField: "_id",
                    as: "subCategory"
                }
            },
            {
                $addFields: {
                    productUnits: { $ifNull: [{ $arrayElemAt: ["$productUnits", 0] }, null] },
                    subCategory: { $arrayElemAt: ["$subCategory", 0] }
                }
            },
            {
                $project: {
                    productUnits: 1,
                    images: 1,
                    name: 1,
                    manufacturer: 1,
                    subCategoryPercentageOff: "$subCategory.percentageOff"
                }
            },
            {
                $limit: similarLimit
            }
        ]);

        // Modify similar products with cart count
        similarProducts.forEach(product => {
            if (product.productUnits) {
                product.productUnits.cartCount = cartCountMap.get(`${product._id}_${product.productUnits._id}`) || 0;
            }
        });

        // Modify unit details if user is premium and percentageOff > 0
        if (req.user.isPremium) {
            similarProducts.forEach(product => {
                if (product.productUnits) {
                    const { sellingPrice } = product.productUnits;
                    const subcategoryPercentage = product.subCategoryPercentageOff || 0;

                    if (subcategoryPercentage > 0) {
                        const discountPrice = Math.round(sellingPrice * (1 - subcategoryPercentage / 100));
                        // ✅ Calculate offPer properly
                        const calculatedOffPer = calculateOffPer(sellingPrice, discountPrice);

                        product.productUnits = {
                            ...product.productUnits,
                            mrp: sellingPrice, // Show selling price as MRP
                            sellingPrice: discountPrice, // Apply new discount price
                            offPer: calculatedOffPer // numeric string; UI can append "% OFF"
                        };
                    } else if (product.productUnits.offPer) {
                        // ✅ Clean offPer
                        const offPerValue = String(product.productUnits.offPer).replace(/%\s*OFF/gi, '').trim();
                        product.productUnits.offPer = offPerValue;
                    }
                }
            });
        } else {
            // ✅ For non-premium users, ensure offPer is clean
            similarProducts.forEach(product => {
                if (product.productUnits && product.productUnits.offPer) {
                    const offPerValue = String(product.productUnits.offPer).replace(/%\s*OFF/gi, '').trim();
                    product.productUnits.offPer = offPerValue;
                }
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: { ...details[0], similarProducts, totalCartCount }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('onlineProductsDetails', error, req, res);
    }
};

export const addOnlineProductToCart = async (req, res) => {
    try {
        const { productId, unitId, quantity } = req.body;

        // ✅ Enhanced validation with proper error messages
        if (!productId) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: "Product ID is required" 
            });
        }

        if (!unitId) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: "Unit ID is required" 
            });
        }

        // ✅ Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: "Invalid Product ID format" 
            });
        }

        if (!mongoose.Types.ObjectId.isValid(unitId)) {
            return res.status(status.BadRequest).json({ 
                status: jsonStatus.BadRequest, 
                success: false, 
                message: "Invalid Unit ID format" 
            });
        }

        const productDetails = await resolveOnlineProductByAnyId(productId);
        if (!productDetails) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Product not found"
            });
        }

        if (productDetails.deleted) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "You can't add deleted product in to the Cart" });
        }

        const onlineProductId = productDetails._id;

        const productUnitOriginal = await ProductUnit.findOne({ parentProduct: onlineProductId, _id: unitId });
        let productUnit = productUnitOriginal;

        // If unit not found directly, try to map from local product unit if applicable
        if (!productUnit) {
            const localProduct = await Product.findById(productId);
            if (localProduct && localProduct.units) {
                const localUnit = localProduct.units.find(u => u._id.toString() === unitId);
                if (localUnit) {
                    // Find matching online unit by quantity
                    productUnit = await ProductUnit.findOne({
                        parentProduct: onlineProductId,
                        qty: localUnit.qty,
                        deleted: false
                    });
                }
            }
        }

        if (!productUnit) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product Unit not found" });
        }

        if (productUnit.deleted) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "You can't add deleted product unit in to the Cart" });
        }

        const findProductInCart = await OnlineStoreCart.findOne({
            createdBy: req.user._id,
            productId: onlineProductId,
            unitId,
            deleted: false
        });
        if (findProductInCart) {
            findProductInCart.quantity = quantity ? findProductInCart.quantity + quantity : findProductInCart.quantity + 1;
            await findProductInCart.save();

            let totalCartCount = 0;
            const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
            if (carts.length > 0) {
                carts.map(elem => {
                    totalCartCount += elem.quantity;
                })
            }

            res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                message: "Product added in to the Cart",
                count: findProductInCart.quantity,
                totalCartCount
            });
        } else {
            let newCart = new OnlineStoreCart({
                productId: onlineProductId,
                unitId,
                createdBy: req.user._id,
                quantity: quantity || 1
            });
            newCart = await newCart.save();

            let totalCartCount = 0;
            const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
            if (carts.length > 0) {
                carts.map(elem => {
                    totalCartCount += elem.quantity;
                })
            }

            res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Product added in to the Cart", count: newCart.quantity, totalCartCount });
        }
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('addOnlineProductToCart', error, req, res);
    }
};

export const incrementOnlineProductQuantityInCart = async (req, res) => {
    try {
        const { productId, unitId } = req.params;

        if (!productId || !unitId) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter Product and Unit ID` });
        }

        const findProduct = await resolveOnlineProductByAnyId(productId);
        if (!findProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product is not found with this ID" });
        }

        const onlineProductId = findProduct._id;

        const findProductUnit = await ProductUnit.findOne({ parentProduct: onlineProductId, _id: unitId });
        if (!findProductUnit) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product unit is not found with this ID" });
        }

        const findCart = await OnlineStoreCart.findOne({
            productId: onlineProductId,
            unitId,
            createdBy: req.user._id,
            deleted: false
        });
        if (!findCart) {
            let newCart = new OnlineStoreCart({
                productId: onlineProductId,
                unitId,
                createdBy: req.user._id,
                quantity: 1
            });
            newCart = await newCart.save();

            let totalCartCount = 0;
            const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
            if (carts.length > 0) {
                carts.map(elem => {
                    totalCartCount += elem.quantity;
                })
            }

            res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Quantity incremented", count: newCart.quantity, totalCartCount });
        } else {
            findCart.quantity += 1;
            await findCart.save();

            let totalCartCount = 0;
            const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
            if (carts.length > 0) {
                carts.map(elem => {
                    totalCartCount += elem.quantity;
                })
            }

            res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Quantity incremented", count: findCart.quantity, totalCartCount });
        }
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('incrementOnlineProductQuantityInCart', error, req, res);
    }
};

export const decrementOnlineProductQuantityInCart = async (req, res) => {
    try {
        const { productId, unitId } = req.params;

        if (!productId || !unitId) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter IDs` });
        }

        const findProduct = await resolveOnlineProductByAnyId(productId);
        if (!findProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product is not found with this ID" });
        }

        const onlineProductId = findProduct._id;

        const findProductUnit = await ProductUnit.findOne({ parentProduct: onlineProductId, _id: unitId });
        if (!findProductUnit) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product unit is not found with this ID" });
        }

        const findCart = await OnlineStoreCart.findOne({
            productId: onlineProductId,
            unitId,
            createdBy: req.user._id,
            deleted: false
        });
        if (!findCart) {
            res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: true, message: "Cart is not exist", count: 0 });
        } else {
            if (findCart.quantity > 1) {
                findCart.quantity -= 1;
                await findCart.save();

                let totalCartCount = 0;
                const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
                if (carts.length > 0) {
                    carts.map(elem => {
                        totalCartCount += elem.quantity;
                    })
                }

                res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Quantity decremented", count: findCart.quantity, totalCartCount });
            } else {
                await OnlineStoreCart.findByIdAndDelete(findCart._id);

                let totalCartCount = 0;
                const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
                if (carts.length > 0) {
                    carts.map(elem => {
                        totalCartCount += elem.quantity;
                    })
                }

                res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Quantity decremented", count: 0, totalCartCount });
            }
        }
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('decrementOnlineProductQuantityInCart', error, req, res);
    }
};

export const deleteOnlineProductFromCart = async (req, res) => {
    try {
        const { productId, unitId } = req.params;

        if (!productId || !unitId) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter IDs` });
        }

        // Normalize productId to the resolved online product id (so local Product ids also work)
        const onlineProduct = await resolveOnlineProductByAnyId(productId);
        const normalizedProductId = onlineProduct ? onlineProduct._id : productId;

        const findCart = await OnlineStoreCart.findOne({
            productId: normalizedProductId,
            unitId,
            deleted: false,
            createdBy: req.user._id
        });
        if (!findCart) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product is not found with this ID" });
        }

        await OnlineStoreCart.findByIdAndDelete(findCart._id);

        let totalCartCount = 0;
        const carts = await OnlineStoreCart.find({ deleted: false, createdBy: req.user._id });
        if (carts.length > 0) {
            carts.map(elem => {
                totalCartCount += elem.quantity;
            })
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Product deleted from Cart", count: 0, totalCartCount });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteOnlineProductFromCart', error, req, res);
    }
};

export const onlineStoreCartDetails = async (req, res) => {
    try {
        let { coupon, donate } = req.query;
        donate = donate ? Number(donate) : 0;

        const userId = req.user._id;

        // Fetch cart items for the user
        const cartItems = await OnlineStoreCart.find({ createdBy: userId, deleted: false })
            .populate({ path: 'productId', model: OnlineProduct })
            .populate({ path: 'unitId', model: ProductUnit });

        // if (!cartItems.length) {
        //     return res.status(status.OK).json({
        //         status: jsonStatus.OK,
        //         success: true,
        //         message: 'Cart is empty'
        //     });
        // }

        let overallTotalAmount = 0;
        let overallShippingFee = 0;
        let overallGrandTotal = 0;
        let totalCoinsCanBeUsed = 0; // New Field

        const enhancedCart = await Promise.all(cartItems.map(async (cartItem) => {
            const product = cartItem.productId;
            const unit = cartItem.unitId;
            const quantity = cartItem.quantity;

            // Validate that both product and unit exist
            if (!product || !unit) {
                console.warn('Cart item has missing product or unit:', cartItem._id);
                return null;
            }

            // Fetch subcategory details to get percentageOff
            let subCategory = null;
            if (product.subCategoryId) {
                subCategory = await ProductSubCategory.findById(product.subCategoryId);
            }
            const percentageOff = subCategory?.percentageOff || 0;

            let modifiedUnit = { ...unit.toObject() };

            if (req.user.isPremium && percentageOff > 0) {
                const discountPrice = Math.round(modifiedUnit.sellingPrice * (1 - percentageOff / 100));
                // ✅ Calculate offPer properly
                const calculatedOffPer = calculateOffPer(modifiedUnit.sellingPrice, discountPrice);

                modifiedUnit = {
                    ...modifiedUnit,
                    mrp: modifiedUnit.sellingPrice, // Show selling price as MRP
                    sellingPrice: discountPrice, // Apply discount
                    offPer: calculatedOffPer // numeric string; UI can append "% OFF"
                };
            } else if (modifiedUnit.offPer) {
                // ✅ Clean offPer even if no premium discount
                const offPerValue = String(modifiedUnit.offPer).replace(/%\s*OFF/gi, '').trim();
                modifiedUnit.offPer = offPerValue;
            }

            let productTotal = modifiedUnit.sellingPrice * quantity;
            overallTotalAmount += productTotal;

            // Calculate total coins user can use if premium
            if (req.user.isPremium) {
                totalCoinsCanBeUsed += (product.coinCanUsed || 0) * quantity;
            }

            return {
                ...product.toObject(),
                unitDetails: modifiedUnit,
                quantity,
                totalPrice: productTotal
            };
        }));

        const address = await Address.findOne({ createdBy: userId });

        let couponCodeDiscount = 0;
        let couponCode = null;

        if (coupon) {
            // Validate coupon ID format before querying
            if (!mongoose.Types.ObjectId.isValid(coupon)) {
                return res.status(status.BadRequest).json({
                    status: jsonStatus.BadRequest,
                    success: false,
                    message: 'Invalid coupon ID format'
                });
            }

            couponCode = await CouponCode.findById(coupon);

            if (!couponCode || couponCode.deleted) {
                return res.status(status.NotFound).json({
                    status: jsonStatus.NotFound,
                    success: false,
                    message: 'Coupon not found or deleted'
                });
            }

            if (couponCode.use === 'one') {
                const alreadyUsed = await CouponHistory.findOne({
                    couponId: couponCode._id,
                    userId
                });

                if (alreadyUsed) {
                    return res.status(status.BadRequest).json({
                        status: jsonStatus.BadRequest,
                        success: false,
                        message: 'Coupon already used'
                    });
                }
            }

            if (couponCode.minPrice && overallTotalAmount < couponCode.minPrice) {
                return res.status(status.BadRequest).json({
                    status: jsonStatus.BadRequest,
                    success: false,
                    message: `Minimum purchase of ₹${couponCode.minPrice} required for this coupon`
                });
            }

            const rawDiscount = (overallTotalAmount * couponCode.discount) / 100;
            couponCodeDiscount = couponCode.upto
                ? Math.min(rawDiscount, couponCode.upto)
                : rawDiscount;
        }

        // Apply shipping fee logic (example: free shipping above ₹500)
        overallShippingFee = overallTotalAmount > 500 ? 0 : 50;
        
        // ✅ Fix: Calculate grand total correctly - ensure it's never negative
        overallGrandTotal = Math.max(0, overallTotalAmount - couponCodeDiscount + overallShippingFee + donate);

        // Check if user has previous orders (to determine if coins should be shown)
        const hasPreviousOrder = await hasPreviousOrders(userId, 'OnlineStore');
        
        // Calculate coins that will be earned for this order
        const productDetailsForCoins = enhancedCart
            .filter(Boolean)
            .map(item => ({
                productId: item._id,
                productPrice: item.unitDetails.sellingPrice,
                quantity: item.quantity
            }));
        const coinsEarnable = await calculateCoinsEarned(productDetailsForCoins);

        // Calculate maximum coins user can use (only if they have previous orders)
        let coinsUsable = 0;
        let userCoinBalance = 0;
        if (hasPreviousOrder) {
            userCoinBalance = req.user.coins || 0;
            const maxUsable = await validateAndGetMaxCoinsUsable(userId, totalCoinsCanBeUsed, overallGrandTotal);
            coinsUsable = maxUsable;
        }

        // ✅ Calculate enhanced bill summary with proper values - ensure all fields are complete
        const itemTotalValue = parseFloat(overallTotalAmount.toFixed(2));
        const donationAmountValue = parseFloat(donate.toFixed(2));
        const couponDiscountValue = parseFloat(couponCodeDiscount.toFixed(2));
        const shippingFeeValue = parseFloat(overallShippingFee.toFixed(2));
        const totalPayableValue = parseFloat(overallGrandTotal.toFixed(2));
        const savedValue = parseFloat(couponCodeDiscount.toFixed(2));

        const billSummary = {
            itemTotal: itemTotalValue,
            donationAmount: donationAmountValue,
            couponDiscount: couponDiscountValue,
            couponCode: couponCode ? couponCode.code : null,
            couponId: couponCode ? couponCode._id.toString() : null, // ✅ Add coupon ID for persistence
            shippingFee: shippingFeeValue,
            totalPayable: totalPayableValue,
            saved: savedValue,
            // ✅ Additional breakdown for clarity
            subtotal: itemTotalValue - couponDiscountValue, // After coupon discount
            finalTotal: totalPayableValue // Final amount to pay
        };

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                cartItems: enhancedCart.filter(Boolean), // Remove null items
                address,
                overallTotalAmount,
                overallShippingFee,
                overallGrandTotal,
                donate,
                couponCodeDiscount,
                // Coin information (only shown if user has previous orders)
                coins: hasPreviousOrder ? {
                    balance: userCoinBalance,
                    usable: coinsUsable,
                    earnable: coinsEarnable,
                    canBeUsed: totalCoinsCanBeUsed
                } : null,
                totalCoinsCanBeUsed: hasPreviousOrder ? (totalCoinsCanBeUsed > req.user.coins ? 0 : totalCoinsCanBeUsed) : 0,
                billSummary // Enhanced bill summary
            }
        });
    } catch (error) {
        console.error('Error in onlineStoreCartDetails:', error.message);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
    }
};

export const createOnlineOrder = async (req, res) => {
    try {
        const { coupon, donate = 0, addressId, coinUsed = 0 } = req.body;
        const userId = req.user._id;

        // 1️⃣ Fetch cart items for the user
        const carts = await OnlineStoreCart.find({ createdBy: userId, deleted: false })
            .populate("productId")
            .populate("unitId");

        if (carts.length < 1) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        // 2️⃣ Fetch the address
        const address = await Address.findOne({ createdBy: userId, _id: addressId });
        if (!address) {
            return res.status(400).json({ success: false, message: "Invalid address" });
        }

        // 3️⃣ Process cart items
        let totalAmount = 0;
        const productDetails = [];

        for (const cart of carts) {
            const product = cart.productId;
            const unit = cart.unitId;
            const quantity = cart.quantity || 1;

            if (!product || !unit) continue;

            const subCategory = await ProductSubCategory.findById(product.subCategoryId);
            const percentageOff = subCategory?.percentageOff || 0;

            let finalSellingPrice = unit.sellingPrice || 0;
            let finalMrp = unit.mrp || finalSellingPrice;

            // Apply premium discount if applicable
            if (req.user.isPremium && percentageOff > 0) {
                finalSellingPrice = Math.round(unit.sellingPrice * (1 - percentageOff / 100));
                finalMrp = unit.sellingPrice; // Original price as MRP
            }

            totalAmount += finalSellingPrice * quantity;

            productDetails.push({
                productId: product._id instanceof mongoose.Types.ObjectId ? product._id : new mongoose.Types.ObjectId(product._id),
                productPrice: finalSellingPrice,
                mrp: finalMrp,
                qty: unit.qty,
                quantity
            });
        }

        if (productDetails.length === 0) {
            return res.status(400).json({ success: false, message: "No valid products found in cart." });
        }

        // 4️⃣ Coupon logic
        let couponCodeDiscount = 0;
        let couponCode = null;
        if (coupon) {
            couponCode = await CouponCode.findById(coupon);
            if (!couponCode || couponCode.deleted) {
                return res.status(404).json({ success: false, message: "Coupon not found or deleted" });
            }

            if (couponCode.use === "one") {
                const alreadyUsed = await CouponHistory.findOne({ couponId: couponCode._id, userId });
                if (alreadyUsed) {
                    return res.status(400).json({ success: false, message: "Coupon already used" });
                }
            }

            if (couponCode.minPrice && totalAmount < couponCode.minPrice) {
                return res.status(400).json({ success: false, message: `Minimum purchase of ${couponCode.minPrice} required for this coupon` });
            }

            const rawDiscount = (totalAmount * couponCode.discount) / 100;
            couponCodeDiscount = couponCode.upto ? Math.min(rawDiscount, couponCode.upto) : rawDiscount;
        }

        // 5️⃣ Shipping fee
        const shippingFee = totalAmount > 500 ? 0 : 50;
        const subtotal = totalAmount - couponCodeDiscount + shippingFee + Number(donate);

        // 6️⃣ Validate and process coin usage
        let finalCoinUsed = 0;
        let coinsUsable = 0;
        const hasPreviousOrder = await hasPreviousOrders(userId, 'OnlineStore');

        if (hasPreviousOrder && Number(coinUsed) > 0) {
            // Calculate maximum coins user can use based on products
            let totalCoinsCanBeUsed = 0;
            for (const cart of carts) {
                const product = cart.productId;
                if (product && product.coinCanUsed) {
                    totalCoinsCanBeUsed += (product.coinCanUsed || 0) * (cart.quantity || 1);
                }
            }

            // Validate coins
            coinsUsable = await validateAndGetMaxCoinsUsable(userId, totalCoinsCanBeUsed, subtotal);
            finalCoinUsed = Math.min(Number(coinUsed), coinsUsable);

            // Deduct coins if user wants to use them
            if (finalCoinUsed > 0) {
                try {
                    await deductCoins(userId, finalCoinUsed, null, 'OnlineStore'); // Order ID will be set after order creation
                } catch (coinError) {
                    return res.status(400).json({ 
                        success: false, 
                        message: coinError.message || "Failed to deduct coins" 
                    });
                }
            }
        }

        const grandTotal = subtotal - finalCoinUsed;

        // ✅ Validate grandTotal
        if (!grandTotal || grandTotal <= 0) {
            return res.status(400).json({ success: false, message: "Order amount must be greater than zero" });
        }

        // 7️⃣ Calculate coins that will be earned (for display, not credited yet)
        const coinsEarned = await calculateCoinsEarned(productDetails);

        // 8️⃣ Cashfree payment session
        const paymentData = {
            order_currency: "INR",
            order_amount: grandTotal,
            order_tags: {
                forPayment: "OnlineStore",
                coupon: coupon || "",
                donate: donate.toString(),
                addressId,
                userId: userId.toString(),
                coinUsed: finalCoinUsed.toString()
            },
            customer_details: {
                customer_id: userId,
                customer_phone: req.user.phone.replace("+91", "").trim()
            }
        };

        const headers = {
            "x-api-version": process.env.CF_API_VERSION,
            "x-client-id": process.env.CF_CLIENT_ID,
            "x-client-secret": process.env.CF_CLIENT_SECRET,
            "Content-Type": "application/json"
        };

        const cashFreeSession = await axios.post(process.env.CF_CREATE_PRODUCT_URL, paymentData, { headers });

        // 9️⃣ Save the order in MongoDB
        const newOrder = new OnlineOrder({
            createdBy: userId,
            address: address.toObject ? address.toObject() : address,
            productDetails,
            orderId: `ONLINE_ORDER_${Date.now()}`,
            cf_order_id: cashFreeSession.data.order_id,
            status: "Pending",
            summary: {
                totalAmount,
                discountAmount: couponCodeDiscount,
                shippingFee,
                donate: Number(donate),
                grandTotal,
                coinUsed: finalCoinUsed,
                coinsEarned: coinsEarned,
                coinsCredited: false
            }
        });

        const savedOrder = await newOrder.save();
        console.log("Saved Order:", savedOrder);

        if (!savedOrder || !savedOrder._id) {
            // Refund coins if order creation failed
            if (finalCoinUsed > 0) {
                try {
                    await refundCoins(userId, finalCoinUsed, null, 'OnlineStore');
                } catch (refundError) {
                    console.error("Failed to refund coins after order creation failure:", refundError);
                }
            }
            return res.status(500).json({
                success: false,
                message: "Order created but ID could not be retrieved. Check server logs."
            });
        }

        // Update coin history with order ID if coins were used
        if (finalCoinUsed > 0) {
            await CoinHistory.updateOne(
                { createdBy: userId, orderId: null, type: 'Used', coins: finalCoinUsed },
                { $set: { orderId: savedOrder._id } }
            );
        }

        // ✅ Clear cart items immediately after order creation (before payment)
        // This ensures cart doesn't show items that are already in an order
        await OnlineStoreCart.updateMany(
            { createdBy: userId, deleted: false },
            { $set: { deleted: true } }
        );

        // Calculate enhanced bill summary
        const billSummary = {
            itemTotal: totalAmount,
            donationAmount: Number(donate),
            couponDiscount: couponCodeDiscount,
            couponCode: coupon ? couponCode.code : null,
            shippingFee: shippingFee,
            totalPayable: grandTotal,
            saved: couponCodeDiscount // Amount saved through coupon
        };

        return res.status(200).json({
            success: true,
            message: "Order created successfully",
            billSummary, // Include complete bill summary
            data: {
                _id: savedOrder._id.toString(),
                paymentSessionId: cashFreeSession.data.payment_session_id,
                cf_order_id: cashFreeSession.data.order_id
            }
        });
    } catch (error) {
        console.error("Error in createOnlineOrder:", error);
        // ✅ Avoid duplicate response
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: error.message || "Internal server error" });
        }
        return catchError("createOnlineOrder", error, req, res);
    }
};

export const cancelOnlineOrder = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                status: 400,
                success: false,
                message: "Order ID is missing in URL",
            });
        }

        const orderIdentifier = String(id).trim();

        // 1️⃣ Check order exists for this user (allow either Mongo _id or human readable orderId)
        const orderQuery = { createdBy: new ObjectId(req.user._id) };

        // Try to convert to ObjectId if valid, otherwise use as orderId string
        if (ObjectId.isValid(orderIdentifier)) {
            try {
                orderQuery._id = new ObjectId(orderIdentifier);
            } catch (e) {
                orderQuery.orderId = orderIdentifier;
            }
        } else {
            orderQuery.orderId = orderIdentifier;
        }

        const order = await OnlineOrder.findOne(orderQuery);

        if (!order) {
            return res.status(404).json({
                status: 404,
                success: false,
                message: "Order not found with this ID",
            });
        }

        // Check if order is already cancelled
        if (order.status === "Cancelled") {
            return res.status(400).json({
                status: 400,
                success: false,
                message: "Order is already cancelled",
            });
        }

        // Validate order summary exists
        if (!order.summary || typeof order.summary.grandTotal !== 'number') {
            return res.status(400).json({
                status: 400,
                success: false,
                message: "Invalid order data. Order summary is missing.",
            });
        }

        // 2️⃣ Get payment details (handle legacy field paymentResonse + new paymentResponse)
        let payment = null;
        try {
            const paymentResult = await Payment.findOne({
                onlineOrderId: new ObjectId(order._id)
            });
            // Ensure payment is a valid object
            if (paymentResult && typeof paymentResult === 'object' && paymentResult._id) {
                payment = paymentResult;
            }
        } catch (paymentError) {
            console.log("Payment lookup error:", paymentError);
            payment = null; // Explicitly set to null
        }

        // Safely extract cfOrderId with proper null checks - using optional chaining everywhere
        let cfOrderId = null;
        if (payment && typeof payment === 'object' && payment !== null) {
            try {
                // Try new field first with optional chaining
                const paymentResponse = payment?.paymentResponse;
                if (paymentResponse && typeof paymentResponse === 'object') {
                    cfOrderId = paymentResponse?.order?.order_id || null;
                }

                // Try legacy typo field with optional chaining (only if cfOrderId not found)
                if (!cfOrderId) {
                    const paymentResonse = payment?.paymentResonse;
                    if (paymentResonse && typeof paymentResonse === 'object') {
                        cfOrderId = paymentResonse?.order?.order_id || null;
                    }
                }

                // Try direct field with optional chaining (only if cfOrderId not found)
                if (!cfOrderId && payment?.cfoOrder_id) {
                    cfOrderId = String(payment.cfoOrder_id);
                }
            } catch (e) {
                console.log("Error extracting cfOrderId from payment:", e);
                try {
                    console.log("Payment object type:", typeof payment);
                    if (payment && typeof payment === 'object') {
                        console.log("Payment has _id:", !!payment._id);
                    }
                } catch (logError) {
                    console.log("Could not log payment details");
                }
                // Set payment to null if extraction fails to prevent further errors
                payment = null;
            }
        }

        // Fallback to order's cf_order_id if payment doesn't have it
        if (!cfOrderId && order.cf_order_id) {
            cfOrderId = String(order.cf_order_id);
        }

        // If no payment or no cfOrderId, just cancel the order without refund
        if (!payment || !cfOrderId) {
            try {
                await OnlineOrder.findByIdAndUpdate(order._id, {
                    status: "Cancelled",
                    refund: false,
                });

                // Refund coins if they were used (even without payment)
                const coinUsed = order.summary?.coinUsed || 0;
                if (coinUsed > 0) {
                    try {
                        await User.findByIdAndUpdate(req.user._id, {
                            $inc: { coins: coinUsed },
                        });

                        await CoinHistory.create({
                            createdBy: req.user._id,
                            coins: coinUsed,
                            orderId: order._id,
                            type: "Refunded",
                        });
                    } catch (coinError) {
                        console.log("Coin refund error:", coinError);
                        // Continue even if coin refund fails
                    }
                }

                return res.status(200).json({
                    status: 200,
                    success: true,
                    message: "Order cancelled successfully. Payment was not captured, so no refund required.",
                });
            } catch (updateError) {
                console.log("Order update error:", updateError);
                return res.status(500).json({
                    status: 500,
                    success: false,
                    message: "Failed to cancel order. Please try again.",
                });
            }
        }

        // 3️⃣ Create refund via Cashfree API (only if payment exists)
        const refundId = `REFUND_${Date.now()}_${order._id.toString().slice(-6)}`;
        let refundResponse = null;

        try {
            const refundUrl = `${process.env.CF_CREATE_PRODUCT_URL}/${cfOrderId}/refunds`;

            if (!process.env.CF_CLIENT_ID || !process.env.CF_CLIENT_SECRET) {
                throw new Error("Cashfree credentials not configured");
            }

            const refund = await axios.post(
                refundUrl,
                {
                    refund_amount: order.summary.grandTotal,
                    refund_id: refundId,
                },
                {
                    headers: {
                        "x-api-version": process.env.CF_API_VERSION || "2023-08-01",
                        "x-client-id": process.env.CF_CLIENT_ID,
                        "x-client-secret": process.env.CF_CLIENT_SECRET,
                        "Content-Type": "application/json",
                    },
                    timeout: 30000, // 30 second timeout
                }
            );

            refundResponse = refund.data;
        } catch (refundError) {
            console.log("Cashfree refund API error:", refundError?.response?.data || refundError.message);

            // If refund API fails, still cancel the order but mark it appropriately
            await OnlineOrder.findByIdAndUpdate(order._id, {
                status: "Cancelled",
                refund: false,
            });

            return res.status(200).json({
                status: 200,
                success: true,
                message: "Order cancelled. Refund processing failed, please contact support.",
                note: "Order has been cancelled but refund needs manual processing.",
            });
        }

        // 4️⃣ Save refund record
        try {
            await Refund.create({
                type: "OnlineStore",
                cfOrderId: cfOrderId,
                cfOrderResponseId: cfOrderId,
                refundResponse: refundResponse,
                userId: req.user._id,
                onlineOrderId: order._id,
                amount: order.summary.grandTotal,
                refundId,
                cancelled: true,
            });
        } catch (refundSaveError) {
            console.log("Refund save error:", refundSaveError);
            // Continue even if refund record save fails
        }

        // 5️⃣ Mark refund in payment
        if (payment && payment._id) {
            try {
                await Payment.findByIdAndUpdate(payment._id, {
                    refund: true,
                    refundId,
                });
            } catch (paymentUpdateError) {
                console.log("Payment update error:", paymentUpdateError);
                // Continue even if payment update fails
            }
        }

        // 6️⃣ Update order
        await OnlineOrder.findByIdAndUpdate(order._id, {
            status: "Cancelled",
            refund: true,
            refundId,
        });

        // 7️⃣ Refund coins if they were used in the order
        const coinUsed = order.summary?.coinUsed || 0;
        if (coinUsed > 0) {
            try {
                await User.findByIdAndUpdate(req.user._id, {
                    $inc: { coins: coinUsed },
                });

                await CoinHistory.create({
                    createdBy: req.user._id,
                    coins: coinUsed,
                    orderId: order._id,
                    type: "Refunded",
                });
            } catch (coinError) {
                console.log("Coin refund error:", coinError);
                // Continue even if coin refund fails
            }
        }

        return res.status(200).json({
            status: 200,
            success: true,
            message: "Order cancelled and refund processed successfully",
        });

    } catch (error) {
        console.log("❌ Cancel Order Error:", error);
        console.log("Error stack:", error.stack);

        // Ensure response is sent only once
        if (!res.headersSent) {
            return res.status(500).json({
                status: 500,
                success: false,
                message: error.message || "Internal Server Error",
            });
        }
    }
};



export const onlineOrderList = async (req, res) => {
    try {

        let { skip } = req.query;
        skip = skip ? skip : 1;

        const list = await OnlineOrder.aggregate([
            {
                $match: {
                    createdBy: new ObjectId(req.user._id)
                }
            },
            {
                $unwind: {
                    path: "$productDetails",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "online_products",
                    localField: "productDetails.productId",
                    foreignField: "_id",
                    as: "productInfo"
                }
            },
            {
                $unwind: {
                    path: "$productInfo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    "productDetails.productName": "$productInfo.name",
                    "productDetails.productImages": "$productInfo.images",
                    "productDetails.manufacturer": "$productInfo.manufacturer",
                    "productDetails.totalAmount": {
                        $multiply: ["$productDetails.productPrice", "$productDetails.quantity"]
                    }
                }
            },
            {
                $group: {
                    _id: "$_id",
                    orderId: { $first: "$orderId" },
                    status: { $first: "$status" },
                    isReturn: { $first: "$isReturn" },
                    returnStatus: { $first: "$returnStatus" },
                    summary: { $first: "$summary" },
                    createdAt: { $first: "$createdAt" },
                    updatedAt: { $first: "$updatedAt" },
                    productDetails: { $push: "$productDetails" }
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $skip: (skip - 1) * limit
            },
            {
                $limit: limit
            }
        ]);

        const formattedResponse = list.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            status: order.status,
            isReturn: order.isReturn || undefined,
            returnStatus: order.returnStatus || undefined,
            totalPrice: order.summary.grandTotal,
            discountAmount: order.summary.discountAmount,
            shippingFee: order.summary.shippingFee,
            createdAt: order.createdAt,
            totalQuantity: order.totalQuantity,
            estimatedDate: order.estimatedDate || null,
            deliverdTime: order.deliverdTime || null,
            products: order.productDetails.map(product => ({
                productName: product.productName,
                manufacturer: product.manufacturer,
                qty: product.qty || null,
                productImages: product.productImages,
                price: product.productPrice,
                mrp: product.mrp || null,
                quantity: product.quantity,
                totalAmount: product.totalAmount,
                status: order.status
            }))
        }));

        res.status(200).json({ success: true, data: formattedResponse });
    } catch (error) {
        console.error("error", error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('onlineOrderList', error, req, res);
    }
};

export const onlineOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // ✅ Validate ID format
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid order ID format"
            });
        }

        // Check if the order exists for the given ID and user
        const orderExists = await OnlineOrder.findOne({
            _id: new ObjectId(id),
            createdBy: new ObjectId(req.user._id)
        });

        if (!orderExists) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found with this ID"
            });
        }

        let details = [];
        try {
            details = await OnlineOrder.aggregate([
                {
                    $match: {
                        _id: new mongoose.Types.ObjectId(id),
                        createdBy: new mongoose.Types.ObjectId(req.user._id)
                    }
                },
                {
                    $unwind: {
                        path: "$productDetails",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: "online_products",
                        localField: "productDetails.productId",
                        foreignField: "_id",
                        as: "productInfo"
                    }
                },
                {
                    $unwind: {
                        path: "$productInfo",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $addFields: {
                        "productDetails.productName": {
                            $ifNull: [
                                "$productInfo.name",
                                "$productDetails.productName",
                                "Product Not Found"
                            ]
                        },
                        "productDetails.productImages": {
                            $ifNull: [
                                "$productInfo.images",
                                "$productDetails.productImages",
                                []
                            ]
                        },
                        "productDetails.manufacturer": {
                            $ifNull: [
                                "$productInfo.manufacturer",
                                "$productDetails.manufacturer",
                                "Unknown"
                            ]
                        },
                        "productDetails.totalAmount": {
                            $cond: {
                                if: {
                                    $and: [
                                        { $ne: ["$productDetails.productPrice", null] },
                                        { $ne: ["$productDetails.quantity", null] }
                                    ]
                                },
                                then: {
                                    $multiply: [
                                        { $ifNull: ["$productDetails.productPrice", 0] },
                                        { $ifNull: ["$productDetails.quantity", 0] }
                                    ]
                                },
                                else: 0
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$_id",
                        orderId: { $first: "$orderId" },
                        estimatedDate: { $first: "$estimatedDate" },
                        deliverdTime: { $first: "$deliverdTime" },
                        status: { $first: "$status" },
                        isReturn: { $first: { $ifNull: ["$isReturn", false] } },
                        returnStatus: { $first: { $ifNull: ["$returnStatus", null] } },
                        summary: { $first: "$summary" },
                        invoiceUrl: { $first: "$invoiceUrl" },
                        createdAt: { $first: "$createdAt" },
                        updatedAt: { $first: "$updatedAt" },
                        address: { $first: "$address" },
                        products: { 
                            $push: {
                                $cond: {
                                    if: { $ne: ["$productDetails", null] },
                                    then: "$productDetails",
                                    else: "$$REMOVE"
                                }
                            }
                        }
                    }
                }
            ]);
        } catch (aggregateError) {
            console.error('Error in onlineOrderDetails aggregation:', aggregateError.message);
            console.error('Stack trace:', aggregateError.stack);
            return res.status(status.InternalServerError).json({
                status: jsonStatus.InternalServerError,
                success: false,
                message: "Failed to retrieve order details due to a server error"
            });
        }

        if (!details || !details.length) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order details not found"
            });
        }

        const orderDetail = details[0];
        
        // ✅ Ensure summary exists with default values
        const orderSummary = orderDetail.summary || {};
        
        const formattedDetails = {
            _id: orderDetail._id,
            orderId: orderDetail.orderId || null,
            estimatedDate: orderDetail.estimatedDate || null,
            deliverdTime: orderDetail.deliverdTime || null,
            status: orderDetail.status || "Pending",
            isReturn: orderDetail.isReturn || false,
            returnStatus: orderDetail.returnStatus || null,
            totalPrice: orderSummary.grandTotal || 0,
            discountAmount: orderSummary.discountAmount || 0,
            shippingFee: orderSummary.shippingFee || 0,
            createdAt: orderDetail.createdAt || new Date(),
            summary: orderSummary,
            invoiceUrl: orderDetail.invoiceUrl || null,
            address: orderDetail.address || null,
            products: (orderDetail.products || []).filter(p => p !== null && p !== undefined).map(product => ({
                productName: product.productName || "Product Not Found",
                manufacturer: product.manufacturer || "Unknown",
                productImages: Array.isArray(product.productImages) ? product.productImages : (product.productImages ? [product.productImages] : []),
                price: product.productPrice || 0,
                mrp: product.mrp || null,
                quantity: product.quantity || 0,
                qty: product.qty || product.quantity || 0,
                totalAmount: product.totalAmount || 0,
            }))
        };

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: formattedDetails
        });

    } catch (error) {
        console.error("Error in onlineOrderDetails:", error.message);
        console.error("Stack trace:", error.stack);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message || "Internal server error"
        });
        return catchError('onlineOrderDetails', error, req, res);
    }
};

export const returnChangeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { ReturnStatus, reason, comment } = req.body;

        let returnImage;

        if (req.file) {
            returnImage = req.file.key
        }

        if (!ReturnStatus) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Return status can't be empty",
            });
        }

        if (!reason) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                messages: "Reason can't be empty"
            });
        }

        const statusArr = ["Pending"];

        if (!statusArr.includes(ReturnStatus)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please enter valid refund status status",
            });
        }

        const orderData = await OnlineOrder.findById(id);

        if (!orderData) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Order not found",
            });
        }

        const today = new Date();
        const orderDate = new Date(orderData.createdAt);
        const daysBetween = Math.ceil(
            Math.abs(today - orderDate) / (1000 * 60 * 60 * 24)
        );
        if (daysBetween > 7) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order can't be return after 7 days",
            });
        }

        let changeReturnStatus = {};

        if (ReturnStatus === "Pending") {

            const returnRecord = await Return.create({
                order: id,
                reason,
                comment: comment || undefined,
                returnImage: returnImage || undefined,
            });

            if (!returnRecord) {
                return res.status(status.BadRequest).json({
                    status: jsonStatus.BadRequest,
                    success: false,
                    messages: "Error Creating Return Order"
                })
            }

            changeReturnStatus = await OnlineOrder.findByIdAndUpdate(
                id,
                { returnStatus: ReturnStatus, isReturn: true },
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
        return catchError("refundChangeStatus", error, req, res);
    }
};

export const returnCancellStatus = async (req, res) => {
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

        const statusArr = ["Cancelled"];

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

        // const today = new Date();
        // const orderDate = new Date(isOrder.createdAt);
        // const daysBetween = Math.ceil(
        //   Math.abs(today - orderDate) / (1000 * 60 * 60 * 24)
        // );
        // if (daysBetween > 7) {
        //   return res.status(status.BadRequest).json({
        //     status: jsonStatus.BadRequest,
        //     success: false,
        //     message: "Order can't be return after 7 days",
        //   });
        // }

        let changeReturnStatus = {};

        if (isOrder.returnStatus === "Approved") {
            return res.status(status.NotAcceptable).json({
                status: jsonStatus.BadRequest,
                success: false,
                messages: "Return order already accepted by admin"
            })
        }

        if (ReturnStatus === "Cancelled") {
            changeReturnStatus = await OnlineOrder.findByIdAndUpdate(
                id,
                { retundStatus: ReturnStatus },
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
    }
};

export const onlineOrderChangeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { orderStatus, estimatedDate } = req.body;

        if (!orderStatus) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order status can't be empty",
            });
        }

        const statusArr = [
            "Accepted",
            "Rejected",
            "Product shipped",
            "On the way",
            "Out for delivery",
            "Your Destination",
            "Delivered",
            "Cancelled",
        ];

        if (!statusArr.includes(orderStatus)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please enter valid order status status",
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

        let changeOrderStatus = {};

        if (orderStatus === "Delivered") {
            changeOrderStatus = await OnlineOrder.findByIdAndUpdate(
                id,
                { 
                    status: orderStatus, 
                    estimatedDate,
                    deliverdTime: new Date()
                },
                { new: true, runValidators: true }
            );

            // ✅ Credit coins only when order is delivered (if not already credited)
            if (changeOrderStatus && !changeOrderStatus.summary?.coinsCredited) {
                const coinsEarned = changeOrderStatus.summary?.coinsEarned || 0;
                if (coinsEarned > 0) {
                    try {
                        const { creditCoins } = await import('../helper/coinHelper.js');
                        await creditCoins(
                            changeOrderStatus.createdBy.toString(),
                            coinsEarned,
                            changeOrderStatus._id,
                            'OnlineStore'
                        );
                        
                        // Mark coins as credited
                        await OnlineOrder.findByIdAndUpdate(id, {
                            'summary.coinsCredited': true
                        });
                    } catch (coinError) {
                        console.error('Error crediting coins on delivery:', coinError);
                        // Continue even if coin credit fails
                    }
                }
            }
        } else {
            changeOrderStatus = await OnlineOrder.findByIdAndUpdate(
                id,
                { status: orderStatus, estimatedDate },
                { new: true, runValidators: true }
            );
        }

        // if (orderStatus === "Accepted") {
        //   changeOrderStatus = await Order.findByIdAndUpdate(
        //     id,
        //     { status: orderStatus, estimatedDate },
        //     { new: true, runValidators: true }
        //   );
        // } else if (orderStatus === "Delivered") {
        //   changeOrderStatus = await Order.findByIdAndUpdate(
        //     id,
        //     { status: orderStatus, deliverdTime: new Date() },
        //     { new: true, runValidators: true }
        //   );
        // } else if (orderStatus === "Rejected") {
        //   // refund
        //   const paymentResponse = await Payment.findOne({ orderId: id });

        //   const refundId = `REFUND_${Date.now()}`;
        //   const refund = await axios.post(
        //     `${process.env.CF_CREATE_PRODUCT_URL}/${paymentResponse.paymentResonse.order.order_id}/refunds`,
        //     {
        //       refund_amount: isOrder.summary.grandTotal,
        //       refund_id: refundId,
        //     },
        //     {
        //       headers: {
        //         "x-api-version": "2023-08-01",
        //         "x-client-id": process.env.CF_CLIENT_ID,
        //         "x-client-secret": process.env.CF_CLIENT_SECRET,
        //         "Content-Type": "application/json",
        //       },
        //     }
        //   );

        //   let newRefund = new Refund({
        //     type: "LocalStore",
        //     cfOrderId: isOrder.cf_order_id,
        //     cfOrderResponseId: paymentResponse.paymentResonse.order.order_id,
        //     refundResponse: refund.data,
        //     userId: req.user._id,
        //     orderId: isOrder._id,
        //     amount: isOrder.summary.grandTotal,
        //     refundId,
        //     rejected: true,
        //     retailerId: req.user._id,
        //   });
        //   newRefund = await newRefund.save();

        //   await Payment.findByIdAndUpdate(paymentResponse._id, {
        //     refund: true,
        //     refundId,
        //   });

        //   changeOrderStatus = await Order.findByIdAndUpdate(
        //     id,
        //     { status: orderStatus, refund: true, refundId },
        //     { new: true, runValidators: true }
        //   );
        // } else {
        //   changeOrderStatus = await Order.findByIdAndUpdate(
        //     id,
        //     { status: orderStatus },
        //     { new: true, runValidators: true }
        //   );
        // }

        res
            .status(status.OK)
            .json({ status: jsonStatus.OK, success: true, data: changeOrderStatus });
    } catch (error) {
        console.error("error", error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message,
        });
        return catchError("orderChangeStatus", error, req, res);
    }
};
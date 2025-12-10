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
import User from '../models/User.js';
import ProductSubCategory from '../models/OnlineStore/SubCategory.js';
import CouponHistory from '../models/CouponHistory.js';
import PopularCategory from '../models/PopularCategory.js';

const { ObjectId } = mongoose.Types;

let limit = process.env.LIMIT;
limit = limit ? Number(limit) : 10;

// Admin-created online products must stay hidden from user-facing flows
const HIDE_ADMIN_ONLINE_PRODUCTS = true;

// Calculate Offer Percentage
const calculateOffPer = (mrp, sellingPrice) => {
    const discount = ((mrp - sellingPrice) / mrp) * 100;
    const returnedValue = discount % 1 === 0 ? discount.toFixed(0) : discount.toFixed(2);
    return `${returnedValue}`; // numeric string; UI can append "% OFF"
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

        const list = await Category.find({ deleted: false });

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

        // If the caller is a seller, only return products created by that seller
        const sellerFilter = (req?.user && req.user.role === "seller")
            ? { createdBy: req.user._id }
            : {};

        const list = await OnlineProduct.aggregate([
            {
                $match: {
                    deleted: false,
                    ...sellerFilter,
                    $or: [
                        { name: { $regex: regex } },
                        { manufacturer: { $regex: regex } }
                    ]
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
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
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
                    productCategory: { $arrayElemAt: ["$productCategory", 0] }
                }
            }
        ]);
        if (!details[0]) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found with this ID" });
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
        icon: subCategory.icon || null,
        displayIcon: subCategory.icon || subCategory.image || null, // Preferred: icon, fallback: image
        hasSvgIcon: subCategory.icon && subCategory.icon.endsWith('.svg')
    };
};

export const onlineStoreHomePage = async (req, res) => {
    try {
        // Fetch subcategories (limit 8)
        const subCategoriesRaw = await SubCategory.aggregate([
            { $match: { deleted: false } },
            { $limit: 8 }
        ]);
        
        // Normalize subcategories to ensure icon field is properly included
        const subCategories = subCategoriesRaw.map(normalizeSubCategory);

        // Fetch categories (limit 8) - only online store categories
        const categories = await Category.aggregate([
            { $match: { deleted: false } },
            { $limit: 8 }
        ]);

        // Fetch popular categories (PopularCategory) - limit 8 (admin-managed)
        const popularCategories = await PopularCategory.aggregate([
            { $match: { deleted: false } },
            { $sort: { createdAt: -1 } },
            { $limit: 8 }
        ]);

        // Fetch brands (limit 8)
        const brands = await Brand.aggregate([
            { $match: { deleted: false } },
            { $limit: 8 }
        ]);

        // Hide admin-created online products from user-facing home page
        if (HIDE_ADMIN_ONLINE_PRODUCTS) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                data: {
                    subCategories,
                    categories,
                    popularCategories,
                    brands,
                    trendingProducts: [],
                    totalCartCount: 0
                }
            });
        }

        // Fetch trending products (limit 5)
        const trendingProducts = await OnlineProduct.aggregate([
            { $match: { deleted: false, trending: true } },
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
            data: { 
                subCategories, 
                categories, 
                popularCategories, // Popular categories from admin
                brands, 
                trendingProducts, 
                totalCartCount 
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('onlineStoreHomePage', error, req, res);
    }
};

export const allTrendingProducts = async (req, res) => {
    try {
        if (HIDE_ADMIN_ONLINE_PRODUCTS) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                data: {
                    products: [],
                    totalCount: 0,
                    totalCartCount: 0
                }
            });
        }
        const search = req.query.search?.trim() || '';
        const page = parseInt(req.query.skip) || 1;
        const skip = (page - 1) * limit;

        // Build match conditions
        const matchConditions = { deleted: false, trending: true };
        
        // Add search filter if provided
        if (search) {
            matchConditions.name = { $regex: search, $options: 'i' };
        }

        const trendingProducts = await OnlineProduct.aggregate([
            { $match: matchConditions },
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

        // Build count match conditions (same as main query)
        const countMatchConditions = { deleted: false, trending: true };
        if (search) {
            countMatchConditions.name = { $regex: search, $options: 'i' };
        }

        const totalCount = await OnlineProduct.countDocuments(countMatchConditions);

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
                    ...(search && {
                        name: { $regex: search, $options: 'i' }
                    })
                }
            }
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

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: { data, totalCartCount } });
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
            const [itemsRaw, total] = await Promise.all([
                SubCategory.aggregate([
                    { $match: exploreMatch },
                    { $sort: { createdAt: -1 } },
                    { $skip: skipCalc(explorePage, exploreLimitVal) },
                    { $limit: exploreLimitVal }
                ]),
                SubCategory.countDocuments(exploreMatch)
            ]);
            // Normalize subcategories to ensure icon field is properly included
            const items = itemsRaw.map(normalizeSubCategory);
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
                viewAllEndpoint: "/api/online/store/all/sub/categories/v1"
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

        const [itemsRaw, total] = await Promise.all([
            SubCategory.aggregate([
                { $match: match },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ]),
            SubCategory.countDocuments(match)
        ]);
        
        // Normalize subcategories to ensure icon field is properly included
        const items = itemsRaw.map(normalizeSubCategory);

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
                    viewAllEndpoint: "/api/online/store/all/sub/categories/v1"
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

        const match = buildMatchStage(search);
        const skip = (page - 1) * pageSize;

        // Fetch both regular categories and popular categories from admin
        const [categoryItems, popularCategoryItems, categoryTotal, popularCategoryTotal] = await Promise.all([
            Category.aggregate([
                { $match: match },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ]),
            PopularCategory.aggregate([
                { 
                    $match: { 
                        deleted: false,
                        ...(search && { name: { $regex: search, $options: 'i' } })
                    } 
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ]),
            Category.countDocuments(match),
            PopularCategory.countDocuments({ 
                deleted: false,
                ...(search && { name: { $regex: search, $options: 'i' } })
            })
        ]);

        // Combine both types of categories, prioritizing PopularCategory
        const combinedItems = [...popularCategoryItems, ...categoryItems];
        const total = popularCategoryTotal + categoryTotal;

        const totalCartCount = await fetchUserCartCount(req.user._id);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                totalCartCount,
                ...buildSectionResponse({
                    key: "popularCategories",
                    title: "Popular Categories",
                    description: "Top categories users are browsing right now",
                    items: combinedItems,
                    total,
                    page,
                    pageSize,
                    viewAllEndpoint: "/api/online/store/all/categories/v1"
                })
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('onlineStorePopularCategories', error, req, res);
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
        if (HIDE_ADMIN_ONLINE_PRODUCTS) {
            return res.status(status.OK).json({
                status: jsonStatus.OK,
                success: true,
                data: [],
                total: 0
            });
        }

        const { category, subcategory, brand, search, skip } = req.query;

        const page = parseInt(skip) || 1; // Default to page 1 if not provided
        const offset = (page - 1) * limit; // Calculate the skip value

        // Build the query conditions
        const query = { deleted: false };

        // Apply category, subcategory, and brand filters if provided
        if (category) query.categoryId = new ObjectId(category);
        if (subcategory) query.subCategoryId = new ObjectId(subcategory);
        if (brand) query.brandId = new ObjectId(brand);

        // Apply search filter on the name field using regex
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        // Fetch products with applied filters and pagination
        const products = await OnlineProduct.aggregate([
            {
                $match: query
            },
            {
                $lookup: {
                    from: "product_brands",
                    localField: "brandId",
                    foreignField: "_id",
                    as: "brand"
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
                $project: {
                    units: 1,
                    images: 1,
                    name: 1,
                    manufacturer: 1,
                    subCategoryPercentageOff: "$subCategory.percentageOff"
                }
            },
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

                        product.units = {
                            ...product.units,
                            mrp: sellingPrice, // Show selling price as MRP
                            sellingPrice: discountPrice, // Apply new discount price
                            offPer: `${subcategoryPercentage}` // numeric string; UI can append "% OFF"
                        };
                    }
                }
            });
        }

        const productIds = products.map(p => p._id);
        const unitIds = products.map(p => p.units?._id).filter(Boolean);

        const cartItems = await OnlineStoreCart.find({
            deleted: false,
            createdBy: req.user._id,
            productId: { $in: productIds },
            unitId: { $in: unitIds }
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

        const totalCount = await OnlineProduct.countDocuments(query);

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

                    return {
                        ...unit,
                        mrp: unit.sellingPrice, // Show selling price as MRP
                        sellingPrice: discountPrice, // Apply discount
                        offPer: `${subcategoryPercentage}` // numeric string; UI can append "% OFF"
                    };
                });
            }
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

                        product.productUnits = {
                            ...product.productUnits,
                            mrp: sellingPrice, // Show selling price as MRP
                            sellingPrice: discountPrice, // Apply new discount price
                            offPer: `${subcategoryPercentage}` // numeric string; UI can append "% OFF"
                        };
                    }
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

        if (!productId || !unitId) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter Product ID and Unit ID` });
        }

        const productDetails = await OnlineProduct.findById(productId);
        if (!productDetails) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found" });
        }

        if (productDetails.deleted) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "You can't add deleted product in to the Cart" });
        }

        const productUnit = await ProductUnit.findOne({ parentProduct: productId, _id: unitId });
        if (!productUnit) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product Unit not found" });
        }

        if (productUnit.deleted) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "You can't add deleted product unit in to the Cart" });
        }

        const findProductInCart = await OnlineStoreCart.findOne({ createdBy: req.user._id, productId, unitId, deleted: false });
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

            res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Product added in to the Cart", count: findProductInCart.quantity, totalCartCount });
        } else {
            let newCart = new OnlineStoreCart({ productId, unitId, createdBy: req.user._id, quantity: quantity || 1 });
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

        const findProduct = await OnlineProduct.findById(productId);
        if (!findProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product is not found with this ID" });
        }

        const findProductUnit = await ProductUnit.findOne({ parentProduct: productId, _id: unitId });
        if (!findProductUnit) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product unit is not found with this ID" });
        }

        const findCart = await OnlineStoreCart.findOne({ productId, unitId, createdBy: req.user._id, deleted: false });
        if (!findCart) {
            let newCart = new OnlineStoreCart({ productId, unitId, createdBy: req.user._id, quantity: 1 });
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

        const findProduct = await OnlineProduct.findById(productId);
        if (!findProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product is not found with this ID" });
        }

        const findProductUnit = await ProductUnit.findOne({ parentProduct: productId, _id: unitId });
        if (!findProductUnit) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product unit is not found with this ID" });
        }

        const findCart = await OnlineStoreCart.findOne({ productId, unitId, createdBy: req.user._id, deleted: false });
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

        const findCart = await OnlineStoreCart.findOne({ productId, unitId, deleted: false, createdBy: req.user._id });
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

            if (!product || !unit) return null;

            // Fetch subcategory details to get percentageOff
            const subCategory = await ProductSubCategory.findById(product.subCategoryId);
            const percentageOff = subCategory?.percentageOff || 0;

            let modifiedUnit = { ...unit.toObject() };

            if (req.user.isPremium && percentageOff > 0) {
                const discountPrice = Math.round(modifiedUnit.sellingPrice * (1 - percentageOff / 100));

                modifiedUnit = {
                    ...modifiedUnit,
                    mrp: modifiedUnit.sellingPrice, // Show selling price as MRP
                    sellingPrice: discountPrice, // Apply discount
                    offPer: `${percentageOff}` // numeric string; UI can append "% OFF"
                };
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

        if (coupon) {
            const couponCode = await CouponCode.findById(coupon);

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
        overallGrandTotal = overallTotalAmount - couponCodeDiscount + overallShippingFee + donate;

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
                totalCoinsCanBeUsed: totalCoinsCanBeUsed > req.user.coins ? 0 : totalCoinsCanBeUsed // New field added
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
      if (coupon) {
        const couponCode = await CouponCode.findById(coupon);
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
      const grandTotal = totalAmount - couponCodeDiscount + shippingFee + Number(donate) - Number(coinUsed);
  
      // ✅ Validate grandTotal
      if (!grandTotal || grandTotal <= 0) {
        return res.status(400).json({ success: false, message: "Order amount must be greater than zero" });
      }
  
      // 6️⃣ Cashfree payment session
      const paymentData = {
        order_currency: "INR",
        order_amount: grandTotal,
        order_tags: {
          forPayment: "OnlineStore",
          coupon: coupon || "",
          donate: donate.toString(),
          addressId,
          userId: userId.toString(),
          coinUsed: coinUsed.toString()
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
  
      // 7️⃣ Save the order in MongoDB
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
          coinUsed: Number(coinUsed)
        }
      });
  
      const savedOrder = await newOrder.save();
      console.log("Saved Order:", savedOrder);
  
      if (!savedOrder || !savedOrder._id) {
        return res.status(500).json({
          success: false,
          message: "Order created but ID could not be retrieved. Check server logs."
        });
      }
  
      return res.status(200).json({
        success: true,
        message: "Order created successfully",
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

        // Check if the order exists for the given ID and user
        const orderExists = await OnlineOrder.findOne({
            _id: new ObjectId(id),
            createdBy: new ObjectId(req.user._id)
        });

        if (!orderExists) {
            return res.status(404).json({
                success: false,
                message: "Order not found with this ID"
            });
        }

        const details = await OnlineOrder.aggregate([
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
                    estimatedDate: { $first: "$estimatedDate" },
                    deliverdTime: { $first: "$deliverdTime" },
                    status: { $first: "$status" },
                    isReturn: { $first: "$isReturn" },
                    returnStatus: { $first: "$returnStatus"},
                    summary: { $first: "$summary" },
                    invoiceUrl: { $first: "$invoiceUrl" },
                    createdAt: { $first: "$createdAt" },
                    updatedAt: { $first: "$updatedAt" },
                    address: { $first: "$address" },
                    products: { $push: "$productDetails" }
                }
            }
        ]);

        if (!details.length) {
            return res.status(404).json({
                success: false,
                message: "Order details not found"
            });
        }

        const formattedDetails = {
            _id: details[0]._id,
            orderId: details[0].orderId,
            estimatedDate: details[0].estimatedDate || null,
            deliverdTime: details[0].deliverdTime || null,
            status: details[0].status,
            isReturn: details[0].isReturn,
            returnStatus: details[0].returnStatus,
            totalPrice: details[0].summary.grandTotal,
            discountAmount: details[0].summary.discountAmount,
            shippingFee: details[0].summary.shippingFee,
            createdAt: details[0].createdAt,
            summary: details[0].summary,
            invoiceUrl: details[0].invoiceUrl || null,
            address: details[0].address,
            products: details[0].products.map(product => ({
                productName: product.productName,
                manufacturer: product.manufacturer,
                productImages: product.productImages,
                price: product.productPrice,
                mrp: product.mrp || null,
                quantity: product.quantity,
                qty: product.qty,
                totalAmount: product.totalAmount,
            }))
        };

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: formattedDetails
        });

    } catch (error) {
        console.error("error", error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
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

    if(!reason) {
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

      if(!returnRecord) {
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
    const { orderStatus , estimatedDate } = req.body;

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
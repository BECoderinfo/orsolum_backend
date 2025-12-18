import PopularCategory from "../models/PopularCategory.js";
import { signedUrl } from '../helper/s3.config.js';
import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import OnlineOrder from "../models/OnlineStore/OnlineOrder.js";
import Product from "../models/Product.js";
import Category from "../models/OnlineStore/Category.js";

export const uploadPopularCategoryImage = async (req, res) => {
  try {
    signedUrl(req, res, "Popular_Category/");
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("uploadPopularCategoryImage", error, req, res);
  }
};

export const createPopularCategory = async (req, res) => {
  try {
    const { name, image, storeCategoryId } = req.body;
    const uploadedImagePath = req.file?.key;
    const finalImage = image || uploadedImagePath;

    if (!name || !finalImage) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please enter category name and image",
      });
    }

    let newCategory = new PopularCategory({
      name,
      image: finalImage,
      storeCategoryId: storeCategoryId || null,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    newCategory = await newCategory.save();

    res.status(status.Create).json({
      status: jsonStatus.Create,
      success: true,
      data: newCategory,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("createPopularCategory", error, req, res);
  }
};

export const editPopularCategory = async (req, res) => {
  try {
    const { name, image, storeCategoryId } = req.body;
    const { id } = req.params;
    const uploadedImagePath = req.file?.key;
    const finalImage = image || uploadedImagePath;

    if (!name || !finalImage) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please enter category name and image",
      });
    }

    const category = await PopularCategory.findById(id);
    if (!category) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Popular category not found",
      });
    }

    const updatedCategory = await PopularCategory.findByIdAndUpdate(
      id,
      { name, image: finalImage, storeCategoryId: storeCategoryId || null, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: updatedCategory,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("editPopularCategory", error, req, res);
  }
};

export const deletePopularCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await PopularCategory.findById(id);
    if (!category) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Popular category not found",
      });
    }

    await PopularCategory.findByIdAndUpdate(
      id,
      { deleted: true, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("deletePopularCategory", error, req, res);
  }
};

export const listPopularCategory = async (req, res) => {
  try {
    // ✅ Dynamic Popular Categories: most ordered categories from delivered ONLINE orders
    const pipeline = [
      { $match: { status: "Delivered" } },
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
      { $match: { "product.deleted": { $ne: true } } },
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
      { $match: { "category.deleted": false } },
      { $sort: { orderCount: -1, "category.name": 1 } },
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
    ];

    const list = await OnlineOrder.aggregate(pipeline);

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: list,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("listPopularCategory", error, req, res);
  }
};

import LocalPopularCategory from "../models/LocalPopularCategory.js";
import { signedUrl } from '../helper/s3.config.js';
import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';

export const uploadLocalPopularCategoryImage = async (req, res) => {
  try {
    signedUrl(req, res, "Local_Popular_Category/");
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("uploadLocalPopularCategoryImage", error, req, res);
  }
};

export const createLocalPopularCategory = async (req, res) => {
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

    let newCategory = new LocalPopularCategory({
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
    return catchError("createLocalPopularCategory", error, req, res);
  }
};

export const editLocalPopularCategory = async (req, res) => {
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

    const category = await LocalPopularCategory.findById(id);
    if (!category) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Local popular category not found",
      });
    }

    const updatedCategory = await LocalPopularCategory.findByIdAndUpdate(
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
    return catchError("editLocalPopularCategory", error, req, res);
  }
};

export const deleteLocalPopularCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await LocalPopularCategory.findById(id);
    if (!category) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Local popular category not found",
      });
    }

    await LocalPopularCategory.findByIdAndUpdate(
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
    return catchError("deleteLocalPopularCategory", error, req, res);
  }
};

export const listLocalPopularCategory = async (req, res) => {
  try {
    const list = await LocalPopularCategory.aggregate([
      { $match: { deleted: false } },
      {
        $lookup: {
          from: "store_categories",
          localField: "storeCategoryId",
          foreignField: "_id",
          as: "storeCategory",
        },
      },
      {
        $addFields: {
          storeCategory: { $arrayElemAt: ["$storeCategory", 0] },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

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
    return catchError("listLocalPopularCategory", error, req, res);
  }
};


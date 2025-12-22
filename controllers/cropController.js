import Crop from "../models/Crop.js";
import Article from "../models/Article.js";
import Reels from "../models/Reels.js";
import UserCrop from "../models/UserCrop.js";
import { jsonStatus, status } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";
import { signedUrl } from '../helper/s3.config.js';
import mongoose from 'mongoose';
import axios from 'axios';
import Farm from "../models/Farm.js";
import KrishiModel from "../models/KrishiCard.js";

const { ObjectId } = mongoose.Types;

let limit = process.env.LIMIT;
limit = limit ? Number(limit) : 10;

export const uploadCropImage = async (req, res) => {
    try {
        signedUrl(req, res, 'crop/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadCropImage', error, req, res);
    }
}

export const uploadArticleImage = async (req, res) => {
    try {
        signedUrl(req, res, 'article/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadArticleImage', error, req, res);
    }
}

// Create a new crop
export const createCrop = async (req, res) => {
    try {
        const { name, image } = req.body;

        // Create new crop
        const crop = new Crop({
            name,
            image,
            createdBy: req.user._id
        });

        // Save crop to database
        await crop.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            message: "Crop created successfully",
            data: crop
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("createCrop", error, req, res);
    }
};

// Get all crops
export const getAllCrops = async (req, res) => {
    try {
        // Get all non-deleted crops
        const crops = await Crop.find({ deleted: false }).sort({ createdAt: -1 });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Crops fetched successfully",
            data: crops
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("getAllCrops", error, req, res);
    }
};

// Delete crop (soft delete)
export const deleteCrop = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate crop ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid crop ID"
            });
        }

        // Check if crop exists and is not already deleted
        const crop = await Crop.findOne({ _id: id, deleted: false });
        if (!crop) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Crop not found"
            });
        }

        // Soft delete the crop
        await Crop.findByIdAndUpdate(id, { deleted: true });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Crop deleted successfully"
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("deleteCrop", error, req, res);
    }
};

export const homePageData = async (req, res) => {
    try {
        // Get all non-deleted crops
        const articles = await Article.aggregate([
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
                $limit: 5
            }
        ]);


        const reelData = await Reels.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $limit: 5
            }
        ]);

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: { articles, reels: reelData }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("homePageData", error, req, res);
    }
};

export const allArticles = async (req, res) => {
    try {

        let { skip } = req.query;
        skip = skip ? skip : 1;

        const articles = await Article.aggregate([
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
                $skip: (skip - 1) * limit
            },
            {
                $limit: limit
            }
        ]);

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: articles
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("allArticles", error, req, res);
    }
};

export const userCropDetails = async (req, res) => {
    try {
        // Get all non-deleted crops
        const cropData = await UserCrop.aggregate([
            {
                $match: {
                    deleted: false,
                    createdBy: new ObjectId(req.user._id)
                }
            },
            {
                $lookup: {
                    from: "crops",
                    localField: "crop",
                    foreignField: "_id",
                    as: "cropDetails"
                }
            },
            {
                $lookup: {
                    from: "farms",
                    localField: "farmId",
                    foreignField: "_id",
                    as: "farmDetails"
                }
            },
            {
                $unwind: "$cropDetails"
            },
            {
                $unwind: "$farmDetails"
            },
            {
                $limit: 5
            }
        ]);

        const reelData = await Reels.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $limit: 5
            }
        ]);

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: { crops: cropData, reels: reelData }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("userCropDetails", error, req, res);
    }
};

export const createUserCrop = async (req, res) => {
    try {

        const { farmId } = req.body;

        const farm = await Farm.findOne({ _id: farmId, createdBy: req.user._id });
        if (!farm) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Farm not found" });
        }

        // Get all non-deleted crops
        let newUserCrop = new UserCrop({ ...req.body, createdBy: req.user._id });
        newUserCrop = await newUserCrop.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            message: "Crop created successfully",
            data: newUserCrop
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("createUserCrop", error, req, res);
    }
};

export const createArticle = async (req, res) => {
    try {
        const article = new Article({
            ...req.body,
            createdBy: req.user._id
        });
        await article.save();

        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            data: article
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("createArticle", error, req, res);
    }
};

export const deleteArticle = async (req, res) => {
    try {
        const article = await Article.findByIdAndUpdate(
            req.params.id,
            { deleted: true },
            { new: true }
        );

        if (!article) {
            return res.status(404).json({
                status: "Not Found",
                success: false,
                message: "Article not found"
            });
        }

        res.status(200).json({
            status: "Deleted",
            success: true,
            data: article
        });
    } catch (error) {
        res.status(500).json({ status: "Internal Server Error", success: false, message: error.message });
        return catchError("deleteArticle", error, req, res);
    }
};

export const getOneArticle = async (req, res) => {
    try {
        const article = await Article.findOne({ _id: req.params.id, deleted: false }).populate("createdBy");

        if (!article) {
            return res.status(404).json({
                status: "Not Found",
                success: false,
                message: "Article not found"
            });
        }

        res.status(200).json({
            status: "OK",
            success: true,
            data: article
        });
    } catch (error) {
        res.status(500).json({ status: "Internal Server Error", success: false, message: error.message });
        return catchError("getOneArticle", error, req, res);
    }
};

export const getArticleList = async (req, res) => {
    try {
        const articles = await Article.find({ deleted: false }).sort({ createdAt: -1 }).populate("createdBy");

        res.status(200).json({
            status: "OK",
            success: true,
            data: articles
        });
    } catch (error) {
        res.status(500).json({ status: "Internal Server Error", success: false, message: error.message });
        return catchError("getArticleList", error, req, res);
    }
};

export const updateArticle = async (req, res) => {
    try {
        const updateFields = { ...req.body };
        delete updateFields.createdBy; // Prevent changing the creator

        const article = await Article.findOneAndUpdate(
            { _id: req.params.id, deleted: false },
            updateFields,
            { new: true }
        );

        if (!article) {
            return res.status(404).json({
                status: "Not Found",
                success: false,
                message: "Article not found or deleted"
            });
        }

        res.status(200).json({
            status: "Updated",
            success: true,
            data: article
        });
    } catch (error) {
        res.status(500).json({ status: "Internal Server Error", success: false, message: error.message });
        return catchError("updateArticle", error, req, res);
    }
};

export const getWeatherDetails = async (req, res) => {
    try {
        const { lat, long } = req.params;

        const weatherResponse = await axios.get(`https://api.tomorrow.io/v4/weather/forecast?location=${lat},${long}&apikey=${process.env.TOMORROW_IO_API_KEY}`);

        // Set default city name without Google Maps API
        let cityName = "Unknown Location";

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                hourly: weatherResponse.data.timelines?.hourly || [],
                daily: weatherResponse.data.timelines?.daily || [],
                city: cityName
            }
        });
    } catch (error) {
        console.error("Error fetching weather details:", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
    }
};

export const createFarm = async (req, res) => {
    try {

        let newFarm = new Farm({ ...req.body, createdBy: req.user._id });
        newFarm = await newFarm.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: newFarm });
    } catch (error) {
        console.error("createFarm", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
    }
};

export const updateFarm = async (req, res) => {
    try {
        const { id } = req.params;

        const farm = await Farm.findOne({ _id: id, createdBy: req.user._id });
        if (!farm) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Farm not found" });
        }

        const updateFarm = await Farm.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: updateFarm });
    } catch (error) {
        console.error("updateFarm", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
    }
};

export const farmList = async (req, res) => {
    try {
        const list = await Farm.find({ createdBy: req.user._id });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        console.error("farmList", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
    }
};

export const detailsFarm = async (req, res) => {
    try {
        const { id } = req.params;

        const farm = await Farm.findOne({ _id: id, createdBy: req.user._id });
        if (!farm) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Farm not found" });
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: farm });
    } catch (error) {
        console.error("detailsFarm", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
    }
};

export const createKrishiCard = async (req, res) => {
    try {

        const krishi = await KrishiModel.findOne({ createdBy: req.user._id });
        if (krishi) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Already created" });
        }

        let newKrishiModel = new KrishiModel({ ...req.body, createdBy: req.user._id });
        newKrishiModel = await newKrishiModel.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: newKrishiModel });
    } catch (error) {
        console.error("createKrishiCard", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
    }
};

export const updateKrishiCard = async (req, res) => {
    try {

        const krishi = await KrishiModel.findOne({ createdBy: req.user._id });
        if (!krishi) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Krishi Card Not Found" });
        }

        const updatedKrishiModel = await KrishiModel.findOneAndUpdate({ createdBy: req.user._id }, req.body, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: updatedKrishiModel });
    } catch (error) {
        console.error("updateKrishiCard", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
    }
};

export const getKrishiCard = async (req, res) => {
    try {

        const krishi = await KrishiModel.findOne({ createdBy: req.user._id }).lean();
        if (!krishi) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Not found" });
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: { ...krishi, qrCodeValue: `${process.env.ADMIN_URL}/krishi/details/${krishi._id}` } });
    } catch (error) {
        console.error("getKrishiCard", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
    }
};

export const getKrishiCardById = async (req, res) => {
    try {

        const krishi = await KrishiModel.findById(req.params.id);
        if (!krishi) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Not found" });
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: krishi });
    } catch (error) {
        console.error("getKrishiCardById", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
    }
};
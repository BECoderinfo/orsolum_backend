import Reel from "../models/Reels.js";
import { jsonStatus, status } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";
import { signedUrl } from '../helper/s3.config.js';

export const uploadReelAssetsV1 = async (req, res) => {
    try {
        signedUrl(req, res, 'reels/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadReelAssetsV1', error, req, res);
    }
}

// Create a new reel
export const createReel = async (req, res) => {
    try {
        const { title, video, thumbnail } = req.body;
        const createdBy = req.user._id;

        const newReel = new Reel({ title, video, thumbnail, createdBy });
        await newReel.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, message: "Reel created successfully", reel: newReel });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("createReel", error, req, res);
    }
};

// Get all reels with pagination and tags
export const getReels = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const userId = req.user._id;

        const reels = await Reel.find({ deleted: false })
            .populate("createdBy", "name")
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const reelsWithTags = reels.map(reel => ({
            ...reel._doc,
            isLiked: reel.likes.includes(userId),
            isSaved: reel.saved.includes(userId)
        }));

        const totalCount = await Reel.countDocuments({ deleted: false });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: reelsWithTags,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("getReels", error, req, res);
    }
};

// Like a reel
export const likeReel = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const reel = await Reel.findById(id);
        if (!reel || reel.deleted) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Reel not found" });
        }

        if (!reel.likes.includes(userId)) {
            reel.likes.push(userId);
            await reel.save();
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Reel liked", likesCount: reel.likes.length });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("likeReel", error, req, res);
    }
};

// Unlike a reel
export const unlikeReel = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const reel = await Reel.findById(id);
        if (!reel || reel.deleted) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Reel not found" });
        }

        reel.likes = reel.likes.filter(likeId => likeId.toString() !== userId);
        await reel.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Reel unliked", likesCount: reel.likes.length });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("unlikeReel", error, req, res);
    }
};

// Save a reel
export const saveReel = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const reel = await Reel.findById(id);
        if (!reel || reel.deleted) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Reel not found" });
        }

        if (!reel.saved.includes(userId)) {
            reel.saved.push(userId);
            await reel.save();
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Reel saved", savedCount: reel.saved.length });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("saveReel", error, req, res);
    }
};

// Unsave a reel
export const unsaveReel = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const reel = await Reel.findById(id);
        if (!reel || reel.deleted) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Reel not found" });
        }

        reel.saved = reel.saved.filter(savedId => savedId.toString() !== userId);
        await reel.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Reel unsaved", savedCount: reel.saved.length });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("unsaveReel", error, req, res);
    }
};

// Get a single reel by ID
export const getReelById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const reel = await Reel.findById(id).populate("createdBy", "name");
        if (!reel || reel.deleted) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Reel not found" });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                ...reel._doc,
                isLiked: reel.likes.includes(userId),
                isSaved: reel.saved.includes(userId)
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("getReelById", error, req, res);
    }
};

// Update a reel
export const updateReel = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;

        const updatedReel = await Reel.findByIdAndUpdate(id, updatedData, { new: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Reel updated successfully", reel: updatedReel });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("updateReel", error, req, res);
    }
};

// Soft delete a reel
export const deleteReel = async (req, res) => {
    try {
        const { id } = req.params;

        const reel = await Reel.findByIdAndUpdate(id, { deleted: true }, { new: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: "Reel deleted successfully", reel });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("deleteReel", error, req, res);
    }
};

export const reelList = async (req, res) => {
    try {
        const reel = await Reel.find({ deleted: false });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: reel });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("reelList", error, req, res);
    }
};

// Get saved reels with pagination
export const getSavedReels = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const userId = req.user._id;

        const reels = await Reel.find({ saved: userId, deleted: false })
            .populate("createdBy", "name")
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const totalCount = await Reel.countDocuments({ saved: userId, deleted: false });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: reels,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError("getSavedReels", error, req, res);
    }
};
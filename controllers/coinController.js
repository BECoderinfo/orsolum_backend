import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import CoinHistory from '../models/CoinHistory.js';
import CoinConfiguration from '../models/CoinConfiguration.js';
import User from '../models/User.js';
import ProductSubCategory from '../models/OnlineStore/SubCategory.js';
import mongoose from 'mongoose';

const { ObjectId } = mongoose.Types;

let limit = process.env.LIMIT;
limit = limit ? Number(limit) : 10;

/**
 * Admin: Get all coin configurations
 */
export const listCoinConfigurations = async (req, res) => {
    try {
        const { skip = 1, subCategoryId, enabled } = req.query;
        const skipValue = (Number(skip) - 1) * limit;

        const query = { deleted: false };
        if (subCategoryId && ObjectId.isValid(subCategoryId)) {
            query.subCategoryId = new ObjectId(subCategoryId);
        }
        if (enabled !== undefined) {
            query.enabled = enabled === 'true';
        }

        const configurations = await CoinConfiguration.find(query)
            .populate('subCategoryId', 'name categoryId')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skipValue)
            .limit(limit);

        const total = await CoinConfiguration.countDocuments(query);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                configurations,
                pagination: {
                    total,
                    page: Number(skip),
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('listCoinConfigurations', error, req, res);
    }
};

/**
 * Admin: Create coin configuration
 */
export const createCoinConfiguration = async (req, res) => {
    try {
        const { subCategoryId, coinType, coinValue, enabled = true } = req.body;
        const adminId = req.user._id;

        if (!subCategoryId || !ObjectId.isValid(subCategoryId)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: 'Valid subCategoryId is required'
            });
        }

        if (!coinType || !['percentage', 'fixed'].includes(coinType)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: 'coinType must be "percentage" or "fixed"'
            });
        }

        if (coinValue === undefined || coinValue < 0) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: 'coinValue must be a non-negative number'
            });
        }

        // Check if subcategory exists
        const subCategory = await ProductSubCategory.findById(subCategoryId);
        if (!subCategory) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: 'Subcategory not found'
            });
        }

        // Check if configuration already exists for this subcategory
        const existing = await CoinConfiguration.findOne({
            subCategoryId: new ObjectId(subCategoryId),
            deleted: false
        });

        if (existing) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: 'Coin configuration already exists for this subcategory. Please update the existing one.'
            });
        }

        const configuration = new CoinConfiguration({
            createdBy: adminId,
            subCategoryId: new ObjectId(subCategoryId),
            coinType,
            coinValue: Number(coinValue),
            enabled: enabled === true || enabled === 'true'
        });

        await configuration.save();

        const populated = await CoinConfiguration.findById(configuration._id)
            .populate('subCategoryId', 'name categoryId')
            .populate('createdBy', 'name email');

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: 'Coin configuration created successfully',
            data: populated
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('createCoinConfiguration', error, req, res);
    }
};

/**
 * Admin: Update coin configuration
 */
export const updateCoinConfiguration = async (req, res) => {
    try {
        const { id } = req.params;
        const { coinType, coinValue, enabled } = req.body;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: 'Valid configuration ID is required'
            });
        }

        const configuration = await CoinConfiguration.findById(id);
        if (!configuration || configuration.deleted) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: 'Coin configuration not found'
            });
        }

        const updateData = {};
        if (coinType && ['percentage', 'fixed'].includes(coinType)) {
            updateData.coinType = coinType;
        }
        if (coinValue !== undefined && coinValue >= 0) {
            updateData.coinValue = Number(coinValue);
        }
        if (enabled !== undefined) {
            updateData.enabled = enabled === true || enabled === 'true';
        }

        const updated = await CoinConfiguration.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
            .populate('subCategoryId', 'name categoryId')
            .populate('createdBy', 'name email');

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: 'Coin configuration updated successfully',
            data: updated
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('updateCoinConfiguration', error, req, res);
    }
};

/**
 * Admin: Delete coin configuration
 */
export const deleteCoinConfiguration = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: 'Valid configuration ID is required'
            });
        }

        const configuration = await CoinConfiguration.findById(id);
        if (!configuration || configuration.deleted) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: 'Coin configuration not found'
            });
        }

        await CoinConfiguration.findByIdAndUpdate(id, { deleted: true });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: 'Coin configuration deleted successfully'
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('deleteCoinConfiguration', error, req, res);
    }
};

/**
 * Admin: Get coin history (all users or specific user)
 */
export const adminGetCoinHistory = async (req, res) => {
    try {
        const { skip = 1, userId, orderId, type, orderType } = req.query;
        const skipValue = (Number(skip) - 1) * limit;

        const query = {};
        if (userId && ObjectId.isValid(userId)) {
            query.createdBy = new ObjectId(userId);
        }
        if (orderId && ObjectId.isValid(orderId)) {
            query.orderId = new ObjectId(orderId);
        }
        if (type && ['Added', 'Deducted', 'Used', 'Refunded'].includes(type)) {
            query.type = type;
        }
        if (orderType && ['OnlineStore', 'LocalStore'].includes(orderType)) {
            query.orderType = orderType;
        }

        const histories = await CoinHistory.find(query)
            .populate('createdBy', 'name phone email')
            .populate('orderId', 'orderId status summary')
            .sort({ createdAt: -1 })
            .skip(skipValue)
            .limit(limit);

        const total = await CoinHistory.countDocuments(query);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                histories,
                pagination: {
                    total,
                    page: Number(skip),
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('adminGetCoinHistory', error, req, res);
    }
};

/**
 * Admin: Get coin statistics (total issued, redeemed, etc.)
 */
export const adminGetCoinStatistics = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: 'user' });
        
        // Get all coin histories
        const allHistories = await CoinHistory.find({});

        const totalCoinsIssued = allHistories
            .filter(h => h.type === 'Added')
            .reduce((sum, h) => sum + (h.coins || 0), 0);

        const totalCoinsRedeemed = allHistories
            .filter(h => h.type === 'Used')
            .reduce((sum, h) => sum + (h.coins || 0), 0);

        const totalCoinsRefunded = allHistories
            .filter(h => h.type === 'Refunded')
            .reduce((sum, h) => sum + (h.coins || 0), 0);

        // Get current total coins in user wallets
        const usersWithCoins = await User.aggregate([
            { $match: { role: 'user' } },
            {
                $group: {
                    _id: null,
                    totalCoins: { $sum: { $ifNull: ['$coins', 0] } }
                }
            }
        ]);

        const currentTotalCoins = usersWithCoins[0]?.totalCoins || 0;

        // Get user-wise statistics
        const userStats = await CoinHistory.aggregate([
            {
                $group: {
                    _id: '$createdBy',
                    totalEarned: {
                        $sum: {
                            $cond: [{ $eq: ['$type', 'Added'] }, '$coins', 0]
                        }
                    },
                    totalUsed: {
                        $sum: {
                            $cond: [{ $eq: ['$type', 'Used'] }, '$coins', 0]
                        }
                    },
                    totalRefunded: {
                        $sum: {
                            $cond: [{ $eq: ['$type', 'Refunded'] }, '$coins', 0]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    userId: '$_id',
                    userName: '$user.name',
                    userPhone: '$user.phone',
                    totalEarned: 1,
                    totalUsed: 1,
                    totalRefunded: 1
                }
            },
            { $sort: { totalEarned: -1 } },
            { $limit: 10 }
        ]);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                overview: {
                    totalUsers,
                    totalCoinsIssued,
                    totalCoinsRedeemed,
                    totalCoinsRefunded,
                    currentTotalCoins,
                    netCoinsIssued: totalCoinsIssued - totalCoinsRefunded
                },
                topUsers: userStats
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('adminGetCoinStatistics', error, req, res);
    }
};


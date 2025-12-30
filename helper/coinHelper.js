import CoinConfiguration from '../models/CoinConfiguration.js';
import CoinHistory from '../models/CoinHistory.js';
import User from '../models/User.js';
import ProductSubCategory from '../models/OnlineStore/SubCategory.js';
import mongoose from 'mongoose';

/**
 * Calculate coins earned for products based on category configuration
 * @param {Array} productDetails - Array of product details with productId, productPrice, quantity
 * @returns {Promise<Number>} Total coins earned
 */
export const calculateCoinsEarned = async (productDetails) => {
    let totalCoinsEarned = 0;

    for (const product of productDetails) {
        try {
            // Get product to find subcategory
            const Product = (await import('../models/OnlineStore/Product.js')).default;
            const productDoc = await Product.findById(product.productId)
                .populate('subCategoryId');

            if (!productDoc || !productDoc.subCategoryId) {
                continue;
            }

            const subCategoryId = productDoc.subCategoryId._id || productDoc.subCategoryId;

            // Get coin configuration for this subcategory
            const coinConfig = await CoinConfiguration.findOne({
                subCategoryId: subCategoryId,
                enabled: true,
                deleted: false
            });

            if (!coinConfig) {
                continue; // No coin configuration for this category
            }

            const productTotal = product.productPrice * product.quantity;
            let coinsForProduct = 0;

            if (coinConfig.coinType === 'percentage') {
                // Calculate percentage-based coins
                coinsForProduct = Math.round((productTotal * coinConfig.coinValue) / 100);
            } else if (coinConfig.coinType === 'fixed') {
                // Fixed coins per product quantity
                coinsForProduct = coinConfig.coinValue * product.quantity;
            }

            totalCoinsEarned += coinsForProduct;
        } catch (error) {
            console.error(`Error calculating coins for product ${product.productId}:`, error);
            continue;
        }
    }

    return Math.round(totalCoinsEarned);
};

/**
 * Validate and get maximum coins user can use
 * @param {String} userId - User ID
 * @param {Number} totalCoinsCanBeUsed - Maximum coins allowed based on products
 * @param {Number} grandTotal - Grand total amount
 * @returns {Promise<Number>} Maximum coins user can actually use
 */
export const validateAndGetMaxCoinsUsable = async (userId, totalCoinsCanBeUsed, grandTotal) => {
    const user = await User.findById(userId);
    if (!user) {
        return 0;
    }

    const userCoins = user.coins || 0;
    const maxUsable = Math.min(userCoins, totalCoinsCanBeUsed, grandTotal);
    
    return Math.max(0, maxUsable);
};

/**
 * Deduct coins from user wallet
 * @param {String} userId - User ID
 * @param {Number} coinsToDeduct - Coins to deduct
 * @param {String} orderId - Order ID
 * @param {String} orderType - Order type (OnlineStore/LocalStore)
 * @returns {Promise<Boolean>} Success status
 */
export const deductCoins = async (userId, coinsToDeduct, orderId, orderType = 'OnlineStore') => {
    if (!coinsToDeduct || coinsToDeduct <= 0) {
        return true; // Nothing to deduct
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const currentCoins = user.coins || 0;
        if (currentCoins < coinsToDeduct) {
            throw new Error(`Insufficient coins. Available: ${currentCoins}, Required: ${coinsToDeduct}`);
        }

        // Deduct coins
        await User.findByIdAndUpdate(userId, {
            $inc: { coins: -coinsToDeduct }
        });

        // Create coin history
        await CoinHistory.create({
            createdBy: userId,
            coins: coinsToDeduct,
            orderId: orderId,
            orderModel: orderType === 'LocalStore' ? 'order' : 'online_order',
            type: 'Used',
            description: `Coins used for ${orderType} order`,
            orderType: orderType
        });

        return true;
    } catch (error) {
        console.error('Error deducting coins:', error);
        throw error;
    }
};

/**
 * Credit coins to user wallet (only after order completion)
 * @param {String} userId - User ID
 * @param {Number} coinsToCredit - Coins to credit
 * @param {String} orderId - Order ID
 * @param {String} orderType - Order type (OnlineStore/LocalStore)
 * @returns {Promise<Boolean>} Success status
 */
export const creditCoins = async (userId, coinsToCredit, orderId, orderType = 'OnlineStore') => {
    if (!coinsToCredit || coinsToCredit <= 0) {
        return true; // Nothing to credit
    }

    try {
        // Check if coins already credited for this order
        const existingHistory = await CoinHistory.findOne({
            createdBy: userId,
            orderId: orderId,
            type: 'Added'
        });

        if (existingHistory) {
            console.log(`Coins already credited for order ${orderId}`);
            return true; // Already credited
        }

        // Credit coins
        await User.findByIdAndUpdate(userId, {
            $inc: { coins: coinsToCredit }
        });

        // Create coin history
        await CoinHistory.create({
            createdBy: userId,
            coins: coinsToCredit,
            orderId: orderId,
            orderModel: orderType === 'LocalStore' ? 'order' : 'online_order',
            type: 'Added',
            description: `Coins earned from ${orderType} order`,
            orderType: orderType
        });

        return true;
    } catch (error) {
        console.error('Error crediting coins:', error);
        throw error;
    }
};

/**
 * Refund coins to user wallet
 * @param {String} userId - User ID
 * @param {Number} coinsToRefund - Coins to refund
 * @param {String} orderId - Order ID
 * @param {String} orderType - Order type (OnlineStore/LocalStore)
 * @returns {Promise<Boolean>} Success status
 */
export const refundCoins = async (userId, coinsToRefund, orderId, orderType = 'OnlineStore') => {
    if (!coinsToRefund || coinsToRefund <= 0) {
        return true; // Nothing to refund
    }

    try {
        // Refund coins
        await User.findByIdAndUpdate(userId, {
            $inc: { coins: coinsToRefund }
        });

        // Create coin history
        await CoinHistory.create({
            createdBy: userId,
            coins: coinsToRefund,
            orderId: orderId,
            orderModel: orderType === 'LocalStore' ? 'order' : 'online_order',
            type: 'Refunded',
            description: `Coins refunded for cancelled ${orderType} order`,
            orderType: orderType
        });

        return true;
    } catch (error) {
        console.error('Error refunding coins:', error);
        throw error;
    }
};

/**
 * Check if user has placed any previous orders
 * @param {String} userId - User ID
 * @param {String} orderType - Order type (OnlineStore/LocalStore)
 * @returns {Promise<Boolean>} True if user has previous orders
 */
export const hasPreviousOrders = async (userId, orderType = 'OnlineStore') => {
    try {
        if (orderType === 'OnlineStore') {
            const OnlineOrder = (await import('../models/OnlineStore/OnlineOrder.js')).default;
            const count = await OnlineOrder.countDocuments({
                createdBy: userId,
                status: { $in: ['Delivered', 'Pending', 'Accepted', 'Product shipped', 'On the way', 'Out for delivery', 'Your Destination'] }
            });
            return count > 0;
        } else {
            const Order = (await import('../models/Order.js')).default;
            const count = await Order.countDocuments({
                createdBy: userId,
                status: { $in: ['Delivered', 'Pending', 'Accepted', 'Product shipped', 'On the way', 'Out for delivery', 'Your Destination'] }
            });
            return count > 0;
        }
    } catch (error) {
        console.error('Error checking previous orders:', error);
        return false;
    }
};

/**
 * Get user coin statistics
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Coin statistics
 */
export const getUserCoinStats = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return {
                totalCoins: 0,
                coinsEarned: 0,
                coinsUsed: 0,
                coinsRefunded: 0
            };
        }

        const totalCoins = user.coins || 0;

        // Get coin history statistics
        const histories = await CoinHistory.find({ createdBy: userId });

        const coinsEarned = histories
            .filter(h => h.type === 'Added')
            .reduce((sum, h) => sum + (h.coins || 0), 0);

        const coinsUsed = histories
            .filter(h => h.type === 'Used')
            .reduce((sum, h) => sum + (h.coins || 0), 0);

        const coinsRefunded = histories
            .filter(h => h.type === 'Refunded')
            .reduce((sum, h) => sum + (h.coins || 0), 0);

        return {
            totalCoins,
            coinsEarned,
            coinsUsed,
            coinsRefunded
        };
    } catch (error) {
        console.error('Error getting user coin stats:', error);
        return {
            totalCoins: 0,
            coinsEarned: 0,
            coinsUsed: 0,
            coinsRefunded: 0
        };
    }
};


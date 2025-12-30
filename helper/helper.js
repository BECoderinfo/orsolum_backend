import { jsonStatus, status } from '../helper/api.responses.js';
import Order from '../models/Order.js';
import OnlineOrder from '../models/OnlineStore/OnlineOrder.js';
import Payment from '../models/Payment.js';
import Cart from '../models/Cart.js';
import Address from '../models/Address.js';
import Store from '../models/Store.js';
import StoreOffer from '../models/StoreOffer.js';
import CouponCode from '../models/CouponCode.js';
import PremiumHistory from '../models/PremiumHistory.js';
import User from '../models/User.js';
import CoinHistory from '../models/CoinHistory.js';
import CouponHistory from '../models/CouponHistory.js';
import OnlineStoreCart from '../models/OnlineStore/OnlineStoreCart.js';
import { generateInvoice, generateOnlineInvoice } from './generateInvoice.js';
import ProductSubCategory from '../models/OnlineStore/SubCategory.js';

const PLATFORM_FEE = Number(process.env.PLATFORM_FEE || 0);

const toNumberOrZero = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const sumProductExtraCharges = (products = []) => {
    let total = 0;
    const breakdown = [];
    products.forEach((p) => {
        const lineTotal = toNumberOrZero(p.productPrice) * toNumberOrZero(p.quantity || 1);
        if (Array.isArray(p.extraCharges)) {
            p.extraCharges.forEach((charge) => {
                const amount =
                    charge?.type === "percent"
                        ? (lineTotal * toNumberOrZero(charge.amount || 0)) / 100
                        : toNumberOrZero(charge.amount || 0);
                if (amount > 0) {
                    total += amount;
                    breakdown.push({
                        label: charge.label || "Product charge",
                        amount: Number(amount.toFixed(2)),
                    });
                }
            });
        }
    });
    return { total: Number(total.toFixed(2)), breakdown };
};

const sumStoreExtraCharges = ({ store, subtotal }) => {
    let total = 0;
    const breakdown = [];
    if (Array.isArray(store?.extraCharges)) {
        store.extraCharges.forEach((charge) => {
            const amount =
                charge?.type === "percent"
                    ? (subtotal * toNumberOrZero(charge.amount || 0)) / 100
                    : toNumberOrZero(charge.amount || 0);
            if (amount > 0) {
                total += amount;
                breakdown.push({
                    label: charge.label || "Extra charge",
                    amount: Number(amount.toFixed(2)),
                });
            }
        });
    }
    return { total: Number(total.toFixed(2)), breakdown };
};

const buildCharges = ({ store, products, productsSubtotal }) => {
    const platformFee = Number.isFinite(store?.platformFee)
        ? Number(store.platformFee)
        : PLATFORM_FEE;

    const productCharge = sumProductExtraCharges(products);
    const storeCharge = sumStoreExtraCharges({ store, subtotal: productsSubtotal });

    const chargesTotal = Number(
        (productCharge.total + storeCharge.total + (platformFee || 0)).toFixed(2)
    );

    const breakdown = [
        ...(platformFee ? [{ label: "Platform fee", amount: platformFee }] : []),
        ...productCharge.breakdown,
        ...storeCharge.breakdown,
    ];

    return { platformFee: platformFee || 0, chargesTotal, breakdown };
};

export const handleLocalStoreOrderCallback = async (webhookCallRes) => {
    try {
        const cf_order_id = webhookCallRes.payment_gateway_details.gateway_order_id;
        const paymentStatus = webhookCallRes.payment.payment_status;
        let newOrder;

        // First, try to find existing order by cf_order_id (created in createOrderV2)
        const existingOrder = await Order.findOne({ cf_order_id });

        if (existingOrder) {
            // Update existing order with payment status
            existingOrder.paymentStatus = paymentStatus;
            
            // If payment is successful, keep status as "Pending" (will be changed by retailer/admin)
            // If payment failed, update status accordingly
            if (paymentStatus === "SUCCESS") {
                existingOrder.status = "Pending";
                // Generate invoice only if payment is successful
                generateInvoice(existingOrder._id);
                
                // Mark cart items as deleted after successful payment
                const storeId = existingOrder.storeId?.toString() || webhookCallRes.order.order_tags?.storeId;
                if (storeId) {
                    await Cart.updateMany(
                        { createdBy: existingOrder.createdBy, storeId, deleted: false },
                        { $set: { deleted: true } }
                    );
                }

                // Send notification to retailer about new order
                try {
                    const { notifyNewOrder } = await import('./notificationHelper.js');
                    const store = await Store.findById(existingOrder.storeId);
                    if (store && store.createdBy) {
                        await notifyNewOrder(store.createdBy, existingOrder);
                    }
                } catch (notifError) {
                    console.error('Error sending new order notification:', notifError);
                    // Continue even if notification fails
                }

                // Handle coupon if provided
                const coupon = webhookCallRes.order.order_tags?.coupon;
                if (coupon) {
                    const userId = existingOrder.createdBy?.toString();
                    await new CouponHistory({ couponId: coupon, userId }).save();
                }
            } else if (paymentStatus === "FAILED") {
                // If payment failed, don't change order status to Cancelled automatically
                // Keep it as "Pending" but with failed payment status
                // Admin/retailer can decide to cancel later if needed
                existingOrder.status = "Pending";
            } else if (paymentStatus === "PENDING") {
                // If payment is still pending, keep order status as "Pending"
                existingOrder.status = "Pending";
            }

            await existingOrder.save();
            newOrder = existingOrder;
        } else {
            // Backward compatibility: Create new order if not found (old flow)
            // This should only happen for orders created via old createOrder function
            if (paymentStatus === "SUCCESS") {
                let { coupon, storeId, donate, addressId, userId } = webhookCallRes.order.order_tags;
                donate = donate ? Number(donate) : 0;
                // Fetch user cart items for the given store
                const carts = await Cart.find({ createdBy: userId, storeId, deleted: false }).populate('productId');

                if (carts.length < 1) {
                    console.error("Cart is empty for this store in webhook callback");
                    // Don't return error, just log it
                } else {
                    const address = await Address.findOne({ createdBy: userId, _id: addressId });

                    let storeTotal = 0;
                    let storeDiscountAmount = 0;
                    let storeAppliedOffers = [];
                    let productDetails = [];

                    // Fetch store offers
                    const storeOffers = await StoreOffer.find({ storeId, deleted: false });

                    // Process each cart item
                    carts.forEach(cart => {
                        let productPrice = cart.productId.sellingPrice;
                        let mrp = cart.productId.mrp;
                        let quantity = cart.quantity;
                        let freeQuantity = 0;
                        let appliedOffers = [];

                        // Apply store offers
                        storeOffers.forEach(offer => {
                            if (offer.offerType === 'percentage_discount' && storeTotal >= offer.minOrderValue) {
                                const discount = (productPrice * offer.discountValue) / 100;
                                storeDiscountAmount += discount;
                                appliedOffers.push({ type: "percentage_discount", description: `Flat ${offer.discountValue}% discount applied` });
                            }

                            if (offer.offerType === 'flat_discount' && storeTotal >= offer.minOrderValue) {
                                storeDiscountAmount += offer.discountValue;
                                appliedOffers.push({ type: "flat_discount", description: `Flat ₹${offer.discountValue} discount applied` });
                            }

                            if (offer.offerType === 'buy_one_get_one' && offer.selectedProducts.includes(cart.productId._id.toString())) {
                                freeQuantity = quantity; // BOGO logic
                                appliedOffers.push({ type: "buy_one_get_one", description: "Buy 1 Get 1 Free" });
                            }
                        });

                        storeTotal += productPrice * quantity;

                        productDetails.push({
                            productId: cart.productId._id,
                            productPrice,
                            mrp,
                            quantity,
                            freeQuantity,
                            appliedOffers,
                            extraCharges: cart.productId.extraCharges || []
                        });
                    });

                    // Apply coupon discount (if provided)
                    let couponCodeDiscount = 0;
                    if (coupon) {
                        const couponCode = await CouponCode.findById(coupon);

                        if (couponCode && !couponCode.deleted) {
                            if (couponCode.use === "one") {
                                const alreadyUsed = await CouponHistory.findOne({ couponId: couponCode._id, userId: userId });
                                if (!alreadyUsed) {
                                    const rawDiscount = (storeTotal * couponCode.discount) / 100;
                                    couponCodeDiscount = couponCode.upto ? Math.min(rawDiscount, couponCode.upto) : rawDiscount;
                                }
                            } else {
                                const rawDiscount = (storeTotal * couponCode.discount) / 100;
                                couponCodeDiscount = couponCode.upto ? Math.min(rawDiscount, couponCode.upto) : rawDiscount;
                            }
                        }
                    }

                    const storeDoc = storeId ? await Store.findById(storeId).lean() : null;

                    // Shipping Fee Logic
                    const storeShippingFee = storeTotal > 500 ? 0 : 50;

                    const charges = buildCharges({
                        store: storeDoc,
                        products: productDetails,
                        productsSubtotal: storeTotal,
                    });

                    // Calculate grand total
                    const grandTotal = storeTotal - storeDiscountAmount - couponCodeDiscount + storeShippingFee + donate + charges.chargesTotal;

                    // Order Summary
                    const orderSummary = {
                        totalAmount: storeTotal,
                        discountAmount: storeDiscountAmount + couponCodeDiscount,
                        shippingFee: storeShippingFee,
                        platformFee: charges.platformFee,
                        extraCharges: charges.breakdown,
                        donate: donate,
                        grandTotal
                    };

                    // Create Order
                    newOrder = new Order({
                        createdBy: userId,
                        storeId,
                        productDetails,
                        address,
                        orderId: `ORDER_${Date.now()}`,
                        summary: orderSummary,
                        status: "Pending",
                        cf_order_id: cf_order_id,
                        paymentStatus: paymentStatus
                    });

                    await newOrder.save();

                    generateInvoice(newOrder._id);

                    // Mark cart items as deleted after order placement
                    await Cart.updateMany({ createdBy: userId, storeId, deleted: false }, { $set: { deleted: true } });

                    // Send notification to retailer about new order
                    try {
                        const { notifyNewOrder } = await import('./notificationHelper.js');
                        const store = await Store.findById(storeId);
                        if (store && store.createdBy) {
                            await notifyNewOrder(store.createdBy, newOrder);
                        }
                    } catch (notifError) {
                        console.error('Error sending new order notification:', notifError);
                        // Continue even if notification fails
                    }

                    if (coupon) {
                        await new CouponHistory({ couponId: coupon, userId }).save();
                    }
                }
            }
        }

        // create payment record
        let newPayment = new Payment({ 
            type: webhookCallRes.order.order_tags.forPayment, 
            paymentResonse: webhookCallRes, 
            userId: webhookCallRes.customer_details.customer_id, 
            orderId: newOrder?._id, 
            orderIdString: newOrder?.orderId, 
            cfoOrder_id: cf_order_id, 
            paymentStatus: paymentStatus, 
            amount: webhookCallRes.payment.payment_amount 
        });
        newPayment = await newPayment.save();
        return true;
    } catch (error) {
        console.error("error in handleLocalStoreOrderCallback:", error);
        return false;
    }
};

export const handleOnlineStoreOrderCallback = async (webhookCallRes) => {
    try {
        const cf_order_id = webhookCallRes.payment_gateway_details.gateway_order_id;
        const paymentStatus = webhookCallRes.payment.payment_status;
        let newOrder;

        // First, try to find existing order by cf_order_id (created in createOnlineOrder)
        const existingOrder = await OnlineOrder.findOne({ cf_order_id });

        if (existingOrder) {
            // Update existing order with payment status
            existingOrder.paymentStatus = paymentStatus;
            await existingOrder.save();

            // Generate invoice only if payment is successful
            if (paymentStatus === "SUCCESS") {
                generateOnlineInvoice(existingOrder._id);
            }

            newOrder = existingOrder;
        } else if (webhookCallRes.payment.payment_status === "SUCCESS") {
            // Fallback: create order if it doesn't exist (legacy flow)
            let { coupon, donate, addressId, userId, coinUsed } = webhookCallRes.order.order_tags;
            donate = donate ? Number(donate) : 0;
            coinUsed = coinUsed ? Number(coinUsed) : 0;

            const userDetails = await User.findById(userId);

            // Fetch user cart items
            const carts = await OnlineStoreCart.find({ createdBy: userId, deleted: false })
                .populate('productId')
                .populate('unitId');

            if (carts.length < 1) {
                console.log("Cart is empty in webhook callback");
                return true; // Return true to avoid webhook retry
            }

            const address = await Address.findOne({ createdBy: userId, _id: addressId });
            if (!address) {
                return res.status(400).json({ success: false, message: "Invalid address" });
            }

            let totalAmount = 0;
            let productDetails = [];

            // Process cart items
            for (const cart of carts) {
                const product = cart.productId;
                let unit = cart.unitId;
                const quantity = cart.quantity;

                if (!product || !unit) continue;

                // Fetch subcategory details for discount
                const subCategory = await ProductSubCategory.findById(product.subCategoryId);
                const percentageOff = subCategory?.percentageOff || 0;

                // Modify unit details if user is premium and percentageOff > 0
                if (userDetails.isPremium && percentageOff > 0) {
                    const discountPrice = Math.round(unit.sellingPrice * (1 - percentageOff / 100));

                    unit = {
                        ...unit.toObject(),
                        mrp: unit.sellingPrice, // Show previous selling price as MRP
                        sellingPrice: discountPrice, // Apply discounted price
                        offPer: `${percentageOff}`
                    };
                }

                const productTotal = unit.sellingPrice * quantity;
                totalAmount += productTotal;

                productDetails.push({
                    productId: product._id,
                    productPrice: unit.sellingPrice,
                    mrp: unit.mrp,
                    qty: unit.qty,
                    quantity
                });
            }

            // Apply coupon discount (if provided)
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

            // Shipping Fee Logic
            const shippingFee = totalAmount > 500 ? 0 : 50;

            // Calculate grand total
                    const grandTotal = totalAmount - couponCodeDiscount + shippingFee + donate - coinUsed + PLATFORM_FEE;

            // Order Summary
            const orderSummary = {
                totalAmount,
                couponCodeDiscount,
                shippingFee,
                donate,
                grandTotal,
                coinUsed
            };

            // Create Online Order
            newOrder = new OnlineOrder({
                createdBy: userId,
                productDetails,
                address,
                orderId: `ONLINE_ORDER_${Date.now()}`,
                summary: orderSummary,
                status: "Pending",
                cf_order_id: webhookCallRes.payment_gateway_details.gateway_order_id,
                paymentStatus: webhookCallRes.payment.payment_status,
                isPremiumPurchase: userDetails.isPremium
            });

            await newOrder.save();

            generateOnlineInvoice(newOrder._id);

            // Mark cart items as deleted after order placement
            await OnlineStoreCart.updateMany({ createdBy: userId, deleted: false }, { $set: { deleted: true } });

            if (coupon) {
                await new CouponHistory({ couponId: coupon, userId }).save();
            }

            // ✅ Coins will be credited only when order status becomes "Delivered"
            // Calculate coins earned but don't credit yet
            const { calculateCoinsEarned } = await import('./coinHelper.js');
            const coinsEarned = await calculateCoinsEarned(productDetails);
            
            // Update order with coins earned (but not credited yet)
            await OnlineOrder.findByIdAndUpdate(newOrder._id, {
                'summary.coinsEarned': coinsEarned,
                'summary.coinsCredited': false
            });
        }

        // Update existing order's coins earned if not set
        if (existingOrder && !existingOrder.summary?.coinsEarned) {
            const { calculateCoinsEarned } = await import('./coinHelper.js');
            const coinsEarned = await calculateCoinsEarned(existingOrder.productDetails);
            await OnlineOrder.findByIdAndUpdate(existingOrder._id, {
                'summary.coinsEarned': coinsEarned,
                'summary.coinsCredited': false
            });
        }

        let newPayment = new Payment({ type: webhookCallRes.order.order_tags.forPayment, paymentResonse: webhookCallRes, userId: webhookCallRes.customer_details.customer_id, onlineOrderId: newOrder?._id, orderIdString: newOrder?.orderId, cfoOrder_id: webhookCallRes.payment_gateway_details.gateway_order_id, paymentStatus: webhookCallRes.payment.payment_status, amount: webhookCallRes.payment.payment_amount });
        newPayment = await newPayment.save();
        return true;
    } catch (error) {
        console.error("error", error);
        return false;
    }
};

function getExpiryDate(monthsFromNow) {
    let expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + monthsFromNow);
    expiryDate.setHours(23, 59, 59, 999); // Set time to 11:59:59.999 PM
    return expiryDate;
}

const generateUniqueCardNumber = async () => {
    let cardNumber;
    let isUnique = false;

    while (!isUnique) {
        cardNumber = "4" + Math.floor(100000000000000 + Math.random() * 900000000000000); // Generates a 16-digit number starting with '4'
        const existingUser = await User.findOne({ cardNumber });
        if (!existingUser) {
            isUnique = true;
        }
    }
    return cardNumber;
};

export const handlePremiumUserCallback = async (webhookCallRes) => {
    try {

        // create order after payment success
        if (webhookCallRes.payment.payment_status === "SUCCESS") {

            let { userId, month } = webhookCallRes.order.order_tags;
            month = Number(month);

            const user = await User.findById(userId);

            const cardNumber = await generateUniqueCardNumber();

            user.isPremium = true;
            user.expiryDate = getExpiryDate(month);
            user.cardNumber = cardNumber;
            await user.save();

        }

        let newPayment = new Payment({ type: webhookCallRes.order.order_tags.forPayment, paymentResonse: webhookCallRes, userId: webhookCallRes.customer_details.customer_id, cfoOrder_id: webhookCallRes.payment_gateway_details.gateway_order_id, paymentStatus: webhookCallRes.payment.payment_status, amount: webhookCallRes.payment.payment_amount });
        newPayment = await newPayment.save();

        if (webhookCallRes.payment.payment_status === "SUCCESS") {
            let newData = new PremiumHistory({ createdBy: webhookCallRes.customer_details.customer_id, perMonth: Number(webhookCallRes.order.order_tags.month), price: Number(webhookCallRes.order.order_tags.amount), paymentId: newPayment._id });
            newData = await newData.save();
        }

        return true;
    } catch (error) {
        console.error("error", error);
        return false;
    }
};

export const handleAdPaymentCallback = async (webhookCallRes) => {
    try {
        const Ad = (await import("../models/Ad.js")).default;
        const Notification = (await import("../models/Notification.js")).default;
        const { ObjectId } = (await import("mongoose")).Types;

        const cf_order_id = webhookCallRes.payment_gateway_details.gateway_order_id;
        const paymentStatus = webhookCallRes.payment.payment_status;
        const { adId, sellerId, location, totalRunDays } = webhookCallRes.order.order_tags;

        console.log("🔄 Processing ad payment callback:", {
            cf_order_id,
            paymentStatus,
            adId,
            sellerId,
        });

        // Find ad by payment reference OR by adId (fallback)
        let ad = await Ad.findOne({
            paymentReference: cf_order_id,
            sellerId: new ObjectId(sellerId),
        });

        // If not found by paymentReference, try finding by adId
        if (!ad && adId) {
            ad = await Ad.findOne({
                _id: new ObjectId(adId),
                sellerId: new ObjectId(sellerId),
            });
            console.log("⚠️ Ad not found by paymentReference, trying adId:", ad ? "Found" : "Not found");
        }

        if (!ad) {
            console.error("❌ Ad not found for payment:", {
                cf_order_id,
                adId,
                sellerId,
            });
            return false;
        }

        console.log("✅ Ad found:", {
            adId: ad._id.toString(),
            currentStatus: ad.status,
            currentPaymentStatus: ad.paymentStatus,
        });

        // Save payment record
        let newPayment = new Payment({
            type: webhookCallRes.order.order_tags.forPayment,
            paymentResonse: webhookCallRes,
            userId: webhookCallRes.customer_details.customer_id,
            cfoOrder_id: cf_order_id,
            paymentStatus: paymentStatus,
            amount: webhookCallRes.payment.payment_amount,
        });
        await newPayment.save();
        console.log("✅ Payment record saved:", newPayment._id.toString());

        // If payment is successful, handle ad activation
        if (paymentStatus === "SUCCESS") {
            ad.paymentStatus = "paid";
            
            // Check if scheduledStartDate is provided in order tags
            const scheduledStartDate = webhookCallRes.order.order_tags?.scheduledStartDate 
                ? new Date(webhookCallRes.order.order_tags.scheduledStartDate)
                : null;
            
            if (scheduledStartDate && scheduledStartDate > new Date()) {
                // Ad is scheduled for future - keep status as "approved" until startDate arrives
                ad.status = "approved";
                ad.scheduledStartDate = scheduledStartDate;
                const end = new Date(scheduledStartDate);
                end.setDate(end.getDate() + Number(totalRunDays || ad.totalRunDays || 1));
                ad.startDate = scheduledStartDate;
                ad.endDate = end;
                
                console.log("📅 Ad scheduled for future:", {
                    scheduledStartDate: scheduledStartDate.toISOString(),
                    endDate: end.toISOString(),
                });
                
                // Send notification about scheduled activation
                try {
                    await Notification.create({
                        title: "Ad Payment Successful - Scheduled",
                        message: `Your ad '${ad.name}' payment was successful. Ad is scheduled to start on ${scheduledStartDate.toLocaleDateString('en-IN')} and will run for ${ad.totalRunDays} days.`,
                        type: "success",
                        targetRoles: ["seller"],
                        targetUserIds: [new ObjectId(sellerId)],
                        meta: {
                            category: "ad",
                            adId: ad._id.toString(),
                            paymentId: newPayment._id.toString(),
                        },
                    });
                } catch (notifError) {
                    console.error("Error sending scheduled ad notification:", notifError);
                }
            } else {
                // Activate immediately
                const start = new Date();
                const end = new Date(start);
                end.setDate(end.getDate() + Number(totalRunDays || ad.totalRunDays || 1));

                // ✅ Check for conflicts before activating (optional - log warning if conflict exists)
                try {
                    const adController = await import("../controllers/adController.js");
                    const { findOverlappingAds } = adController;
                    const storeIdForCheck = ad.storeId 
                        ? (ad.storeId.toString ? ad.storeId.toString() : ad.storeId)
                        : null;
                    
                    const { count, conflicts } = await findOverlappingAds({
                        location: ad.location,
                        projectedStart: start,
                        projectedEnd: end,
                        excludeAdId: ad._id,
                        storeId: storeIdForCheck,
                    });

                    const MAX_CONCURRENT_ADS_PER_LOCATION = 1;
                    if (count >= MAX_CONCURRENT_ADS_PER_LOCATION) {
                        console.warn("⚠️ Conflict detected, but payment successful. Activating anyway:", {
                            conflictCount: count,
                            conflicts: conflicts.map(c => ({
                                name: c.name,
                                startDate: c.startDate,
                                endDate: c.endDate,
                            })),
                        });
                        // Note: We activate anyway since payment is successful
                        // Admin can manually resolve conflicts if needed
                    }
                } catch (conflictCheckError) {
                    console.warn("⚠️ Could not check for conflicts (non-critical):", conflictCheckError.message);
                    // Continue with activation even if conflict check fails
                }

                ad.status = "active";
                ad.startDate = start;
                ad.endDate = end;
                ad.expiryNotified = false;
                
                console.log("✅ Activating ad immediately:", {
                    status: "active",
                    startDate: start.toISOString(),
                    endDate: end.toISOString(),
                });
                
                // Send notification about immediate activation
                try {
                    await Notification.create({
                        title: "Ad Payment Successful",
                        message: `Your ad '${ad.name}' payment was successful. Ad is now active and will run for ${ad.totalRunDays} days.`,
                        type: "success",
                        targetRoles: ["seller"],
                        targetUserIds: [new ObjectId(sellerId)],
                        meta: {
                            category: "ad",
                            adId: ad._id.toString(),
                            paymentId: newPayment._id.toString(),
                        },
                    });
                } catch (notifError) {
                    console.error("Error sending ad payment notification:", notifError);
                }
            }
            
            // ✅ Save ad with proper error handling
            try {
                await ad.save();
                console.log("✅ Ad saved successfully:", {
                    adId: ad._id.toString(),
                    status: ad.status,
                    paymentStatus: ad.paymentStatus,
                });
            } catch (saveError) {
                console.error("❌ Error saving ad:", saveError);
                throw saveError;
            }

            // Send notification to admin
            try {
                await Notification.create({
                    title: "Seller Ad Activated",
                    message: `Seller ad '${ad.name}' has been activated after successful payment.`,
                    type: "info",
                    targetRoles: ["admin"],
                    targetUserIds: [],
                    meta: {
                        category: "ad",
                        adId: ad._id.toString(),
                    },
                });
            } catch (notifError) {
                console.error("Error sending admin notification:", notifError);
            }
        } else {
            // Payment failed
            ad.paymentStatus = "pending";
            await ad.save();
            console.log("❌ Payment failed, status set to pending");
        }

        return true;
    } catch (error) {
        console.error("❌ Error in handleAdPaymentCallback:", {
            error: error.message,
            stack: error.stack,
            webhookData: {
                cf_order_id: webhookCallRes?.payment_gateway_details?.gateway_order_id,
                paymentStatus: webhookCallRes?.payment?.payment_status,
            },
        });
        return false;
    }
};
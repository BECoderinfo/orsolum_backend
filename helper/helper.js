import { jsonStatus, status } from '../helper/api.responses.js';
import Order from '../models/Order.js';
import OnlineOrder from '../models/OnlineStore/OnlineOrder.js';
import Payment from '../models/Payment.js';
import Cart from '../models/Cart.js';
import Address from '../models/Address.js';
import StoreOffer from '../models/StoreOffer.js';
import CouponCode from '../models/CouponCode.js';
import PremiumHistory from '../models/PremiumHistory.js';
import User from '../models/User.js';
import CoinHistory from '../models/CoinHistory.js';
import CouponHistory from '../models/CouponHistory.js';
import OnlineStoreCart from '../models/OnlineStore/OnlineStoreCart.js';
import { generateInvoice, generateOnlineInvoice } from './generateInvoice.js';
import ProductSubCategory from '../models/OnlineStore/SubCategory.js';

export const handleLocalStoreOrderCallback = async (webhookCallRes) => {
    try {

        let newOrder;

        // create order after payment success
        if (webhookCallRes.payment.payment_status === "SUCCESS") {
            let { coupon, storeId, donate, addressId, userId } = webhookCallRes.order.order_tags;
            donate = donate ? Number(donate) : 0;
            // Fetch user cart items for the given store
            const carts = await Cart.find({ createdBy: userId, storeId, deleted: false }).populate('productId');

            if (carts.length < 1) {
                return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Cart is empty for this store" });
            }

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
                    appliedOffers
                });
            });

            // Apply coupon discount (if provided)
            let couponCodeDiscount = 0;
            if (coupon) {
                const couponCode = await CouponCode.findById(coupon);

                if (!couponCode || couponCode.deleted) {
                    return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Coupon not found or deleted" });
                }

                if (couponCode.use === "one") {
                    const alreadyUsed = await CouponHistory.findOne({ couponId: couponCode._id, userId: userId });

                    if (alreadyUsed) {
                        return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Coupon already used" });
                    }
                }

                if (couponCode.minPrice && storeTotal < couponCode.minPrice) {
                    return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Minimum purchase of ${couponCode.minPrice} required for this coupon` });
                }

                const rawDiscount = (storeTotal * couponCode.discount) / 100;
                couponCodeDiscount = couponCode.upto ? Math.min(rawDiscount, couponCode.upto) : rawDiscount;
            }

            // Shipping Fee Logic
            const storeShippingFee = storeTotal > 500 ? 0 : 50;

            // Calculate grand total
            const grandTotal = storeTotal - storeDiscountAmount - couponCodeDiscount + storeShippingFee + donate;

            // Order Summary
            const orderSummary = {
                totalAmount: storeTotal,
                discountAmount: storeDiscountAmount + couponCodeDiscount,
                shippingFee: storeShippingFee,
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
                cf_order_id: webhookCallRes.payment_gateway_details.gateway_order_id,
                paymentStatus: webhookCallRes.payment.payment_status
            });

            await newOrder.save();

            generateInvoice(newOrder._id);

            // Mark cart items as deleted after order placement
            await Cart.updateMany({ createdBy: userId, storeId, deleted: false }, { $set: { deleted: true } });

            if (coupon) {
                await new CouponHistory({ couponId: coupon, userId }).save();
            }

        }

        // create payment
        let newPayment = new Payment({ type: webhookCallRes.order.order_tags.forPayment, paymentResonse: webhookCallRes, userId: webhookCallRes.customer_details.customer_id, orderId: newOrder?._id, orderIdString: newOrder?.orderId, cfoOrder_id: webhookCallRes.payment_gateway_details.gateway_order_id, paymentStatus: webhookCallRes.payment.payment_status, amount: webhookCallRes.payment.payment_amount });
        newPayment = await newPayment.save();
        return true;
    } catch (error) {
        console.error("error", error);
        return false;
    }
};

export const handleOnlineStoreOrderCallback = async (webhookCallRes) => {
    try {

        let newOrder;

        // create order after payment success
        if (webhookCallRes.payment.payment_status === "SUCCESS") {

            let { coupon, donate, addressId, userId, coinUsed } = webhookCallRes.order.order_tags;
            donate = donate ? Number(donate) : 0;
            coinUsed = coinUsed ? Number(coinUsed) : 0;

            const userDetails = await User.findById(userId);

            // Fetch user cart items
            const carts = await OnlineStoreCart.find({ createdBy: userId, deleted: false })
                .populate('productId')
                .populate('unitId');

            if (carts.length < 1) {
                return res.status(400).json({ success: false, message: "Cart is empty" });
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
                        offPer: `${percentageOff}% OFF`
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
            const grandTotal = totalAmount - couponCodeDiscount + shippingFee + donate - coinUsed;

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

            const user = await User.findById(userId);

            if (user.coins) {
                await User.findByIdAndUpdate(userId, { coins: user.coins + grandTotal });
            } else {
                await User.findByIdAndUpdate(userId, { coins: grandTotal });
            }

            let newCoinHistory = new CoinHistory({ createdBy: userId, coins: grandTotal, orderId: newOrder._id, type: "Added" });
            newCoinHistory = await newCoinHistory.save();

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
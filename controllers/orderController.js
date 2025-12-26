import { jsonStatus, messages, status } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";
import Cart from "../models/Cart.js";
import Store from "../models/Store.js";
import Product from "../models/Product.js";
import Address from "../models/Address.js";
import Order from "../models/Order.js";
import OnlineOrder from "../models/OnlineStore/OnlineOrder.js";
import CouponCode from "../models/CouponCode.js";
import CouponHistory from "../models/CouponHistory.js";
import StoreOffer from "../models/StoreOffer.js";
import Refund from "../models/Refund.js";
import Return from "../models/Return.js";
import mongoose from "mongoose";
import crypto from "crypto";
import axios from "axios";
import ShiprocketService from "../helper/shiprocketService.js";
import DeliveryBoy from "../models/DeliveryBoy.js";
import { generateInvoice, generateOnlineInvoice } from "../helper/generateInvoice.js";
import {
  handleLocalStoreOrderCallback,
  handleOnlineStoreOrderCallback,
  handlePremiumUserCallback,
  handleAdPaymentCallback,
} from "../helper/helper.js";
import Payment from "../models/Payment.js";
import { notifyLowStock } from "../helper/notificationHelper.js";
import User from "../models/User.js";
// import { image } from "pdfkit";


const { ObjectId } = mongoose.Types;

import { processGoogleMapsLink } from "../helper/latAndLong.js";

let limit = process.env.LIMIT;
limit = limit ? Number(limit) : 10;

const IN_PROGRESS_STATUSES = ["Accepted", "Product shipped", "On the way", "Out for delivery", "Your Destination"];
const LOCAL_STORE_MAX_DISTANCE_KM = 5;
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

const toRadians = (value = 0) => (value * Math.PI) / 180;

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (
    typeof lat1 !== "number" ||
    typeof lon1 !== "number" ||
    typeof lat2 !== "number" ||
    typeof lon2 !== "number"
  ) {
    return null;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = earthRadiusKm * c;

  return Number.isFinite(distance) ? Number(distance.toFixed(2)) : null;
};

export const createOrder = async (req, res) => {
  try {
    const { coupon, donationAmount = 0 } = req.body;

    const carts = await Cart.find({ createdBy: req.user._id, deleted: false });
    if (carts.length < 1) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const address = await Address.findOne({ createdBy: req.user._id });
    if (!address) {
      return res.status(400).json({ success: false, message: "Address not found" });
    }

    const orderId = `ORDER_${Date.now()}`;
    let overallTotalAmount = 0;

    // 🧮 Calculate totals
    const cartDetails = await Promise.all(
      carts.map(async (cart) => {
        const product = await Product.findById(cart.productId).populate("storeId");
        const totalAmount = product.sellingPrice * cart.quantity;
        overallTotalAmount += totalAmount;

        return {
          product,
          productId: cart.productId,
          storeId: product.storeId?._id,
          quantity: cart.quantity,
          sellingPrice: product.sellingPrice,
          totalAmount,
        };
      })
    );

    const stockUpdates = [];
    const lowStockWarnings = [];
    for (const detail of cartDetails) {
      const currentStock =
        typeof detail.product.stock === "number" ? detail.product.stock : null;
      if (currentStock === null) {
        continue;
      }

      if (detail.quantity > currentStock) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: `Only ${currentStock} unit(s) of ${detail.product.productName} available`,
        });
      }

      // Check if stock will be low after this order
      const newStock = currentStock - detail.quantity;
      const lowStockThreshold =
        typeof detail.product.lowStockThreshold === "number"
          ? detail.product.lowStockThreshold
          : 5; // Default threshold of 5

      if (newStock <= lowStockThreshold && newStock > 0) {
        lowStockWarnings.push({
          productName: detail.product.productName,
          currentStock: currentStock,
          quantityOrdered: detail.quantity,
          remainingStock: newStock,
          lowStockThreshold: lowStockThreshold
        });
      }

      stockUpdates.push({
        productId: detail.productId,
        retailerId: detail.product.createdBy,
        product: detail.product,
        newStock: newStock,
        lowStockThreshold: lowStockThreshold,
      });
    }

    // 🎟️ Coupon logic (enhanced)
    let couponCodeDiscount = 0;
    let appliedCoupon = null;
    if (coupon) {
      const couponCode = await CouponCode.findById(coupon);
      if (!couponCode || couponCode.deleted) {
        return res.status(404).json({ success: false, message: "Coupon not found" });
      }

      if (couponCode.use === "one") {
        const alreadyUsed = await CouponHistory.findOne({
          couponId: couponCode._id,
          userId: req.user._id,
        });
        if (alreadyUsed) {
          return res.status(400).json({ success: false, message: "Coupon already used" });
        }
      }

      if (couponCode.minOrderValue && overallTotalAmount < couponCode.minOrderValue) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${couponCode.minOrderValue} required`,
        });
      }

      // Calculate discount based on discount type
      if (couponCode.discountType === 'flat') {
        couponCodeDiscount = Math.min(couponCode.discountValue, overallTotalAmount);
      } else if (couponCode.discountType === 'percentage') {
        couponCodeDiscount = (overallTotalAmount * couponCode.discountValue) / 100;
        if (couponCode.maxDiscountAmount) {
          couponCodeDiscount = Math.min(couponCodeDiscount, couponCode.maxDiscountAmount);
        }
      }

      // Ensure discount doesn't exceed order total
      couponCodeDiscount = Math.min(couponCodeDiscount, overallTotalAmount);

      appliedCoupon = couponCode;
    }

    // Calculate total with discounts and donation
    let totalWithDiscount = overallTotalAmount - couponCodeDiscount;
    let totalWithDonation = totalWithDiscount + donationAmount;

    // Calculate shipping fee (example logic - you can adjust based on your business rules)
    const shippingFee = totalWithDiscount > 500 ? 0 : 50; // Free shipping above ₹500
    const finalTotal = totalWithDonation + shippingFee;

    // 🧾 Create orders
    await Promise.all(
      cartDetails.map(async (item) => {
        // Calculate item-level discount proportionally
        const itemRatio = item.totalAmount / overallTotalAmount;
        const itemDiscount = couponCodeDiscount * itemRatio;
        const itemTotalAfterDiscount = item.totalAmount - itemDiscount;

        // Calculate final item total with proportional donation and shipping
        const itemDonation = donationAmount * itemRatio;
        const itemShipping = shippingFee * itemRatio;
        const grandTotal = itemTotalAfterDiscount + itemDonation + itemShipping;

        const summary = {
          totalAmount: item.totalAmount,
          discountAmount: itemDiscount,
          shippingFee: itemShipping,
          donate: itemDonation,
          grandTotal,
        };

        // Get store to copy pickup_addresses
        const store = await Store.findById(item.storeId);

        const newOrder = new Order({
          address,
          createdBy: req.user._id,
          productId: item.productId,
          quantity: item.quantity,
          productPrice: item.sellingPrice,
          summary,
          orderId,
          shiprocket: store?.shiprocket?.pickup_addresses ? {
            pickup_addresses: store.shiprocket.pickup_addresses || [],
            default_pickup_address: store.shiprocket.default_pickup_address || null
          } : {}
        });

        await newOrder.save();

        // 🚀 Create Shiprocket order automatically
        try {
          if (store && store.shiprocket?.pickup_address_id) {
            const shipOrderPayload = {
              order_id: newOrder._id.toString(),
              order_date: new Date().toISOString(),
              pickup_location: store.shiprocket.pickup_address_id,
              billing_customer_name: req.user.name,
              billing_address: address.address_1,
              billing_city: address.city,
              billing_pincode: address.pincode,
              billing_state: address.state,
              billing_country: "India",
              billing_email: req.user.email,
              billing_phone: req.user.phone,
              order_items: [
                {
                  name: item.product.name,
                  sku: item.product._id.toString(),
                  units: item.quantity,
                  selling_price: item.product.sellingPrice,
                },
              ],
              payment_method: "Prepaid",
              sub_total: item.product.sellingPrice * item.quantity,
              length: 10,
              breadth: 10,
              height: 10,
              weight: 1,
            };

            const shiprocketOrder = await ShiprocketService.createOrder(shipOrderPayload);

            if (shiprocketOrder && shiprocketOrder.data?.shipment_id) {
              // Preserve existing pickup_addresses when updating shiprocket data
              newOrder.shiprocket = {
                ...(newOrder.shiprocket || {}),
                shipment_id: shiprocketOrder.data.shipment_id,
                order_id: shiprocketOrder.data.order_id,
                awb_code: shiprocketOrder.data.awb_code || null,
              };
              await newOrder.save();
              console.log("✅ Shiprocket order created:", shiprocketOrder.data.shipment_id);
            } else {
              console.warn("⚠️ Shiprocket order creation failed:", shiprocketOrder);
            }
          } else {
            console.warn("⚠️ No Shiprocket pickup address found for store:", item.storeId);
          }
        } catch (shipErr) {
          console.error("🚨 Error creating Shiprocket order:", shipErr.message);
        }
      })
    );

    // Record coupon usage if coupon was applied
    if (appliedCoupon) {
      await new CouponHistory({
        couponId: appliedCoupon._id,
        userId: req.user._id,
        orderId: orderId, // Link to the order
        discountAmount: couponCodeDiscount,
        orderTotalBeforeDiscount: overallTotalAmount,
        orderTotalAfterDiscount: finalTotal
      }).save();

      // Increment coupon usage count
      appliedCoupon.usageCount = (appliedCoupon.usageCount || 0) + 1;
      await appliedCoupon.save();
    }

    await Cart.updateMany({ createdBy: req.user._id }, { $set: { deleted: true } });

    if (stockUpdates.length) {
      await Promise.all(
        stockUpdates.map(async (update) => {
          await Product.findByIdAndUpdate(
            update.productId,
            {
              $set: { stock: update.newStock, totalStock: update.newStock },
              updatedBy: update.retailerId,
            },
            { new: true }
          );

          if (
            update.product &&
            update.lowStockThreshold > 0 &&
            update.newStock <= update.lowStockThreshold
          ) {
            try {
              update.product.stock = update.newStock;
              await notifyLowStock(
                update.retailerId,
                update.product,
                update.newStock
              );
            } catch (notifyErr) {
              console.warn("Low stock notification failed:", notifyErr.message);
            }
          }
        })
      );
    }

    // Calculate final bill summary
    const billSummary = {
      itemTotal: overallTotalAmount,
      discountAmount: overallDiscountAmount,
      couponCodeDiscount,
      couponCode: appliedCoupon ? appliedCoupon.code : null,
      shippingFee: shippingFee,
      donationAmount: donationAmount,
      charges: PLATFORM_FEE, // Include platform fee in charges
      totalPayable: finalTotal,
      saved: overallDiscountAmount + couponCodeDiscount // Total savings
    };

    res.status(200).json({
      success: true,
      message: lowStockWarnings.length > 0
        ? "Order created successfully & synced with Shiprocket. Note: Some products are running low on stock and the order may not be fulfilled as expected."
        : "Order created successfully & synced with Shiprocket",
      lowStockWarnings: lowStockWarnings.length > 0 ? lowStockWarnings : undefined,
      billSummary
    });
  } catch (error) {
    console.error("Error in createOrder:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addProductToCart = async (req, res) => {
  try {
    const { productId, storeId, quantity } = req.body;

    if (!productId || !storeId) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Please enter Product ID and Store ID`,
      });
    }

    const productDetails = await Product.findById(productId).populate("storeId");
    if (!productDetails) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Product not found",
      });
    }

    if (productDetails.deleted) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "You can't add deleted product in to the Cart",
      });
    }

    // ✅ Validate product status (must be Accepted)
    if (productDetails.status !== "A") {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Product is not available for purchase",
      });
    }

    // ✅ Validate product belongs to the specified store
    // Handle both populated and non-populated storeId
    const productStoreId = productDetails.storeId?._id
      ? productDetails.storeId._id.toString()
      : productDetails.storeId?.toString()
        ? productDetails.storeId.toString()
        : null;

    if (!productStoreId || productStoreId !== storeId.toString()) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Product does not belong to the specified store",
        debug: process.env.NODE_ENV === 'development' ? {
          productStoreId,
          requestedStoreId: storeId.toString(),
          storeIdType: typeof productDetails.storeId,
          isPopulated: !!productDetails.storeId?._id
        } : undefined
      });
    }

    // ✅ Enforce single-store cart with replace prompt
    const replaceCart = req.body?.replace === true || req.body?.replace === "1" || req.body?.replace === 1;
    const otherStoreCart = await Cart.findOne({
      createdBy: req.user._id,
      deleted: false,
      storeId: { $ne: storeId },
    }).populate("storeId", "name address");

    if (otherStoreCart && !replaceCart) {
      return res.status(409).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Your cart has items from another store. Replace cart to continue.",
        requireReplace: true,
        existingStore: otherStoreCart.storeId
          ? { id: otherStoreCart.storeId._id, name: otherStoreCart.storeId.name, address: otherStoreCart.storeId.address }
          : null,
      });
    }

    if (otherStoreCart && replaceCart) {
      await Cart.updateMany(
        { createdBy: req.user._id, deleted: false, storeId: { $ne: storeId } },
        { $set: { deleted: true } }
      );
    }

    const normalizedQuantity = Number(quantity);
    const safeQuantity =
      Number.isFinite(normalizedQuantity) && normalizedQuantity > 0
        ? Math.floor(normalizedQuantity)
        : 1;
    const availableStock =
      typeof productDetails.stock === "number" ? productDetails.stock : null;

    // Define low stock variables in outer scope
    const lowStockThreshold = typeof productDetails.lowStockThreshold === "number"
      ? productDetails.lowStockThreshold
      : 0;
    const isLowStock = availableStock !== null && lowStockThreshold > 0 && availableStock <= lowStockThreshold;

    const findProductInCart = await Cart.findOne({
      createdBy: req.user._id,
      productId,
      storeId,
      deleted: false,
    });

    const existingQty = findProductInCart ? findProductInCart.quantity : 0;

    if (availableStock !== null) {
      if (availableStock <= 0) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Product is currently out of stock.",
        });
      }

      const tentativeTotal = existingQty + safeQuantity;
      if (tentativeTotal > availableStock) {
        const remaining = Math.max(availableStock - existingQty, 0);

        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message:
            remaining > 0
              ? `Only ${remaining} unit(s) available in stock${isLowStock ? ' (Low Stock)' : ''}`
              : "You've reached the maximum available stock for this product.",
          data: {
            availableStock,
            lowStockThreshold,
            isLowStock,
            productId: productDetails._id
          }
        });
      }
    }

    if (findProductInCart) {
      findProductInCart.quantity = existingQty + safeQuantity;
      await findProductInCart.save();

      let totalCartCount = 0;
      const carts = await Cart.find({
        deleted: false,
        createdBy: req.user._id,
      });
      if (carts.length > 0) {
        carts.map((elem) => {
          totalCartCount += elem.quantity;
        });
      }

      res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        message: isLowStock ? `Product added to Cart (Low Stock: ${availableStock} units remaining)` : "Product added in to the Cart",
        count: findProductInCart.quantity,
        totalCartCount,
        data: isLowStock ? {
          lowStockWarning: true,
          availableStock,
          lowStockThreshold,
          message: `Only ${availableStock} units left in stock`
        } : null
      });
    } else {
      if (availableStock !== null && safeQuantity > availableStock) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: `Only ${availableStock} unit(s) available in stock`,
        });
      }

      let newCart = new Cart({
        productId,
        storeId,
        createdBy: req.user._id,
        quantity: safeQuantity || 1,
      });
      newCart = await newCart.save();

      let totalCartCount = 0;
      const carts = await Cart.find({
        deleted: false,
        createdBy: req.user._id,
      });
      if (carts.length > 0) {
        carts.map((elem) => {
          totalCartCount += elem.quantity;
        });
      }

      res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        message: "Product added in to the Cart",
        count: newCart.quantity,
        totalCartCount,
      });
    }
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("addProductToCart", error, req, res);
  }
};

export const incrementProductQuantityInCart = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Please enter Cart ID`,
      });
    }

    const findProduct = await Product.findOne({ _id: id });
    if (!findProduct) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Product is not found with this ID",
      });
    }

    const availableStock = typeof findProduct.stock === "number" ? findProduct.stock : null;

    const findCart = await Cart.findOne({
      productId: id,
      createdBy: req.user._id,
      deleted: false,
    });
    if (!findCart) {
      if (availableStock !== null && availableStock <= 0) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Product is currently out of stock.",
        });
      }

      // Check for low stock warning
      const lowStockThreshold = typeof findProduct.lowStockThreshold === "number"
        ? findProduct.lowStockThreshold
        : 0;

      const isLowStock = lowStockThreshold > 0 && availableStock <= lowStockThreshold;

      let newCart = new Cart({
        productId: id,
        storeId: findProduct.storeId,
        createdBy: req.user._id,
        quantity: 1,
      });
      newCart = await newCart.save();

      let totalCartCount = 0;
      const carts = await Cart.find({
        deleted: false,
        createdBy: req.user._id,
      });
      if (carts.length > 0) {
        carts.map((elem) => {
          totalCartCount += elem.quantity;
        });
      }

      res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        message: isLowStock ? `Quantity incremented (Low Stock: ${availableStock} units remaining)` : "Quantity incremented",
        count: newCart.quantity,
        totalCartCount,
        data: isLowStock ? {
          lowStockWarning: true,
          availableStock,
          lowStockThreshold,
          message: `Only ${availableStock} units left in stock`
        } : null
      });
    } else {
      if (availableStock !== null && findCart.quantity + 1 > availableStock) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "You have reached the available stock for this product.",
        });
      }

      // Check for low stock warning
      const product = await Product.findById(findCart.productId);
      const availableStock = typeof product.stock === "number" ? product.stock : null;
      const lowStockThreshold = typeof product.lowStockThreshold === "number"
        ? product.lowStockThreshold
        : 0;

      const isLowStock = lowStockThreshold > 0 && availableStock <= lowStockThreshold;

      findCart.quantity += 1;
      await findCart.save();

      let totalCartCount = 0;
      const carts = await Cart.find({
        deleted: false,
        createdBy: req.user._id,
      });
      if (carts.length > 0) {
        carts.map((elem) => {
          totalCartCount += elem.quantity;
        });
      }

      res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        message: isLowStock ? `Quantity incremented (Low Stock: ${availableStock} units remaining)` : "Quantity incremented",
        count: findCart.quantity,
        totalCartCount,
        data: isLowStock ? {
          lowStockWarning: true,
          availableStock,
          lowStockThreshold,
          message: `Only ${availableStock} units left in stock`
        } : null
      });
    }
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("incrementProductQuantityInCart", error, req, res);
  }
};

export const decrementProductQuantityInCart = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Please enter Cart ID`,
      });
    }

    const findProduct = await Product.findOne({ _id: id });
    if (!findProduct) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Product is not found with this ID",
      });
    }

    const findCart = await Cart.findOne({
      productId: id,
      createdBy: req.user._id,
      deleted: false,
    });
    if (!findCart) {
      res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: true,
        message: "Cart is not exist",
        count: 0,
      });
    } else {
      if (findCart.quantity > 1) {
        findCart.quantity -= 1;
        await findCart.save();

        let totalCartCount = 0;
        const carts = await Cart.find({
          deleted: false,
          createdBy: req.user._id,
        });
        if (carts.length > 0) {
          carts.map((elem) => {
            totalCartCount += elem.quantity;
          });
        }

        res.status(status.OK).json({
          status: jsonStatus.OK,
          success: true,
          message: "Quantity decremented",
          count: findCart.quantity,
          totalCartCount,
        });
      } else {
        await Cart.findByIdAndDelete(findCart._id);

        let totalCartCount = 0;
        const carts = await Cart.find({
          deleted: false,
          createdBy: req.user._id,
        });
        if (carts.length > 0) {
          carts.map((elem) => {
            totalCartCount += elem.quantity;
          });
        }

        res.status(status.OK).json({
          status: jsonStatus.OK,
          success: true,
          message: "Quantity decremented",
          count: 0,
          totalCartCount,
        });
      }
    }
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("decrementProductQuantityInCart", error, req, res);
  }
};

export const deleteProductFromCart = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Please enter Cart ID`,
      });
    }

    const findCart = await Cart.findOne({
      productId: id,
      deleted: false,
      createdBy: req.user._id,
    });
    if (!findCart) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Product is not found with this ID",
      });
    }

    await Cart.findByIdAndDelete(findCart._id);

    let totalCartCount = 0;
    const carts = await Cart.find({ deleted: false, createdBy: req.user._id });
    if (carts.length > 0) {
      carts.map((elem) => {
        totalCartCount += elem.quantity;
      });
    }

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Product deleted from Cart",
      count: 0,
      totalCartCount,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("deleteProductFromCart", error, req, res);
  }
};

export const cartDetails = async (req, res) => {
  try {
    let { coupon, donate } = req.query;
    const { id } = req.params;

    donate = donate ? Number(donate) : 0;

    let storeObjectId = null;

    // If store id is missing/invalid, try to find store from cart items
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      // Try to get store ID from user's cart items
      const userCartItems = await Cart.findOne({
        createdBy: req.user._id,
        deleted: false,
      }).populate({
        path: "productId",
        populate: { path: "storeId" },
      });

      if (userCartItems && userCartItems.productId && userCartItems.productId.storeId) {
        const storeIdFromCart = userCartItems.productId.storeId._id || userCartItems.productId.storeId;
        if (storeIdFromCart && mongoose.Types.ObjectId.isValid(storeIdFromCart.toString())) {
          storeObjectId = new mongoose.Types.ObjectId(storeIdFromCart.toString());
        }
      }

      // If still no valid store ID, return empty cart with same structure
      if (!storeObjectId) {
        const address = await Address.findOne({ createdBy: req.user._id });
        return res.status(status.OK).json({
          status: jsonStatus.OK,
          success: true,
          data: {
            stores: [],
            address,
            overallTotalAmount: 0,
            overallDiscountAmount: 0,
            overallShippingFee: 0,
            overallGrandTotal: 0,
            donate,
            couponCodeDiscount: 0,
            appliedOffers: [],
            similarProducts: [],
          },
        });
      }
    } else {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Invalid store ID format",
        });
      }
      storeObjectId = new mongoose.Types.ObjectId(id);
    }

    let findStore = await Store.findById(storeObjectId);
    if (!findStore) {
      // If store not found, try to get store from cart items
      const userCartItems = await Cart.findOne({
        createdBy: req.user._id,
        deleted: false,
      }).populate({
        path: "productId",
        populate: { path: "storeId" },
      });

      if (userCartItems && userCartItems.productId && userCartItems.productId.storeId) {
        const storeIdFromCart = userCartItems.productId.storeId._id || userCartItems.productId.storeId;
        if (storeIdFromCart && mongoose.Types.ObjectId.isValid(storeIdFromCart.toString())) {
          storeObjectId = new mongoose.Types.ObjectId(storeIdFromCart.toString());
          findStore = await Store.findById(storeObjectId);
          if (!findStore) {
            return res.status(status.NotFound).json({
              status: jsonStatus.NotFound,
              success: false,
              message: "Store not found",
            });
          }
        } else {
          return res.status(status.NotFound).json({
            status: jsonStatus.NotFound,
            success: false,
            message: "Store not found",
          });
        }
      } else {
        return res.status(status.NotFound).json({
          status: jsonStatus.NotFound,
          success: false,
          message: "Store not found",
        });
      }
    }

    const list = await Store.aggregate([
      {
        $match: {
          _id: storeObjectId,
        },
      },
      {
        $lookup: {
          from: "store_categories",
          localField: "category",
          foreignField: "_id",
          as: "category_name",
        },
      },
      {
        $addFields: {
          category_name: {
            $ifNull: [{ $arrayElemAt: ["$category_name.name", 0] }, null],
          },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "storeId",
          as: "productList",
          pipeline: [
            {
              $lookup: {
                from: "carts",
                localField: "_id",
                foreignField: "productId",
                as: "cartDetails",
                pipeline: [
                  {
                    $match: {
                      deleted: false,
                      createdBy: new mongoose.Types.ObjectId(req.user._id),
                    },
                  },
                ],
              },
            },
            {
              $match: {
                cartDetails: { $ne: [] },
              },
            },
            {
              $addFields: {
                cartDetails: {
                  $arrayElemAt: ["$cartDetails", 0],
                },
              },
            },
            {
              $match: {
                deleted: false,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          productList: {
            $ifNull: ["$productList", []],
          },
        },
      },
    ]);

    const address = await Address.findOne({ createdBy: req.user._id });

    const storeLocation = Array.isArray(list?.[0]?.location?.coordinates)
      ? list[0].location.coordinates
      : [];
    const storeLat = typeof storeLocation[1] === "number" ? storeLocation[1] : null;
    const storeLong = typeof storeLocation[0] === "number" ? storeLocation[0] : null;
    const addressLat = address ? Number(address.lat) : null;
    const addressLong = address ? Number(address.long) : null;

    const addressDistanceKm =
      storeLat !== null &&
        storeLong !== null &&
        Number.isFinite(addressLat) &&
        Number.isFinite(addressLong)
        ? calculateDistanceKm(storeLat, storeLong, addressLat, addressLong)
        : null;

    const isAddressInRange =
      addressDistanceKm === null ? true : addressDistanceKm <= LOCAL_STORE_MAX_DISTANCE_KM;

    let overallTotalAmount = 0;
    let overallShippingFee = 0;
    let overallGrandTotal = 0;
    let overallDiscountAmount = 0;
    let appliedOffers = []; // Store applied offers
    let overallCharges = 0;

    // Fetch store offers
    const storeOffers = await StoreOffer.find({
      storeId: storeObjectId,
      deleted: false,
    });

    // Ensure list is not empty - if store found, it should be in list
    if (!list || list.length === 0) {
      const address = await Address.findOne({ createdBy: req.user._id });
      return res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        data: {
          stores: [],
          address,
          overallTotalAmount: 0,
          overallDiscountAmount: 0,
          overallShippingFee: 0,
          overallGrandTotal: 0,
          donate,
          couponCodeDiscount: 0,
          appliedOffers: [],
          similarProducts: [],
        },
      });
    }

    const enhancedList = list.map((store) => {
      let storeTotalAmount = 0;
      let storeDiscountAmount = 0;
      let storeAppliedOffers = []; // Track applied offers at store level
      let storeBOGOProducts = new Set();

      // Ensure productList is an array
      const productList = Array.isArray(store.productList) ? store.productList : [];

      store.productList = productList.map((product) => {
        let productTotal = 0;
        let productDiscount = 0;
        let appliedProductOffers = [];
        let freeQuantity = 0;

        // ✅ Fix: Calculate product total correctly
        // Ensure cartDetails exists and has quantity
        if (product.cartDetails && product.cartDetails.quantity) {
          productTotal += product.sellingPrice * product.cartDetails.quantity;
        }

        storeTotalAmount += productTotal; // ✅ Fix: Ensure total is accumulated

        // ✅ Check if product is running low on stock
        const isLowStock = product.stock !== undefined && product.lowStockThreshold !== undefined &&
          product.stock > 0 && product.stock <= product.lowStockThreshold;

        storeOffers.forEach((offer) => {
          if (
            offer.offerType === "percentage_discount" &&
            storeTotalAmount >= offer.minOrderValue
          ) {
            const discount = (productTotal * offer.discountValue) / 100;
            productDiscount += discount;
            storeDiscountAmount += discount;
            storeAppliedOffers.push({
              type: "percentage_discount",
              description: `Flat ${offer.discountValue}% discount applied`,
            });
            appliedProductOffers.push({
              type: "percentage_discount",
              description: `Flat ${offer.discountValue}% discount`,
            });
          }

          if (
            offer.offerType === "flat_discount" &&
            storeTotalAmount >= offer.minOrderValue
          ) {
            const discount = offer.discountValue;
            productDiscount += discount;
            storeDiscountAmount += discount;
            storeAppliedOffers.push({
              type: "flat_discount",
              description: `Flat ₹${offer.discountValue} discount applied`,
            });
            appliedProductOffers.push({
              type: "flat_discount",
              description: `Flat ₹${offer.discountValue} discount`,
            });
          }

          if (
            offer.offerType === "buy_one_get_one" &&
            offer.selectedProducts.includes(product._id.toString())
          ) {
            storeBOGOProducts.add(product._id.toString());
            // ✅ Add same quantity as free
            if (product.cartDetails && product.cartDetails.quantity) {
              freeQuantity = product.cartDetails.quantity;
            }
            storeAppliedOffers.push({
              type: "buy_one_get_one",
              description: `Buy 1 Get 1 Free applied`,
            });
            appliedProductOffers.push({
              type: "buy_one_get_one",
              description: `Buy 1 Get 1 Free`,
            });
          }
        });

        return {
          ...product,
          appliedOffers: appliedProductOffers,
          freeQuantity,
          isLowStock: isLowStock,
          lowStockMessage: isLowStock ? `Only ${product.stock} units left in stock. Order may not be fulfilled as expected.` : undefined
        };
      });

      const charges = buildCharges({
        store,
        products: productList.map((p) => ({
          productPrice: p.sellingPrice,
          quantity: p.cartDetails?.quantity || 0,
          extraCharges: p.extraCharges,
        })),
        productsSubtotal: storeTotalAmount,
      });

      const storeShippingFee = storeTotalAmount > 500 ? 0 : 50; // Example shipping logic
      const storeGrandTotal =
        storeTotalAmount - storeDiscountAmount + storeShippingFee + charges.chargesTotal;

      overallTotalAmount += storeTotalAmount;
      overallDiscountAmount += storeDiscountAmount;
      overallShippingFee += storeShippingFee;
      overallCharges += charges.chargesTotal;
      overallGrandTotal += storeGrandTotal;

      appliedOffers.push(...storeAppliedOffers);

      return {
        ...store,
        totalAmount: storeTotalAmount,
        discountAmount: storeDiscountAmount,
        grandTotal: storeGrandTotal,
        bogoProducts: Array.from(storeBOGOProducts),
        appliedOffers: storeAppliedOffers,
        charges: {
          platformFee: charges.platformFee,
          total: charges.chargesTotal,
          breakdown: charges.breakdown,
        },
      };
    });

    let couponCodeDiscount = 0;
    let couponCode = null;

    if (coupon) {
      couponCode = await CouponCode.findById(coupon);

      if (!couponCode || couponCode.deleted) {
        return res.status(status.NotFound).json({
          status: jsonStatus.NotFound,
          success: false,
          message: "Coupon not found or deleted",
        });
      }

      if (couponCode.use === "one") {
        const alreadyUsed = await CouponHistory.findOne({
          couponId: couponCode._id,
          userId: req.user._id,
        });

        if (alreadyUsed) {
          return res.status(status.BadRequest).json({
            status: jsonStatus.BadRequest,
            success: false,
            message: "Coupon already used",
          });
        }
      }

      if (couponCode.minPrice && overallTotalAmount < couponCode.minPrice) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: `Minimum purchase of ${couponCode.minPrice} required for this coupon`,
        });
      }

      const rawDiscount = (overallTotalAmount * couponCode.discount) / 100;
      couponCodeDiscount = couponCode.upto
        ? Math.min(rawDiscount, couponCode.upto)
        : rawDiscount;

      // Subtract coupon discount from existing Grand Total (which includes charges & shipping)
      overallGrandTotal -= couponCodeDiscount;
    }

    // Add donation to grand total
    overallGrandTotal += donate;

    let storesIds = enhancedList.map((store) => new ObjectId(store._id));
    let similarProducts = [];

    const userId = req.user._id;

    if (storesIds.length > 0) {
      similarProducts = await Product.aggregate([
        {
          $match: {
            deleted: false,
            storeId: { $in: storesIds.map((id) => new ObjectId(id)) },
          },
        },
        {
          $lookup: {
            from: "carts",
            let: { productId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$productId", "$$productId"] },
                      { $eq: ["$createdBy", new ObjectId(userId)] },
                      { $eq: ["$deleted", false] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: "$productId",
                  totalQuantity: { $sum: "$quantity" },
                },
              },
            ],
            as: "cartInfo",
          },
        },
        {
          $addFields: {
            cartQuantity: {
              $ifNull: [{ $arrayElemAt: ["$cartInfo.totalQuantity", 0] }, 0],
            },
          },
        },
        {
          $sort: { createdAt: -1 },
        },
        {
          $limit: 10,
        },
        {
          $project: { cartInfo: 0 }, // Exclude cartInfo array from final response
        },
      ]);
    }

    // Calculate enhanced bill summary with all components
    const billSummary = {
      itemTotal: overallTotalAmount,
      discountAmount: overallDiscountAmount,
      couponDiscount: couponCodeDiscount,
      couponCode: couponCode ? couponCode.code : null,
      shippingFee: overallShippingFee,
      donationAmount: donate,
      charges: overallCharges,
      platformFee: PLATFORM_FEE,
      totalPayable: overallGrandTotal,
      saved: overallDiscountAmount + couponCodeDiscount // How much user saved
    };

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: {
        stores: enhancedList,
        address,
        overallTotalAmount,
        overallDiscountAmount,
        overallShippingFee,
        overallGrandTotal,
        donate,
        platformFee: PLATFORM_FEE,
        charges: overallCharges,
        couponCodeDiscount,
        appliedOffers,
        similarProducts,
        billSummary, // Enhanced bill summary
        addressRange: {
          distanceKm: addressDistanceKm,
          withinRange: isAddressInRange,
          maxRangeKm: LOCAL_STORE_MAX_DISTANCE_KM
        }
      },
    });
  } catch (error) {
    console.error("Error in cartDetails:", error.message);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
  }
};

export const allCartDetails = async (req, res) => {
  try {
    // Fetch all cart items belonging to the user
    const cartItems = await Cart.find({
      createdBy: req.user._id,
      deleted: false,
    }).populate({
      path: "productId",
      populate: { path: "storeId" }, // Populate store details
    });

    if (!cartItems.length) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "No cart items found",
      });
    }

    // Organize cart items by store
    let storeCartMap = {};
    cartItems.forEach((cart) => {
      const storeId = cart.productId.storeId._id.toString();
      if (!storeCartMap[storeId]) {
        storeCartMap[storeId] = {
          storeId: storeId,
          storeName: cart.productId.storeId.name,
          storeAddress: cart.productId.storeId.address,
          products: [],
          storeTotalAmount: 0,
          storeDiscountAmount: 0,
          storeShippingFee: 0,
          storeGrandTotal: 0,
          appliedOffers: [],
          storeBOGOProducts: new Set(),
        };
      }

      let product = {
        productId: cart.productId._id,
        productName: cart.productId.productName,
        productImages: cart.productId.productImages,
        price: cart.productId.sellingPrice,
        quantity: cart.quantity,
        freeQuantity: 0,
        totalAmount: cart.productId.sellingPrice * cart.quantity,
        appliedOffers: [],
      };

      storeCartMap[storeId].storeTotalAmount += product.totalAmount;
      storeCartMap[storeId].products.push(product);
    });

    // Fetch store offers
    const storeOffers = await StoreOffer.find({
      storeId: { $in: Object.keys(storeCartMap) },
      deleted: false,
    });

    // Apply store offers
    storeOffers.forEach((offer) => {
      const store = storeCartMap[offer.storeId.toString()];
      if (!store) return;

      store.products.forEach((product) => {
        if (
          offer.offerType === "percentage_discount" &&
          store.storeTotalAmount >= offer.minOrderValue
        ) {
          const discount = (product.totalAmount * offer.discountValue) / 100;
          product.appliedOffers.push({
            type: "percentage_discount",
            description: `Flat ${offer.discountValue}% discount applied`,
          });
          store.storeDiscountAmount += discount;
          store.appliedOffers.push({
            type: "percentage_discount",
            description: `Flat ${offer.discountValue}% discount applied`,
          });
        }

        if (
          offer.offerType === "flat_discount" &&
          store.storeTotalAmount >= offer.minOrderValue
        ) {
          store.storeDiscountAmount += offer.discountValue;
          store.appliedOffers.push({
            type: "flat_discount",
            description: `Flat ₹${offer.discountValue} discount applied`,
          });
          product.appliedOffers.push({
            type: "flat_discount",
            description: `Flat ₹${offer.discountValue} discount applied`,
          });
        }

        if (
          offer.offerType === "buy_one_get_one" &&
          offer.selectedProducts.includes(product.productId.toString())
        ) {
          store.storeBOGOProducts.add(product.productId.toString());
          product.freeQuantity = product.quantity; // ✅ BOGO: Add free quantity
          store.appliedOffers.push({
            type: "buy_one_get_one",
            description: "Buy 1 Get 1 Free applied",
          });
          product.appliedOffers.push({
            type: "buy_one_get_one",
            description: "Buy 1 Get 1 Free applied",
          });
        }
      });

      store.storeShippingFee = store.storeTotalAmount > 500 ? 0 : 50; // Example shipping logic
      store.storeGrandTotal =
        store.storeTotalAmount -
        store.storeDiscountAmount +
        store.storeShippingFee;
    });

    // Fetch user address
    const address = await Address.findOne({ createdBy: req.user._id });

    // Calculate overall totals
    let overallTotalAmount = 0;
    let overallDiscountAmount = 0;
    let overallShippingFee = 0;
    let overallGrandTotal = 0;
    let appliedOffers = [];

    Object.values(storeCartMap).forEach((store) => {
      overallTotalAmount += store.storeTotalAmount;
      overallDiscountAmount += store.storeDiscountAmount;
      overallShippingFee += store.storeShippingFee;
      overallGrandTotal += store.storeGrandTotal;
      appliedOffers.push(...store.appliedOffers);
    });

    // Apply coupon code if provided
    let couponCode = null;
    let couponCodeDiscount = 0;
    if (req.query.coupon) {
      couponCode = await CouponCode.findById(req.query.coupon);

      if (!couponCode || couponCode.deleted) {
        return res.status(status.NotFound).json({
          status: jsonStatus.NotFound,
          success: false,
          message: "Coupon not found or deleted",
        });
      }

      if (couponCode.use === "one") {
        const alreadyUsed = await CouponHistory.findOne({
          couponId: couponCode._id,
          userId: req.user._id,
        });

        if (alreadyUsed) {
          return res.status(status.BadRequest).json({
            status: jsonStatus.BadRequest,
            success: false,
            message: "Coupon already used",
          });
        }
      }

      if (couponCode.minPrice && overallTotalAmount < couponCode.minPrice) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: `Minimum purchase of ₹${couponCode.minPrice} required for this coupon`,
        });
      }

      const rawDiscount = (overallTotalAmount * couponCode.discount) / 100;
      couponCodeDiscount = couponCode.upto
        ? Math.min(rawDiscount, couponCode.upto)
        : rawDiscount;

      overallGrandTotal -= couponCodeDiscount;
    }

    // Calculate enhanced bill summary for all cart details
    const billSummary = {
      itemTotal: overallTotalAmount,
      discountAmount: overallDiscountAmount,
      couponDiscount: couponCodeDiscount,
      couponCode: couponCode ? couponCode.code : null,
      shippingFee: overallShippingFee,
      totalPayable: overallGrandTotal,
      saved: overallDiscountAmount + couponCodeDiscount // How much user saved
    };

    res.status(200).json({
      success: true,
      data: {
        stores: Object.values(storeCartMap),
        address,
        overallTotalAmount,
        overallDiscountAmount,
        overallShippingFee,
        overallGrandTotal,
        couponCodeDiscount,
        appliedOffers,
        billSummary, // Enhanced bill summary
      },
    });
  } catch (error) {
    console.error("Error in allCartDetails:", error.message);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
  }
};

export const couponCodeList = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const { search } = req.query;

    const list = await CouponCode.aggregate([
      {
        $lookup: {
          from: "counpon_histories",
          localField: "_id",
          foreignField: "couponId",
          as: "usageHistory",
        },
      },
      {
        $addFields: {
          isUsedByUser: {
            $cond: {
              if: {
                $and: [
                  { $eq: ["$use", "one"] },
                  {
                    $in: [
                      userId,
                      {
                        $map: {
                          input: "$usageHistory",
                          as: "history",
                          in: "$$history.userId",
                        },
                      },
                    ],
                  },
                ],
              },
              then: true,
              else: false,
            },
          },
        },
      },
      {
        $match: {
          $or: [{ use: "many" }, { isUsedByUser: false }],
          deleted: false,
          name: {
            $regex: search,
            $options: "i",
          },
        },
      },
      {
        $project: {
          usageHistory: 0,
          isUsedByUser: 0,
        },
      },
    ]);

    res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: list });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("couponCodeList", error, req, res);
  }
};

export const createAddress = async (req, res) => {
  try {
    const { address_1, flatHouse, name, pincode, mapLink, lat, long, city, state, country, landmark, type } =
      req.body;

    // Enhanced logging for debugging
    console.log("Creating address with data:", req.body);
    console.log("User ID:", req.user._id);

    // Required fields validation with enhanced type safety
    if (!address_1 || (typeof address_1 === 'string' && address_1.trim() === "")) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Address (address_1) is required",
      });
    }

    if (!pincode || (typeof pincode === 'string' && pincode.trim() === "")) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Pincode is required",
      });
    }

    // Validate pincode format (should be 6 digits)
    const pincodeStr = pincode.toString().trim();
    if (!/^\d{6}$/.test(pincodeStr)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Pincode must be 6 digits",
      });
    }

    const allowedTypes = ["Home", "Work", "Other"];
    const normalizedType = typeof type === "string"
      ? allowedTypes.find((t) => t.toLowerCase() === type.toLowerCase())
      : null;

    if (type && !normalizedType) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "type must be Home, Work, or Other",
      });
    }

    let finalLat = lat ? lat.toString() : "0";
    let finalLong = long ? long.toString() : "0";

    // Extract coordinates from mapLink if lat/long are not provided and link exists
    if (mapLink && (finalLat === "0" || finalLong === "0")) {
      try {
        const coords = await processGoogleMapsLink(mapLink);
        if (coords && coords.lat && coords.lng) {
          finalLat = coords.lat.toString();
          finalLong = coords.lng.toString();
        }
      } catch (err) {
        console.warn("Failed to extract coordinates from mapLink in createAddress:", err.message);
      }
    }

    // Fallback: Try to fetch coordinates from Pincode/Address if still 0
    if (finalLat === "0" || finalLong === "0") {
      try {
        const { getCoordinatesFromAddress } = await import("../helper/geocoding.js");
        const query = pincodeStr || address_1; // Use pincode or address string
        if (query) {
          const geoCoords = await getCoordinatesFromAddress(query);
          if (geoCoords) {
            console.log(`Resolved coordinates for ${query}:`, geoCoords);
            finalLat = geoCoords.lat.toString();
            finalLong = geoCoords.lng.toString();
          }
        }
      } catch (geoErr) {
        console.warn("Geocoding fallback failed:", geoErr.message);
      }
    }

    // Generate default values for required fields if not provided
    const addressData = {
      address_1: typeof address_1 === 'string' ? address_1.trim() : address_1,
      flatHouse: flatHouse ? (typeof flatHouse === 'string' ? flatHouse.trim() : flatHouse.toString()) : "",
      name: name ? (typeof name === 'string' ? name.trim() : name.toString()) : (req.user?.name || "Home"),
      pincode: pincodeStr,
      city: city ? (typeof city === 'string' ? city.trim() : city.toString()) : "",
      state: state ? (typeof state === 'string' ? state.trim() : state.toString()) : "",
      country: country ? (typeof country === 'string' ? country.trim() : country.toString()) : "India", // Default to India
      landmark: landmark ? (typeof landmark === 'string' ? landmark.trim() : landmark.toString()) : "",
      mapLink: mapLink ? (typeof mapLink === 'string' ? mapLink.trim() : mapLink.toString()) : `https://maps.google.com/?q=${finalLat},${finalLong}`,
      lat: finalLat,
      long: finalLong,
      number: req.user?.phone || "",
      createdBy: req.user._id,
      type: normalizedType || "Home",
    };

    // Validate coordinates if provided
    if (lat && isNaN(parseFloat(lat))) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid latitude value",
      });
    }

    if (long && isNaN(parseFloat(long))) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid longitude value",
      });
    }

    console.log("Final address data to save:", addressData);

    let newAddress = new Address(addressData);
    newAddress = await newAddress.save();

    console.log("Address saved successfully with ID:", newAddress._id);

    // Update user's default location if this is their first address
    const userAddressCount = await Address.countDocuments({ createdBy: req.user._id });
    console.log("User address count:", userAddressCount);

    if (userAddressCount === 1 && finalLat !== "0" && finalLong !== "0") {
      console.log("Updating user default location");
      await User.findByIdAndUpdate(req.user._id, {
        lat: finalLat,
        long: finalLong,
        city: city || "",
        state: state || "",
        country: country || "India"
      });
    }

    return res
      .status(status.OK)
      .json({
        status: jsonStatus.OK,
        success: true,
        message: "Address created successfully",
        data: newAddress
      });
  } catch (error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      console.error("Address validation error:", error.message);
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: error.message || "Validation error",
      });
    }

    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to create address",
    });
    return catchError("createAddress", error, req, res);
  }
};

export const editAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate address ID parameter
    if (!id) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Address ID is required",
      });
    }

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid address ID format",
      });
    }

    // Check if address exists and belongs to user
    const address = await Address.findOne({ _id: id, createdBy: req.user._id });
    if (!address) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Address not found or you don't have permission to update it",
      });
    }

    // Validate required fields if they are being updated
    const { address_1, pincode } = req.body;
    if (address_1 !== undefined && !address_1) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "address_1 cannot be empty",
      });
    }
    if (pincode !== undefined && !pincode) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "pincode cannot be empty",
      });
    }

    // Validate pincode format if being updated
    if (pincode !== undefined) {
      const pincodeStr = pincode.toString().trim();
      if (!/^\d{6}$/.test(pincodeStr)) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Pincode must be 6 digits",
        });
      }
    }

    // Normalize and validate type if provided
    const allowedTypes = ["Home", "Work", "Other"];
    let updatePayload = { ...req.body };

    if (req.body.type !== undefined) {
      const normalizedType = typeof req.body.type === "string"
        ? allowedTypes.find((t) => t.toLowerCase() === req.body.type.toLowerCase())
        : null;

      if (!normalizedType) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "type must be Home, Work, or Other",
        });
      }
      updatePayload.type = normalizedType;
    }

    // Update address
    const updateAddress = await Address.findByIdAndUpdate(
      id,
      updatePayload,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updateAddress) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Address not found after update",
      });
    }

    // Update user's default location if this address was their default
    if (req.user.lat === address.lat && req.user.long === address.long) {
      await User.findByIdAndUpdate(req.user._id, {
        lat: updateAddress.lat || "0",
        long: updateAddress.long || "0",
        city: updateAddress.city || "",
        state: updateAddress.state || "",
        country: updateAddress.country || "India"
      });
    }

    return res
      .status(status.OK)
      .json({
        status: jsonStatus.OK,
        success: true,
        message: "Address updated successfully",
        data: updateAddress
      });
  } catch (error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: error.message || "Validation error",
      });
    }

    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to update address",
    });
    return catchError("editAddress", error, req, res);
  }
};

export const getAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate address ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid address ID",
      });
    }

    const address = await Address.findOne({ createdBy: req.user._id, _id: id });

    if (!address) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Address not found",
      });
    }

    return res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: address });
  } catch (error) {
    console.error("getAddress error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to retrieve address",
    });
    return catchError("getAddress", error, req, res);
  }
};

export const getUserAllAddress = async (req, res) => {
  try {
    const { storeId } = req.query;

    let storeLat = null;
    let storeLong = null;

    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
      const store = await Store.findById(storeId).select("location");
      const coords = store?.location?.coordinates || [];
      storeLat = typeof coords[1] === "number" ? coords[1] : null;
      storeLong = typeof coords[0] === "number" ? coords[0] : null;
    }

    const addresses = await Address.find({ createdBy: req.user._id }).lean();

    const enhancedAddresses = addresses.map((addr) => {
      const addrLat = Number(addr.lat);
      const addrLong = Number(addr.long);
      const hasCoords =
        Number.isFinite(addrLat) &&
        Number.isFinite(addrLong) &&
        storeLat !== null &&
        storeLong !== null;

      const distanceKm = hasCoords
        ? calculateDistanceKm(storeLat, storeLong, addrLat, addrLong)
        : null;

      return {
        ...addr,
        distanceKm,
        withinRange:
          distanceKm === null ? true : distanceKm <= LOCAL_STORE_MAX_DISTANCE_KM,
      };
    });

    return res
      .status(status.OK)
      .json({
        status: jsonStatus.OK,
        success: true,
        data: enhancedAddresses || [],
        count: enhancedAddresses.length
      });
  } catch (error) {
    console.error("getUserAllAddress error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to retrieve addresses",
    });
    return catchError("getUserAllAddress", error, req, res);
  }
};

export const getAllAddress = async (req, res) => {
  try {
    const address = await Address.find();

    return res
      .status(status.OK)
      .json({
        status: jsonStatus.OK,
        success: true,
        data: address || [],
        count: address.length
      });
  } catch (error) {
    console.error("getAllAddress error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to retrieve addresses",
    });
    return catchError("getAllAddress", error, req, res);
  }
};

// Delete user address (for location-based addresses from permission)
export const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate address ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid address ID",
      });
    }

    const address = await Address.findOne({ _id: id, createdBy: req.user._id });
    if (!address) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Address not found or you don't have permission to delete it",
      });
    }

    await Address.findByIdAndDelete(id);

    // Return remaining addresses so mobile app can refresh immediately
    const remainingAddresses = await Address.find({ createdBy: req.user._id }).lean();

    // If this was the user's default address, update their profile
    if (req.user.lat === address.lat && req.user.long === address.long) {
      await User.findByIdAndUpdate(req.user._id, {
        lat: "0",
        long: "0",
        city: "",
        state: "",
        country: "India"
      });
    }

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Address deleted successfully",
      data: {
        addresses: remainingAddresses,
        hasAddress: remainingAddresses.length > 0,
      },
    });
  } catch (error) {
    console.error("deleteAddress error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to delete address",
    });
    return catchError("deleteAddress", error, req, res);
  }
};
// Set user's default address
export const setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate address ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid address ID",
      });
    }

    // Check if address exists and belongs to user
    const address = await Address.findOne({ _id: id, createdBy: req.user._id });
    if (!address) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Address not found or you don't have permission to set as default",
      });
    }

    // Update user's default location with the selected address coordinates
    await User.findByIdAndUpdate(req.user._id, {
      lat: address.lat || "0",
      long: address.long || "0",
      city: address.city || "",
      state: address.state || "",
      country: address.country || "India"
    });

    return res
      .status(status.OK)
      .json({
        status: jsonStatus.OK,
        success: true,
        message: "Default address set successfully",
        data: address
      });
  } catch (error) {
    console.error("setDefaultAddress error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to set default address",
    });
    return catchError("setDefaultAddress", error, req, res);
  }
};

export const createOrderV2 = async (req, res) => {
  try {
    const { coupon, storeId, donate, addressId, paymentType } = req.body;

    // Normalize optional fields
    const donateValue = Number(donate || 0);

    if (!storeId) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "storeId is required",
      });
    }

    const validPaymentTypes = ["CARD", "WALLET", "BANK", "COD", "QR"];
    if (paymentType && !validPaymentTypes.includes(paymentType.toUpperCase())) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Invalid paymentType. Must be one of: ${validPaymentTypes.join(", ")}`,
      });
    }

    // ✅ Address Validation
    let address =
      (await Address.findOne({ _id: addressId, createdBy: req.user._id })) ||
      (await Address.findOne({ createdBy: req.user._id }));

    if (!address) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please add a delivery address",
      });
    }

    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    const storeCoords = store?.location?.coordinates || [];
    const storeLat = typeof storeCoords[1] === "number" ? storeCoords[1] : null;
    const storeLong = typeof storeCoords[0] === "number" ? storeCoords[0] : null;
    const addressLat = Number(address.lat);
    const addressLong = Number(address.long);

    if (
      storeLat === null ||
      storeLong === null ||
      !Number.isFinite(addressLat) ||
      !Number.isFinite(addressLong)
    ) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please select an address with a valid location to continue delivery",
      });
    }

    const deliveryDistanceKm = calculateDistanceKm(storeLat, storeLong, addressLat, addressLong);
    if (deliveryDistanceKm === null || deliveryDistanceKm > LOCAL_STORE_MAX_DISTANCE_KM) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Delivery address is outside the ${LOCAL_STORE_MAX_DISTANCE_KM} km store range. Please choose a nearby address.`,
        distanceKm: deliveryDistanceKm,
      });
    }

    // ✅ Fetch Cart
    const carts = await Cart.find({
      createdBy: req.user._id,
      storeId,
      deleted: false,
    }).populate("productId");

    if (carts.length < 1) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Cart is empty for this store",
      });
    }

    // ✅ Validate all products exist and are available
    const validCarts = [];
    const invalidProducts = [];

    for (const cart of carts) {
      if (!cart.productId) {
        invalidProducts.push(`Product ID: ${cart.productId || 'Unknown'}`);
        continue;
      }

      // Check if product is deleted or not active
      if (cart.productId.deleted || cart.productId.status !== "A") {
        invalidProducts.push(cart.productId.productName || 'Unknown Product');
        continue;
      }

      // Validate required fields
      if (typeof cart.productId.sellingPrice !== 'number' || cart.productId.sellingPrice <= 0) {
        invalidProducts.push(`${cart.productId.productName || 'Product'}: Invalid price`);
        continue;
      }

      validCarts.push(cart);
    }

    if (validCarts.length < 1) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: invalidProducts.length > 0
          ? `Some products are no longer available: ${invalidProducts.join(', ')}`
          : "No valid products found in cart",
      });
    }

    // ✅ Calculate totals
    let storeTotal = 0;
    let storeDiscountAmount = 0;
    let productDetails = [];

    const storeOffers = await StoreOffer.find({ storeId, deleted: false });

    const stockUpdates = [];
    for (const cart of validCarts) {
      // ✅ Safe access with validation
      if (!cart.productId || !cart.productId._id) {
        console.warn(`Skipping cart item with invalid product: ${cart._id}`);
        continue;
      }

      const productPrice = cart.productId.sellingPrice || 0;
      const mrp = cart.productId.mrp || productPrice;
      const quantity = cart.quantity || 1;
      let freeQuantity = 0;
      let appliedOffers = [];

      storeOffers.forEach((offer) => {
        if (
          offer.offerType === "buy_one_get_one" &&
          offer.selectedProducts.includes(cart.productId._id.toString())
        ) {
          freeQuantity = quantity;
          appliedOffers.push({
            type: "buy_one_get_one",
            description: "Buy 1 Get 1 Free",
          });
        }
      });

      const currentStock =
        typeof cart.productId.stock === "number" ? cart.productId.stock : null;
      if (currentStock !== null) {
        if (quantity > currentStock) {
          return res.status(status.BadRequest).json({
            status: jsonStatus.BadRequest,
            success: false,
            message: `Only ${currentStock} unit(s) of ${cart.productId.productName} available`,
          });
        }

        stockUpdates.push({
          productId: cart.productId._id,
          retailerId: cart.productId.createdBy,
          product: cart.productId,
          newStock: currentStock - quantity,
          lowStockThreshold:
            typeof cart.productId.lowStockThreshold === "number"
              ? cart.productId.lowStockThreshold
              : 0,
        });
      }

      storeTotal += productPrice * quantity;

      productDetails.push({
        productId: cart.productId._id,
        productPrice,
        mrp,
        quantity,
        freeQuantity,
        appliedOffers,
      });
    }

    // ✅ Coupon Logic (enhanced)
    let couponCodeDiscount = 0;
    let appliedCoupon = null;
    if (coupon) {
      const couponCode = await CouponCode.findById(coupon);
      if (!couponCode || couponCode.deleted) {
        return res.status(status.NotFound).json({
          status: jsonStatus.NotFound,
          success: false,
          message: "Coupon not found or deleted",
        });
      }

      // Check if coupon is valid for this user
      if (couponCode.use === "one") {
        const alreadyUsed = await CouponHistory.findOne({
          couponId: couponCode._id,
          userId: req.user._id,
        });
        if (alreadyUsed) {
          return res.status(status.BadRequest).json({
            status: jsonStatus.BadRequest,
            success: false,
            message: "Coupon already used",
          });
        }
      }

      // Check minimum order value
      if (couponCode.minOrderValue && storeTotal < couponCode.minOrderValue) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: `Minimum purchase of ₹${couponCode.minOrderValue} required for this coupon`,
        });
      }

      // Calculate discount based on discount type
      if (couponCode.discountType === 'flat') {
        couponCodeDiscount = Math.min(couponCode.discountValue, storeTotal);
      } else if (couponCode.discountType === 'percentage') {
        couponCodeDiscount = (storeTotal * couponCode.discountValue) / 100;
        if (couponCode.maxDiscountAmount) {
          couponCodeDiscount = Math.min(couponCodeDiscount, couponCode.maxDiscountAmount);
        }
      }

      // Ensure discount doesn't exceed order total
      couponCodeDiscount = Math.min(couponCodeDiscount, storeTotal);

      appliedCoupon = couponCode;
    }

    const charges = buildCharges({
      store,
      products: productDetails,
      productsSubtotal: storeTotal,
    });

    // ✅ Shipping Fee
    const storeShippingFee = storeTotal > 500 ? 0 : 50;

    // ✅ Grand Total
    const grandTotal =
      storeTotal -
      storeDiscountAmount -
      couponCodeDiscount +
      storeShippingFee +
      donateValue +
      charges.chargesTotal;

    // ✅ Create Cashfree payment session
    const paymentRequestData = {
      order_currency: "INR",
      order_amount: grandTotal,
      order_tags: {
        forPayment: "LocalStore",
        storeId,
        donate: donateValue.toString(),
        addressId,
        userId: req.user._id,
        paymentType: paymentType || "CARD",
      },
      customer_details: {
        customer_id: req.user._id.toString(),
        customer_phone: req.user.phone?.replace("+91", "") || "9999999999",
        customer_name: req.user.name || "Customer",
        customer_email: req.user.email || `${req.user.phone}@orsolum.com`,
      },
    };

    // ✅ Validate Cashfree environment variables
    if (!process.env.CF_CREATE_PRODUCT_URL || !process.env.CF_CLIENT_ID || !process.env.CF_CLIENT_SECRET) {
      return res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: "Payment gateway configuration is missing. Please contact support.",
      });
    }

    const headers = {
      "x-api-version": process.env.CF_API_VERSION || "2022-09-01",
      "x-client-id": process.env.CF_CLIENT_ID,
      "x-client-secret": process.env.CF_CLIENT_SECRET,
      "Content-Type": "application/json",
    };

    // ✅ Create Cashfree payment session with error handling
    let cashFreeSession;
    let cf_order_id;
    let paymentSessionId;

    try {
      cashFreeSession = await axios.post(
        process.env.CF_CREATE_PRODUCT_URL,
        paymentRequestData,
        { headers, timeout: 30000 } // 30 second timeout
      );

      if (!cashFreeSession.data || !cashFreeSession.data.order_id) {
        throw new Error("Invalid response from payment gateway");
      }

      cf_order_id = cashFreeSession.data.order_id;
      paymentSessionId = cashFreeSession.data.payment_session_id;
    } catch (cashfreeError) {
      console.error("Cashfree API Error:", cashfreeError.response?.data || cashfreeError.message);
      return res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: cashfreeError.response?.data?.message || "Failed to initialize payment. Please try again.",
        error: process.env.NODE_ENV === 'development' ? cashfreeError.message : undefined,
      });
    }

    // ✅ Validate address object
    if (!address || !address.address_1) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid delivery address. Please update your address.",
      });
    }

    // ✅ Validate grandTotal is positive
    if (grandTotal <= 0) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Order total must be greater than zero",
      });
    }

    // ✅ Save the Order in MongoDB before sending response
    let newOrder;
    try {
      newOrder = new Order({
        createdBy: req.user._id,
        storeId,
        orderId: `ORD_${Date.now()}`,
        cf_order_id,
        paymentSessionId,
        paymentStatus: "PENDING",
        paymentType: paymentType || "CARD",
        address: address.toObject ? address.toObject() : address,
        summary: {
          totalAmount: storeTotal,
          discountAmount: storeDiscountAmount + couponCodeDiscount,
          shippingFee: storeShippingFee,
          platformFee: charges.platformFee,
          extraCharges: charges.breakdown,
          donate: donateValue,
          grandTotal,
        },
        productDetails,
        status: "Pending",
        shiprocket: store?.shiprocket?.pickup_addresses ? {
          pickup_addresses: store.shiprocket.pickup_addresses || [],
          default_pickup_address: store.shiprocket.default_pickup_address || null
        } : {}
      });

      await newOrder.save();

      // ✅ Record coupon usage if coupon was applied
      if (appliedCoupon) {
        await new CouponHistory({
          couponId: appliedCoupon._id,
          userId: req.user._id,
          orderId: newOrder._id, // Link to the order
          discountAmount: couponCodeDiscount,
          orderTotalBeforeDiscount: storeTotal,
          orderTotalAfterDiscount: grandTotal
        }).save();

        // Increment coupon usage count
        appliedCoupon.usageCount = (appliedCoupon.usageCount || 0) + 1;
        await appliedCoupon.save();
      }
    } catch (saveError) {
      console.error("Error saving order:", saveError);
      return res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: "Failed to save order. Please try again.",
        error: process.env.NODE_ENV === 'development' ? saveError.message : undefined,
      });
    }

    // ✅ Send notification to retailer about new order
    try {
      const { notifyNewOrder } = await import('../helper/notificationHelper.js');
      if (store && store.createdBy) {
        await notifyNewOrder(store.createdBy, newOrder);
      }
    } catch (notifError) {
      console.error('Error sending new order notification:', notifError);
      // Continue even if notification fails
    }

    // ✅ Soft-clear cart items for this store & user (they are now part of the order)
    await Cart.updateMany(
      { createdBy: req.user._id, storeId, deleted: false },
      { $set: { deleted: true } }
    );

    if (stockUpdates.length) {
      await Promise.all(
        stockUpdates.map(async (update) => {
          await Product.findByIdAndUpdate(
            update.productId,
            {
              $set: { stock: update.newStock, totalStock: update.newStock },
              updatedBy: update.retailerId,
            },
            { new: true }
          );

          if (
            update.product &&
            update.lowStockThreshold > 0 &&
            update.newStock <= update.lowStockThreshold
          ) {
            try {
              update.product.stock = update.newStock;
              await notifyLowStock(
                update.retailerId,
                update.product,
                update.newStock
              );
            } catch (notifyErr) {
              console.warn("Low stock notification failed:", notifyErr.message);
            }
          }
        })
      );
    }

    // Calculate final bill summary with standardized structure
    const billSummary = {
      itemTotal: storeTotal,
      donationAmount: donateValue, // Donation amount as per requirements
      totalDiscount: storeDiscountAmount, // Store-level discounts
      couponDiscount: couponCodeDiscount, // Coupon-specific discount
      couponCode: appliedCoupon ? appliedCoupon.code : null,
      shippingFee: storeShippingFee,
      extraCharges: charges.chargesTotal,
      platformFee: charges.platformFee,
      totalPayable: grandTotal,
      saved: storeDiscountAmount + couponCodeDiscount, // Total savings
    };

    // ✅ Respond with the actual Mongo ID
    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Order created successfully",
      billSummary, // Include complete bill summary
      data: {
        _id: newOrder._id, // ✅ Real ID now
        paymentSessionId,
        cf_order_id,
      },
    });
  } catch (error) {
    console.error("Error in createOrderV2:", error);
    console.error("Error stack:", error.stack);

    // ✅ Provide more descriptive error messages
    let errorMessage = "Failed to create order. Please try again.";

    if (error.name === 'ValidationError') {
      errorMessage = "Invalid order data. Please check your cart and address.";
    } else if (error.name === 'CastError') {
      errorMessage = "Invalid data format. Please refresh and try again.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined,
    });
  }
};


const verify = (ts, rawBody) => {
  const body = ts + rawBody;
  const secretKey = process.env.CF_CLIENT_SECRET;
  let genSignature = crypto
    .createHmac("sha256", secretKey)
    .update(body)
    .digest("base64");
  return genSignature;
};

export const paymentWebhookCall = async (req, res) => {
  try {
    console.log("req.body", req.body);
    const ts = req.headers["x-webhook-timestamp"];
    const signature = req.headers["x-webhook-signature"];
    const genSignature = verify(ts, req.rawBody);
    if (signature === genSignature) {
      // do logic
      const webhookCallRes = req.body.data;
      if (webhookCallRes.order.order_tags.forPayment === "LocalStore") {
        await handleLocalStoreOrderCallback(webhookCallRes);
      } else if (webhookCallRes.order.order_tags.forPayment === "OnlineStore") {
        await handleOnlineStoreOrderCallback(webhookCallRes);
      } else if (webhookCallRes.order.order_tags.forPayment === "Premium") {
        await handlePremiumUserCallback(webhookCallRes);
      } else if (webhookCallRes.order.order_tags.forPayment === "Ad") {
        await handleAdPaymentCallback(webhookCallRes);
      } else {
        console.log("No match");
      }

      res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        message: "Payment created successfully",
      });
    } else {
      res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Webhook signature is not verified",
      });
    }
  } catch (error) {
    console.error("error", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Find the order for the logged-in user
    const order = await Order.findOne({ _id: id, createdBy: req.user._id });
    if (!order) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Order not found with this ID",
      });
    }

    // 2️⃣ Check if payment record exists
    const paymentResponse = await Payment.findOne({ orderId: order._id, type: "LocalStore" });

    const cancelWithoutRefund = async (message) => {
      await Order.findOneAndUpdate(
        { createdBy: req.user._id, _id: id },
        { status: "Cancelled" },
        { new: true, runValidators: true }
      );

      return res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        message,
        data: { refundInitiated: false },
      });
    };

    if (!paymentResponse) {
      return await cancelWithoutRefund("Order cancelled successfully. Payment was not captured for this order.");
    }

    const isCodOrder =
      paymentResponse.paymentMethod === "COD" ||
      paymentResponse.paymentGateway === "COD";
    const isPaymentCaptured =
      paymentResponse.paymentStatus === "SUCCESS" ||
      paymentResponse.status === "SUCCESS";

    if (!isPaymentCaptured || isCodOrder) {
      const infoMessage = isCodOrder
        ? "Order cancelled successfully. COD orders do not require refunds."
        : "Order cancelled successfully. Payment capture was pending, so no refund was needed.";

      return await cancelWithoutRefund(infoMessage);
    }

    // 3️⃣ Extract Cashfree order ID safely
    const cfOrderId =
      paymentResponse?.paymentResponse?.order?.order_id ||
      order.cf_order_id;

    if (!cfOrderId) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Cashfree order ID not found for refund",
      });
    }

    // 4️⃣ Generate refund ID and amount
    const refundId = `REFUND_${Date.now()}`;
    const refundAmount = order.summary?.grandTotal || 0;

    // 5️⃣ Call Cashfree Refund API
    const refundApiUrl = `${process.env.CF_CREATE_PRODUCT_URL}/${cfOrderId}/refunds`;

    let refundResponse = null;
    try {
      refundResponse = await axios.post(
        refundApiUrl,
        {
          refund_amount: refundAmount,
          refund_id: refundId,
        },
        {
          headers: {
            "x-api-version": "2023-08-01",
            "x-client-id": process.env.CF_CLIENT_ID,
            "x-client-secret": process.env.CF_CLIENT_SECRET,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (refundErr) {
      console.error("🚨 Cashfree refund API failed:", refundErr.message);
      return res.status(500).json({
        status: 500,
        success: false,
        message: `Cashfree refund failed: ${refundErr.message}`,
      });
    }

    // 6️⃣ Save refund details to Refund collection
    const newRefund = await new Refund({
      type: "LocalStore",
      cfOrderId,
      cfOrderResponseId: cfOrderId,
      refundResponse: refundResponse.data,
      userId: req.user._id,
      orderId: order._id,
      amount: refundAmount,
      refundId,
      cancelled: true,
    }).save();

    // 7️⃣ Update Payment record
    await Payment.findByIdAndUpdate(paymentResponse._id, {
      refund: true,
      refundId,
    });

    // 8️⃣ Update Order status
    await Order.findOneAndUpdate(
      { createdBy: req.user._id, _id: id },
      { status: "Cancelled", refund: true, refundId },
      { new: true, runValidators: true }
    );

    // 9️⃣ Final response
    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Order cancelled and refund initiated successfully",
      data: {
        refundId,
        refundAmount,
        cfOrderId,
        refundResponse: refundResponse.data,
      },
    });
  } catch (error) {
    console.error("❌ cancelOrder Error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
  }
};

export const orderList = async (req, res) => {
  try {
    const list = await Order.aggregate([
      {
        $match: {
          createdBy: new ObjectId(req.user._id),
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $addFields: {
          productDetails: {
            $ifNull: [{ $arrayElemAt: ["$productDetails", 0] }, null],
          },
        },
      },
    ]);

    res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: list });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("orderList", error, req, res);
  }
};

export const orderListV2 = async (req, res) => {
  try {
    let { skip, limit } = req.query;
    // Pagination defaults
    const page = skip ? Number(skip) : 1;
    const pageSize = limit ? Number(limit) : 10;

    const list = await Order.aggregate([
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(req.user._id),
          // Show all orders regardless of payment status
        },
      },
      {
        // Filter out failed/unpaid phantom orders
        $match: {
          $nor: [
            { paymentStatus: "FAILED" },
            { $and: [{ paymentStatus: "PENDING" }, { status: "Cancelled" }] },
          ],
        },
      },
      // Add stage to normalize storeId - convert invalid values to null to prevent ObjectId cast errors
      {
        $addFields: {
          normalizedStoreId: {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$storeId", null] },
                  { $ne: [{ $toString: "$storeId" }, ""] },
                  { $ne: [{ $toString: "$storeId" }, "0"] },
                  {
                    $or: [
                      { $eq: [{ $type: "$storeId" }, "objectId"] },
                      {
                        $and: [
                          { $eq: [{ $type: "$storeId" }, "string"] },
                          { $eq: [{ $strLenCP: { $toString: "$storeId" } }, 24] },
                          { $regexMatch: { input: { $toString: "$storeId" }, regex: /^[0-9a-fA-F]{24}$/ } }
                        ]
                      }
                    ]
                  }
                ]
              },
              then: {
                $cond: {
                  if: { $eq: [{ $type: "$storeId" }, "string"] },
                  then: { $toObjectId: "$storeId" },
                  else: "$storeId"
                }
              },
              else: null
            }
          }
        }
      },
      // Lookup for store details using normalized storeId - only matches valid ObjectIds
      {
        $lookup: {
          from: "stores",
          let: { storeId: "$normalizedStoreId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$$storeId", null] },
                    { $eq: ["$_id", "$$storeId"] }
                  ]
                }
              }
            }
          ],
          as: "storeDetails",
        },
      },
      {
        $unwind: {
          path: "$storeDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Unwind product details to process each product individually
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Normalize productId before lookup to prevent ObjectId cast errors
      {
        $addFields: {
          "productDetails.normalizedProductId": {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$productDetails.productId", null] },
                  { $ne: [{ $toString: "$productDetails.productId" }, ""] },
                  { $ne: [{ $toString: "$productDetails.productId" }, "0"] },
                  {
                    $or: [
                      { $eq: [{ $type: "$productDetails.productId" }, "objectId"] },
                      {
                        $and: [
                          { $eq: [{ $type: "$productDetails.productId" }, "string"] },
                          { $eq: [{ $strLenCP: { $toString: "$productDetails.productId" } }, 24] },
                          { $regexMatch: { input: { $toString: "$productDetails.productId" }, regex: /^[0-9a-fA-F]{24}$/ } }
                        ]
                      }
                    ]
                  }
                ]
              },
              then: {
                $cond: {
                  if: { $eq: [{ $type: "$productDetails.productId" }, "string"] },
                  then: { $toObjectId: "$productDetails.productId" },
                  else: "$productDetails.productId"
                }
              },
              else: null
            }
          }
        }
      },
      // Lookup for product details using normalized productId
      {
        $lookup: {
          from: "products",
          let: { productId: "$productDetails.normalizedProductId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$$productId", null] },
                    { $eq: ["$_id", "$$productId"] }
                  ]
                }
              }
            }
          ],
          as: "productInfo",
        },
      },
      {
        $unwind: {
          path: "$productInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Add additional fields including totalAmount for products
      {
        $addFields: {
          "productDetails.productName": {
            $ifNull: ["$productInfo.productName", null]
          },
          "productDetails.productImages": {
            $ifNull: ["$productInfo.productImages", []]
          },
          "productDetails.companyName": {
            $ifNull: ["$productInfo.companyName", null]
          },
          "productDetails.qty": {
            $ifNull: ["$productInfo.qty", null]
          },
          "productDetails.totalAmount": {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$productDetails", null] },
                  { $ne: ["$productDetails.productPrice", null] },
                  { $ne: ["$productDetails.quantity", null] }
                ]
              },
              then: {
                $multiply: [
                  "$productDetails.productPrice",
                  "$productDetails.quantity",
                ],
              },
              else: 0
            }
          },
        },
      },
      // Group by order to consolidate products per order and calculate total quantity and free quantity
      {
        $group: {
          _id: "$_id",
          storeDetails: { $first: "$storeDetails" },
          orderId: { $first: "$orderId" },
          status: { $first: "$status" },
          paymentStatus: { $first: "$paymentStatus" }, // Include payment status
          summary: { $first: "$summary" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          totalQuantity: { $sum: "$productDetails.quantity" },
          totalFreeQuantity: { $sum: "$productDetails.freeQuantity" },
          productDetails: { $push: "$productDetails" },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: (page - 1) * pageSize,
      },
      {
        $limit: pageSize,
      },
    ]);

    // Format response as per UI requirements
    const formattedResponse = list.map((order) => ({
      _id: order._id,
      storeId: order.storeDetails?._id || null,
      store: order.storeDetails ? {
        name: order.storeDetails.name || null,
        address: order.storeDetails.address || null,
        contact: order.storeDetails.contact || null,
      } : null,
      orderId: order.orderId,
      status: order.status,
      paymentStatus: order.paymentStatus || "PENDING", // Include payment status
      totalPrice: order.summary?.grandTotal || 0,
      discountAmount: order.summary?.discountAmount || 0,
      shippingFee: order.summary?.shippingFee || 0,
      createdAt: order.createdAt,
      totalQuantity: order.totalQuantity || 0, // ✅ Aggregated total quantity
      totalFreeQuantity: order.totalFreeQuantity || 0, // ✅ Aggregated total free quantity
      products: (order.productDetails || []).filter(p => p !== null && p !== undefined).map((product) => ({
        productName: product.productName || null,
        companyName: product.companyName || null,
        qty: product.qty || null,
        productImages: product.productImages || [],
        price: product.productPrice || 0,
        mrp: product.mrp || null,
        quantity: product.quantity || 0,
        freeQuantity: product.freeQuantity || 0,
        totalAmount: product.totalAmount || 0,
        appliedOffers: product.appliedOffers || [],
        status: order.status,
      })),
    }));

    res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: formattedResponse });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
  }
};

export const orderDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if order exists and belongs to user
    const order = await Order.findOne({
      _id: new ObjectId(id),
      createdBy: new ObjectId(req.user._id)
    });

    if (!order) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Order not found with this ID",
      });
    }

    const details = await Order.aggregate([
      {
        $match: {
          createdBy: new ObjectId(req.user._id),
          _id: new ObjectId(id),
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $addFields: {
          productDetails: {
            $ifNull: [{ $arrayElemAt: ["$productDetails", 0] }, null],
          },
        },
      },
      {
        $lookup: {
          from: "stores",
          localField: "productDetails.storeId",
          foreignField: "_id",
          as: "storeDetails",
        },
      },
      {
        $addFields: {
          storeDetails: {
            $ifNull: [{ $arrayElemAt: ["$storeDetails", 0] }, null],
          },
        },
      },
    ]);

    if (details.length > 0) {
      // Calculate enhanced summary fields for consistency
      const summary = details[0].summary || {};

      // For this simple version, use the existing productDetails structure
      const product = details[0].productDetails || {};
      const item_total = (product.sellingPrice || 0) * (product.quantity || 1);

      // Calculate additional fields based on existing summary data
      const total_discount = summary.discountAmount || 0;
      const shipping_fee = summary.shippingFee || 0;
      const grandTotal = summary.grandTotal || 0;

      // Calculate total_payable as grandTotal (the final amount user paid)
      const total_payable = grandTotal;

      // Calculate saved as the difference between total MRP and final price
      const total_mrp = (product.mrp || product.sellingPrice || 0) * (product.quantity || 1);
      const saved = total_mrp - grandTotal;

      // Calculate coupon discount separately if available in summary
      const coupon_discount = summary.couponCodeDiscount || summary.discountAmount || 0;

      // Plant a tree - this would be a fixed value or calculated based on your business logic
      const plant_a_tree = 0;

      const enhancedSummary = {
        ...summary,
        item_total,
        plant_a_tree,
        total_discount,
        coupon_discount,
        shipping_fee,
        total_payable,
        saved,
      };

      // Update the details with enhanced summary
      details[0].summary = enhancedSummary;
    }

    res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: details[0] || {} });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("orderDetails", error, req, res);
  }
};

export const orderDetailsV2 = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Validate order ID parameter
    if (!id) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Order ID is required",
      });
    }

    // 2️⃣ Try to find order by _id or alternate IDs (orderId / cf_order_id)
    let orderExists = null;
    const query = { $or: [{ orderId: id }, { cf_order_id: id }] };

    if (mongoose.Types.ObjectId.isValid(id)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(id) });
    }

    // First find matching order
    orderExists = await Order.findOne(query);

    if (!orderExists) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "Order not found with this ID",
      });
    }

    // Check authorization
    if (orderExists.createdBy.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        status: 404, // Return 404 to mask existence
        success: false,
        message: "Order not found with this ID",
      });
    }

    // 3️⃣ Run aggregation pipeline for full details
    const details = await Order.aggregate([
      {
        $match: {
          _id: orderExists._id
        },
      },
      {
        $lookup: {
          from: "stores",
          localField: "storeId",
          foreignField: "_id",
          as: "storeDetails",
        },
      },
      {
        $lookup: {
          from: "payments",
          localField: "_id",
          foreignField: "orderId",
          as: "paymentDetails",
          pipeline: [
            {
              $match: { type: "LocalStore" }
            },
            {
              $project: {
                paymentMethod: 1,
                paymentGateway: 1,
                paymentStatus: 1,
                status: 1,
                cf_order_id: 1
              }
            }
          ]
        },
      },
      { $unwind: { path: "$storeDetails", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$paymentDetails", preserveNullAndEmptyArrays: true } },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "productDetails.productId",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      {
        $unwind: {
          path: "$productInfo",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          "productDetails.productName": { $ifNull: ["$productInfo.productName", "Product Not Found"] },
          "productDetails.productImages": { $ifNull: ["$productInfo.productImages", []] },
          "productDetails.companyName": { $ifNull: ["$productInfo.companyName", ""] },
          "productDetails.mrp": { $ifNull: ["$productInfo.mrp", null] },
          "productDetails.deliverdTime": { $ifNull: ["$productInfo.deliverdTime", null] },
          "productDetails.estimatedDate": { $ifNull: ["$productInfo.estimatedDate", null] },
        },
      },
      {
        $group: {
          _id: "$_id",
          storeDetails: { $first: "$storeDetails" },
          paymentDetails: { $first: "$paymentDetails" },
          orderId: { $first: "$orderId" },
          cf_order_id: { $first: "$cf_order_id" },
          estimatedDate: { $first: "$estimatedDate" },
          status: { $first: "$status" },
          paymentStatus: { $first: "$paymentStatus" },
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
        status: 404,
        success: false,
        message: "Order details processing failed",
      });
    }

    // 4️⃣ Format the output with complete order details
    const orderDetail = details[0];
    const paymentInfo = orderDetail.paymentDetails || {};

    // Calculate enhanced summary fields according to standardized response structure
    const summary = orderDetail.summary || {};

    // Extract individual product prices to calculate item total
    const productsList = orderDetail.products || [];

    // Calculate item total from products if not in summary or if we want recalculation
    let item_total = summary.itemTotal;
    if (!item_total) {
      item_total = productsList.reduce((sum, product) => {
        const price = product.productPrice || 0;
        const qty = product.quantity || 1;
        return sum + (price * qty);
      }, 0);
    }

    // Calculate additional fields based on existing summary data
    const total_discount = summary.discountAmount || 0;
    const shipping_fee = summary.shippingFee || 0;
    const grandTotal = summary.grandTotal || 0;
    const donationAmount = summary.donate || 0;

    // Calculate total_payable as grandTotal (the final amount user paid)
    const total_payable = grandTotal;

    // Calculate saved as the difference between total MRP and final price
    let saved = summary.saved;
    if (saved === undefined) {
      const total_mrp = productsList.reduce((sum, p) => sum + ((p.mrp || p.productPrice || 0) * (p.quantity || 1)), 0);
      saved = Math.max(total_mrp - grandTotal, 0);
    }

    // Calculate coupon discount separately if available in summary
    // Assuming coupon discount is part of total discount
    const coupon_discount = summary.couponCodeDiscount || summary.discountAmount || 0;

    // Plant a tree - this would be a fixed value or calculated based on your business logic
    // For now, setting it to 0, but you can adjust based on your requirements
    const plant_a_tree = 0;

    const enhancedSummary = {
      ...summary,
      item_total: Number(item_total.toFixed(2)),
      plant_a_tree,
      total_discount: Number(total_discount.toFixed(2)),
      coupon_discount: Number(coupon_discount.toFixed(2)),
      shipping_fee: Number(shipping_fee.toFixed(2)),
      total_payable: Number(total_payable.toFixed(2)),
      saved: Number(saved.toFixed(2)),
      donationAmount: Number(donationAmount),
    };

    const formattedDetails = {
      _id: orderDetail._id,
      store: orderDetail.storeDetails
        ? {
          _id: orderDetail.storeDetails._id,
          name: orderDetail.storeDetails.name,
          address: orderDetail.storeDetails.address,
          contact: orderDetail.storeDetails.contact,
        }
        : null,
      orderId: orderDetail.orderId,
      cf_order_id: orderDetail.cf_order_id || paymentInfo.cf_order_id || null,
      estimatedDate: orderDetail.estimatedDate || null,
      status: orderDetail.status,
      paymentStatus: orderDetail.paymentStatus || paymentInfo.paymentStatus || paymentInfo.status || "PENDING",
      paymentMethod: paymentInfo.paymentMethod || paymentInfo.paymentGateway || null,
      totalPrice: orderDetail.summary?.grandTotal || 0,
      discountAmount: orderDetail.summary?.discountAmount || 0,
      shippingFee: orderDetail.summary?.shippingFee || 0,
      createdAt: orderDetail.createdAt,
      updatedAt: orderDetail.updatedAt,
      summary: enhancedSummary, // Use enhanced summary with standardized fields
      invoiceUrl: orderDetail.invoiceUrl || null,
      address: orderDetail.address,
      products: productsList.map((product) => ({
        productName: product.productName,
        companyName: product.companyName,
        qty: product.qty || null,
        deliverdTime: product.deliverdTime || null,
        estimatedDate: product.estimatedDate || null,
        productImages: product.productImages,
        price: product.productPrice,
        mrp: product.mrp || null,
        quantity: product.quantity,
        freeQuantity: product.freeQuantity || 0,
        totalAmount: (product.productPrice || 0) * (product.quantity || 1),
        appliedOffers: product.appliedOffers || [],
      })),
    };

    // 5️⃣ Send response with proper success status
    return res.status(200).json({
      status: 200,
      success: true,
      message: "Order details retrieved successfully",
      data: formattedDetails,
    });
  } catch (error) {
    console.error("Error in orderDetailsV2:", error.message);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      status: 500,
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export const generateOrderInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderType = "local" } = req.query; // "local" or "online"

    // Find order
    let order = null;
    if (orderType === "online") {
      if (mongoose.isValidObjectId(id)) {
        order = await OnlineOrder.findOne({
          _id: new mongoose.Types.ObjectId(id),
          createdBy: new mongoose.Types.ObjectId(req.user._id),
        });
      }
      if (!order) {
        order = await OnlineOrder.findOne({
          createdBy: new mongoose.Types.ObjectId(req.user._id),
          $or: [{ orderId: id }, { cf_order_id: id }],
        });
      }
    } else {
      if (mongoose.isValidObjectId(id)) {
        order = await Order.findOne({
          _id: new mongoose.Types.ObjectId(id),
          createdBy: new mongoose.Types.ObjectId(req.user._id),
        });
      }
      if (!order) {
        order = await Order.findOne({
          createdBy: new mongoose.Types.ObjectId(req.user._id),
          $or: [{ orderId: id }, { cf_order_id: id }],
        });
      }
    }

    if (!order) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "Order not found",
      });
    }

    // Check if order is delivered
    if (order.status !== "Delivered" && order.status !== "Delivered") {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Invoice can only be generated for delivered orders",
      });
    }

    // Check if invoice already exists
    if (order.invoiceUrl) {
      return res.status(200).json({
        status: 200,
        success: true,
        message: "Invoice already exists",
        data: { invoiceUrl: order.invoiceUrl },
      });
    }

    // Generate invoice
    let invoiceUrl;
    if (orderType === "online") {
      invoiceUrl = await generateOnlineInvoice(order._id);
    } else {
      invoiceUrl = await generateInvoice(order._id);
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Invoice generated successfully",
      data: { invoiceUrl },
    });
  } catch (error) {
    console.error("Error generating invoice:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: error.message || "Failed to generate invoice",
    });
  }
};

export const reOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { addressId, paymentType, coupon, donate } = req.body;

    // Find the original order
    let originalOrder = null;
    if (mongoose.isValidObjectId(id)) {
      originalOrder = await Order.findOne({
        _id: new mongoose.Types.ObjectId(id),
        createdBy: new mongoose.Types.ObjectId(req.user._id),
      });
    }
    if (!originalOrder) {
      originalOrder = await Order.findOne({
        createdBy: new mongoose.Types.ObjectId(req.user._id),
        $or: [{ orderId: id }, { cf_order_id: id }],
      });
    }

    if (!originalOrder) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "Original order not found",
      });
    }

    // Get address (use provided addressId or original order address)
    let address = null;
    if (addressId) {
      address = await Address.findOne({ _id: addressId, createdBy: req.user._id });
    }
    if (!address) {
      // Try to get any address of user
      address = await Address.findOne({ createdBy: req.user._id });
    }

    // If still no address, use original order address (but need to convert to Address format)
    if (!address && originalOrder.address) {
      // Create a temporary address object from order address
      address = {
        lat: originalOrder.address.lat || originalOrder.address.latitude || "0",
        long: originalOrder.address.long || originalOrder.address.longitude || "0",
        address_1: originalOrder.address.address_1 || originalOrder.address.addressLine || "",
        city: originalOrder.address.city || "",
        state: originalOrder.address.state || "",
        pincode: originalOrder.address.pincode || "",
        toObject: function () { return this; }
      };
    }

    if (!address) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Please add a delivery address",
      });
    }

    const store = await Store.findById(originalOrder.storeId);
    if (!store) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "Store not found",
      });
    }

    // Validate delivery distance
    const storeCoords = store?.location?.coordinates || [];
    const storeLat = typeof storeCoords[1] === "number" ? storeCoords[1] : null;
    const storeLong = typeof storeCoords[0] === "number" ? storeCoords[0] : null;
    const addressLat = Number(address.lat);
    const addressLong = Number(address.long);

    if (
      storeLat === null ||
      storeLong === null ||
      !Number.isFinite(addressLat) ||
      !Number.isFinite(addressLong)
    ) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Please select an address with a valid location to continue delivery",
      });
    }

    const deliveryDistanceKm = calculateDistanceKm(storeLat, storeLong, addressLat, addressLong);
    if (deliveryDistanceKm === null || deliveryDistanceKm > LOCAL_STORE_MAX_DISTANCE_KM) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: `Delivery address is outside the ${LOCAL_STORE_MAX_DISTANCE_KM} km store range. Please choose a nearby address.`,
        distanceKm: deliveryDistanceKm,
      });
    }

    // Add products from original order to cart
    const productDetails = originalOrder.productDetails || [];
    if (productDetails.length === 0) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Original order has no products to re-order",
      });
    }

    // Clear existing cart for this store
    await Cart.updateMany(
      { createdBy: req.user._id, storeId: originalOrder.storeId, deleted: false },
      { $set: { deleted: true } }
    );

    // Add products to cart
    const cartItems = [];
    for (const product of productDetails) {
      const productDoc = await Product.findById(product.productId);
      if (!productDoc || productDoc.deleted || productDoc.status !== "A") {
        continue; // Skip unavailable products
      }

      // Check stock
      const requestedQty = product.quantity || 1;
      if (productDoc.stock < requestedQty) {
        return res.status(400).json({
          status: 400,
          success: false,
          message: `${productDoc.productName} is out of stock. Available: ${productDoc.stock}`,
        });
      }

      const cartItem = new Cart({
        createdBy: req.user._id,
        storeId: originalOrder.storeId,
        productId: product.productId,
        quantity: requestedQty,
        sellingPrice: product.productPrice || productDoc.sellingPrice,
      });
      await cartItem.save();
      cartItems.push(cartItem);
    }

    if (cartItems.length === 0) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "No products available for re-order",
      });
    }

    // Now create order using createOrderV2 logic
    // We'll reuse the createOrderV2 function by calling it internally
    // But for simplicity, we'll create the order directly here
    const donateValue = Number(donate || 0);
    const validPaymentTypes = ["CARD", "WALLET", "BANK", "COD", "QR"];
    const finalPaymentType = (paymentType && validPaymentTypes.includes(paymentType.toUpperCase()))
      ? paymentType.toUpperCase()
      : "COD";

    // Calculate totals
    let storeTotal = 0;
    let storeDiscountAmount = 0;
    let storeShippingFee = 0;
    const productDetailsForOrder = [];

    for (const cartItem of cartItems) {
      const product = await Product.findById(cartItem.productId);
      if (!product) continue;

      const itemPrice = cartItem.sellingPrice || product.sellingPrice;
      const itemQty = cartItem.quantity;
      const itemTotal = itemPrice * itemQty;
      storeTotal += itemTotal;

      productDetailsForOrder.push({
        productId: product._id,
        mrp: product.mrp,
        productPrice: itemPrice,
        quantity: itemQty,
        freeQuantity: 0,
      });
    }

    // Apply coupon if provided
    let couponCodeDiscount = 0;
    if (coupon) {
      const couponDoc = await CouponCode.findOne({ code: coupon, deleted: false });
      if (couponDoc && couponDoc.status === "active") {
        // Apply coupon logic here
        couponCodeDiscount = 0; // Calculate based on coupon type
      }
    }

    const grandTotal = storeTotal - storeDiscountAmount - couponCodeDiscount + storeShippingFee + donateValue;

    // Create order
    const orderId = `ORD_${Date.now()}`;
    const newOrder = new Order({
      createdBy: req.user._id,
      storeId: originalOrder.storeId,
      orderId,
      paymentStatus: "PENDING",
      paymentType: finalPaymentType,
      address: address.toObject ? address.toObject() : address,
      summary: {
        totalAmount: storeTotal,
        discountAmount: storeDiscountAmount + couponCodeDiscount,
        shippingFee: storeShippingFee,
        donate: donateValue,
        grandTotal,
      },
      productDetails: productDetailsForOrder,
      status: "Pending",
      shiprocket: store?.shiprocket?.pickup_addresses ? {
        pickup_addresses: store.shiprocket.pickup_addresses || [],
        default_pickup_address: store.shiprocket.default_pickup_address || null
      } : {}
    });

    await newOrder.save();

    // Clear cart
    await Cart.updateMany(
      { createdBy: req.user._id, storeId: originalOrder.storeId, deleted: false },
      { $set: { deleted: true } }
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Order re-created successfully",
      data: {
        orderId: newOrder.orderId,
        _id: newOrder._id,
        grandTotal,
        paymentType: finalPaymentType,
      },
    });
  } catch (error) {
    console.error("Error in reOrder:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: error.message || "Failed to re-order",
    });
  }
};

export const retailerOrderList = async (req, res) => {
  try {
    const { recent, hightolow, lowtohigh, products } = req.query;

    let matchObj = {
      "productDetails.createdBy": new ObjectId(req.user._id),
      status: "Pending",
    };

    if (products != "0") {
      matchObj = {
        ...matchObj,
        quantity: {
          $gt: Number(products),
        },
      };
    }

    const pipeline = [
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $addFields: {
          productDetails: {
            $ifNull: [{ $arrayElemAt: ["$productDetails", 0] }, null],
          },
        },
      },
      {
        $match: matchObj,
      },
      {
        $project: {
          orderId: 1,
          createdAt: 1,
          quantity: 1,
          summary: 1,
          status: 1,
        },
      },
    ];

    if (recent == "1") {
      pipeline.push({
        $sort: {
          createdAt: -1,
        },
      });
    }

    if (hightolow == "1") {
      pipeline.push({
        "summary.grandTotal": -1,
      });
    } else if (lowtohigh == "1") {
      pipeline.push({
        "summary.grandTotal": 1,
      });
    }

    const pendingOrders = await Order.aggregate(pipeline);

    const ordersHistory = await Order.aggregate([
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $addFields: {
          productDetails: {
            $ifNull: [{ $arrayElemAt: ["$productDetails", 0] }, null],
          },
        },
      },
      {
        $match: {
          "productDetails.createdBy": new ObjectId(req.user._id),
          status: {
            $ne: "Pending",
          },
        },
      },
      {
        $project: {
          orderId: 1,
          createdAt: 1,
          quantity: 1,
          summary: 1,
          status: 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: { pendingOrders, ordersHistory },
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerOrderList", error, req, res);
  }
};

export const retailerPendingOrderList = async (req, res) => {
  try {
    const { recent, hightolow, lowtohigh, products } = req.query;

    // Retrieve the store linked to the retailer - use lean() for faster query
    const findStore = await Store.findOne({ createdBy: req.user._id }).lean();
    if (!findStore) {
      // Return empty instead of 404 to avoid blank UI
      return res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        data: [],
      });
    }

    // Match condition for pending orders specific to the retailer's store
    let matchObj = {
      storeId: new mongoose.Types.ObjectId(findStore._id),
      status: "Pending",
      // Show pending orders regardless of paymentStatus (include COD / unpaid)
      paymentStatus: { $ne: "FAILED" },
    };

    // Build sort object once (more efficient than multiple $sort stages)
    let sortObj = {};
    if (hightolow === "1") {
      sortObj.totalAmount = -1;
    } else if (lowtohigh === "1") {
      sortObj.totalAmount = 1;
    }
    if (recent === "1") {
      sortObj.createdAt = -1;
    } else if (!sortObj.totalAmount) {
      sortObj.createdAt = -1; // Default sort by newest
    }

    const pipeline = [
      {
        $match: matchObj, // Filter only pending orders of the store
      },
      {
        $project: {
          orderId: 1,
          createdAt: 1,
          status: 1,
          "summary.grandTotal": 1,
          productDetails: 1,
        },
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id",
          orderId: { $first: "$orderId" },
          createdAt: { $first: "$createdAt" },
          totalItems: {
            $sum: {
              $add: [
                { $ifNull: ["$productDetails.quantity", 0] },
                { $ifNull: ["$productDetails.freeQuantity", 0] },
              ],
            },
          },
          totalAmount: { $first: "$summary.grandTotal" },
          status: { $first: "$status" },
        },
      },
    ];

    // If 'products' query is present, filter orders based on the number of products
    if (products && products !== "0") {
      pipeline.push({
        $match: {
          totalItems: { $gte: Number(products) },
        },
      });
    }

    // Add single sort stage (more efficient)
    if (Object.keys(sortObj).length > 0) {
      pipeline.push({ $sort: sortObj });
    }

    // Execute the aggregation pipeline with allowDiskUse for better performance
    const pendingOrders = await Order.aggregate(pipeline).allowDiskUse(true);

    // Respond immediately with the pending orders
    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: pendingOrders,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerPendingOrderList", error, req, res);
  }
};

export const retailerOrderHistoryList = async (req, res) => {
  try {
    const { recent, hightolow, lowtohigh, products } = req.query;

    // Retrieve the store linked to the retailer - use lean() for faster query
    const findStore = await Store.findOne({ createdBy: req.user._id }).lean();
    if (!findStore) {
      return res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        data: [],
      });
    }

    // If store is not accepted yet, still return empty list to keep UI working
    if (findStore.status !== "A") {
      return res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        data: [],
      });
    }

    // Match condition for past orders (excluding pending)
    let matchObj = {
      storeId: new mongoose.Types.ObjectId(findStore._id),
      status: { $ne: "Pending" },
    };

    // Build sort object once (more efficient than multiple $sort stages)
    let sortObj = {};
    if (hightolow === "1") {
      sortObj.totalAmount = -1;
    } else if (lowtohigh === "1") {
      sortObj.totalAmount = 1;
    }
    if (recent === "1") {
      sortObj.createdAt = -1;
    } else if (!sortObj.totalAmount) {
      sortObj.createdAt = -1; // Default sort by newest
    }

    const pipeline = [
      {
        $match: matchObj, // Filter only non-pending orders
      },
      {
        $project: {
          orderId: 1,
          createdAt: 1,
          status: 1,
          "summary.grandTotal": 1,
          productDetails: 1,
        },
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id",
          orderId: { $first: "$orderId" },
          createdAt: { $first: "$createdAt" },
          totalItems: {
            $sum: {
              $add: [
                { $ifNull: ["$productDetails.quantity", 0] },
                { $ifNull: ["$productDetails.freeQuantity", 0] },
              ],
            },
          },
          totalAmount: { $first: "$summary.grandTotal" },
          status: { $first: "$status" },
        },
      },
    ];

    // If 'products' query is present, filter orders based on the number of products
    if (products && products !== "0") {
      pipeline.push({
        $match: {
          totalItems: { $gte: Number(products) },
        },
      });
    }

    // Add single sort stage (more efficient)
    if (Object.keys(sortObj).length > 0) {
      pipeline.push({ $sort: sortObj });
    }

    // Execute the aggregation pipeline with allowDiskUse for better performance
    const orderHistory = await Order.aggregate(pipeline).allowDiskUse(true);

    // Respond immediately with the order history
    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: orderHistory,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerOrderHistoryList", error, req, res);
  }
};

export const retailerOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const isOrder = await Order.findById(id);
    if (!isOrder) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Order not found",
      });
    }

    const orderDetails = await Order.aggregate([
      {
        $match: {
          _id: new ObjectId(id),
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $addFields: {
          productDetails: {
            $ifNull: [{ $arrayElemAt: ["$productDetails", 0] }, null],
          },
        },
      },
    ]);

    res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: orderDetails });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerOrderDetails", error, req, res);
  }
};

export const retailerOrderDetailsV2 = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the order exists and belongs to the logged-in retailer
    const isOrder = await Order.findById(id);
    if (!isOrder) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Order not found",
      });
    }

    // Retrieve the store linked to the retailer
    const findStore = await Store.findOne({ createdBy: req.user._id });
    if (!findStore) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    // Ensure the order belongs to the retailer's store
    if (isOrder.storeId.toString() !== findStore._id.toString()) {
      return res.status(status.Forbidden).json({
        status: jsonStatus.Forbidden,
        success: false,
        message: "Unauthorized: You cannot access this order",
      });
    }

    // Aggregation pipeline for order details
    const orderDetails = await Order.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id),
          storeId: new mongoose.Types.ObjectId(findStore._id),
        },
      },
      {
        $unwind: {
          path: "$productDetails", // Unwind productDetails array
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "products", // Lookup products collection
          localField: "productDetails.productId",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      {
        $unwind: {
          path: "$productInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          "productDetails.productName": "$productInfo.productName",
          "productDetails.mrp": "$productInfo.mrp",
          "productDetails.qty": "$productInfo.qty",
          "productDetails.offPer": "$productInfo.offPer",
          "productDetails.productImages": "$productInfo.productImages",
          "productDetails.companyName": "$productInfo.companyName",
          "productDetails.totalAmount": {
            $multiply: [
              "$productDetails.productPrice",
              "$productDetails.quantity",
            ],
          },
        },
      },
      {
        $addFields: {
          address: "$address", // Include the address field from the order document
        },
      },
      {
        $group: {
          _id: "$_id", // Group by order ID
          orderId: { $first: "$orderId" },
          createdAt: { $first: "$createdAt" },
          status: { $first: "$status" },
          summary: { $first: "$summary" },
          address: { $first: "$address" }, // Group the address field
          products: { $push: "$productDetails" }, // Reconstruct the productDetails array
        },
      },
    ]);

    if (!orderDetails.length) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Order details not found",
      });
    }

    const formattedOrderDetails = {
      _id: orderDetails[0]._id,
      orderId: orderDetails[0].orderId,
      status: orderDetails[0].status,
      totalPrice: orderDetails[0].summary.grandTotal,
      discountAmount: orderDetails[0].summary.discountAmount,
      shippingFee: orderDetails[0].summary.shippingFee,
      summary: orderDetails[0].summary,
      createdAt: orderDetails[0].createdAt,
      address: orderDetails[0].address,
      products: orderDetails[0].products.map((product) => ({
        productName: product.productName,
        mrp: product.mrp,
        qty: product.qty || null,
        offPer: product.offPer || null,
        companyName: product.companyName,
        productImages: product.productImages,
        price: product.productPrice,
        quantity: product.quantity,
        freeQuantity: product.freeQuantity, // ✅ Show free quantity for BOGO
        totalAmount: product.totalAmount,
        appliedOffers: product.appliedOffers || [], // ✅ Show applied offers per product
      })),
    };

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: formattedOrderDetails,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerOrderDetailsV2", error, req, res);
  }
};

export const retailerAssignedDeliveries = async (req, res) => {
  try {
    const { page = 1, limit: limitQuery = 10, status: statusQuery, search = "" } = req.query;

    const store = await Store.findOne({ createdBy: req.user._id }).lean();
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    const pageNumber = Number(page) > 0 ? Number(page) : 1;
    const pageSizeRaw = Number(limitQuery) > 0 ? Number(limitQuery) : 10;
    const pageSize = pageSizeRaw > 50 ? 50 : pageSizeRaw;
    const skip = (pageNumber - 1) * pageSize;

    const allowedStatuses = [
      "Pending",
      "Accepted",
      "Product shipped",
      "On the way",
      "Out for delivery",
      "Your Destination",
      "Delivered",
    ];

    const baseMatch = {
      storeId: store._id,
      paymentStatus: "SUCCESS",
    };

    const listMatch = {
      ...baseMatch,
      status: { $in: allowedStatuses },
    };

    if (statusQuery) {
      const requestedStatuses = statusQuery
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      if (requestedStatuses.length) {
        listMatch.status = { $in: requestedStatuses };
      }
    }

    if (search?.trim()) {
      const regex = new RegExp(search.trim(), "i");
      listMatch.$or = [{ orderId: regex }, { "address.name": regex }, { "address.number": regex }];
    }

    const [totalDeliveries, orders] = await Promise.all([
      Order.countDocuments(listMatch),
      Order.find(listMatch)
        .populate("assignedDeliveryBoy", "firstName lastName phone availabilityStatus currentLocation vehicleType totalDeliveries")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
    ]);

    const storeCoords = store?.location?.coordinates || [];
    const storeLat = typeof storeCoords[1] === "number" ? storeCoords[1] : null;
    const storeLng = typeof storeCoords[0] === "number" ? storeCoords[0] : null;

    const deliveries = orders.map((order) => {
      const customerLat = order.address?.lat !== undefined ? Number(order.address.lat) : null;
      const customerLng = order.address?.long !== undefined ? Number(order.address.long) : null;
      const hasCustomerCoords =
        typeof customerLat === "number" &&
        typeof customerLng === "number" &&
        !Number.isNaN(customerLat) &&
        !Number.isNaN(customerLng);

      const distanceKm =
        storeLat !== null && storeLng !== null && hasCustomerCoords
          ? calculateDistanceKm(storeLat, storeLng, customerLat, customerLng)
          : null;

      const deliveryBoy = order.assignedDeliveryBoy
        ? {
          id: order.assignedDeliveryBoy._id,
          name: [order.assignedDeliveryBoy.firstName, order.assignedDeliveryBoy.lastName].filter(Boolean).join(" ").trim(),
          phone: order.assignedDeliveryBoy.phone,
          availabilityStatus: order.assignedDeliveryBoy.availabilityStatus,
          vehicleType: order.assignedDeliveryBoy.vehicleType,
        }
        : null;

      const formattedAddress = [
        order.address?.flatHouse,
        order.address?.address_1,
        order.address?.city,
        order.address?.pincode,
      ]
        .filter(Boolean)
        .join(", ");

      return {
        orderMongoId: order._id,
        orderId: order.orderId,
        amount: order.summary?.grandTotal || order.summary?.totalAmount || 0,
        status: order.status,
        paymentStatus: order.paymentStatus,
        customerName: order.address?.name || "Customer",
        customerPhone: order.address?.number || null,
        address: formattedAddress,
        distanceKm,
        assignedDeliveryBoy: deliveryBoy,
        createdAt: order.createdAt,
        estimatedDate: order.estimatedDate,
      };
    });

    const [lifetimeStatsRaw] = await Order.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0],
            },
          },
          inProgress: {
            $sum: {
              $cond: [{ $in: ["$status", IN_PROGRESS_STATUSES] }, 1, 0],
            },
          },
        },
      },
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [todayStatsRaw] = await Order.aggregate([
      {
        $match: {
          ...baseMatch,
          createdAt: { $gte: todayStart, $lte: todayEnd },
        },
      },
      {
        $group: {
          _id: null,
          assigned: {
            $sum: {
              $cond: [{ $ifNull: ["$assignedDeliveryBoy", false] }, 1, 0],
            },
          },
          delivered: {
            $sum: {
              $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0],
            },
          },
          onTheWay: {
            $sum: {
              $cond: [{ $in: ["$status", ["Product shipped", "On the way", "Out for delivery", "Your Destination"]] }, 1, 0],
            },
          },
          earnings: {
            $sum: {
              $cond: [{ $eq: ["$status", "Delivered"] }, "$summary.grandTotal", 0],
            },
          },
        },
      },
    ]);

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: {
        summary: {
          lifetime: {
            totalDeliveries: lifetimeStatsRaw?.total || 0,
            completed: lifetimeStatsRaw?.completed || 0,
            inProgress: lifetimeStatsRaw?.inProgress || 0,
          },
          today: {
            assigned: todayStatsRaw?.assigned || 0,
            delivered: todayStatsRaw?.delivered || 0,
            onTheWay: todayStatsRaw?.onTheWay || 0,
            earnings: todayStatsRaw?.earnings || 0,
          },
        },
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total: totalDeliveries,
          totalPages: totalDeliveries ? Math.ceil(totalDeliveries / pageSize) : 0,
        },
        deliveries,
      },
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerAssignedDeliveries", error, req, res);
  }
};

export const retailerAvailableDeliveryBoys = async (req, res) => {
  try {
    const { status: availabilityStatus = "available", search = "", limit: limitQuery = 25 } = req.query;

    const pageSizeRaw = Number(limitQuery) > 0 ? Number(limitQuery) : 25;
    const pageSize = pageSizeRaw > 100 ? 100 : pageSizeRaw;

    const filters = {
      isDeleted: false,
      isActive: true,
    };

    if (availabilityStatus && availabilityStatus !== "all") {
      filters.availabilityStatus = availabilityStatus;
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filters.$or = [
        { firstName: regex },
        { lastName: regex },
        { phone: regex },
        { city: regex },
        { workCity: regex },
      ];
    }

    const deliveryBoys = await DeliveryBoy.find(filters)
      .sort({ availabilityStatus: 1, rating: -1 })
      .limit(pageSize)
      .select("firstName lastName phone city workCity availabilityStatus currentLocation totalDeliveries rating vehicleType walletBalance");

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: deliveryBoys.map((boy) => ({
        id: boy._id,
        name: [boy.firstName, boy.lastName].filter(Boolean).join(" ").trim(),
        phone: boy.phone,
        city: boy.city || boy.workCity || null,
        availabilityStatus: boy.availabilityStatus,
        location: boy.currentLocation,
        totalDeliveries: boy.totalDeliveries,
        rating: boy.rating,
        vehicleType: boy.vehicleType,
      })),
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerAvailableDeliveryBoys", error, req, res);
  }
};

export const retailerAssignOrderToDeliveryBoy = async (req, res) => {
  try {
    const { orderId, deliveryBoyId } = req.body;

    if (!orderId || !deliveryBoyId) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "orderId and deliveryBoyId are required",
      });
    }

    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    const order = await Order.findOne({ _id: orderId, storeId: store._id });
    if (!order) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Order not found",
      });
    }

    if (order.paymentStatus !== "SUCCESS") {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Order payment is not completed yet",
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy || deliveryBoy.isDeleted || deliveryBoy.isActive === false) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Delivery boy not found or inactive",
      });
    }

    if (
      order.assignedDeliveryBoy &&
      order.assignedDeliveryBoy.toString() !== deliveryBoyId.toString()
    ) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Order already assigned to another delivery boy",
      });
    }

    if (
      order.assignedDeliveryBoy &&
      order.assignedDeliveryBoy.toString() === deliveryBoyId.toString()
    ) {
      return res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        message: "Order is already assigned to this delivery boy",
        data: order,
      });
    }

    order.assignedDeliveryBoy = deliveryBoyId;
    if (order.status === "Pending") {
      order.status = "Accepted";
    }
    order.acceptedAt = order.acceptedAt || new Date();
    await order.save();

    deliveryBoy.availabilityStatus = "on_delivery";
    deliveryBoy.assignedOrders = deliveryBoy.assignedOrders || [];
    if (!deliveryBoy.assignedOrders.some((assignedOrderId) => assignedOrderId.toString() === order._id.toString())) {
      deliveryBoy.assignedOrders.push(order._id);
    }
    await deliveryBoy.save();

    const populatedOrder = await Order.findById(order._id)
      .populate("assignedDeliveryBoy", "firstName lastName phone availabilityStatus vehicleType")
      .lean();

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Order assigned successfully",
      data: populatedOrder,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerAssignOrderToDeliveryBoy", error, req, res);
  }
};

// Get Delivery Boy Management Dashboard Statistics
export const retailerDeliveryBoyDashboard = async (req, res) => {
  try {
    // Find the store belonging to the current retailer
    const findStore = await Store.findOne({ createdBy: req.user._id });
    if (!findStore) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    const storeId = findStore._id;

    // Get all delivery boys who have delivered orders for this store
    const deliveryBoysWithOrders = await Order.aggregate([
      {
        $match: {
          storeId: new ObjectId(storeId),
          assignedDeliveryBoy: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$assignedDeliveryBoy",
        },
      },
    ]);

    const deliveryBoyIds = deliveryBoysWithOrders.map((item) => item._id);

    // Count total delivery boys who have worked with this store
    const totalDeliveryBoys = await DeliveryBoy.countDocuments({
      _id: { $in: deliveryBoyIds },
      isDeleted: false,
      isActive: true,
    });

    // Get all delivery statistics
    const [deliveryStats, newOrdersData, pendingOrdersData] = await Promise.all([
      // Total deliveries and earnings
      Order.aggregate([
        {
          $match: {
            storeId: new ObjectId(storeId),
            paymentStatus: "SUCCESS",
            assignedDeliveryBoy: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            totalDeliveries: { $sum: 1 },
            totalEarnings: {
              $sum: {
                $cond: [{ $eq: ["$status", "Delivered"] }, "$summary.grandTotal", 0],
              },
            },
          },
        },
      ]),
      // New orders (Pending status, not yet assigned)
      Order.find({
        storeId: new ObjectId(storeId),
        status: "Pending",
        paymentStatus: "SUCCESS",
        $or: [
          { assignedDeliveryBoy: { $exists: false } },
          { assignedDeliveryBoy: null }
        ],
      })
        .populate("createdBy", "name phone")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      // Pending orders (assigned but not delivered)
      Order.find({
        storeId: new ObjectId(storeId),
        status: { $in: ["Pending", "Accepted", "Product shipped", "On the way", "Out for delivery", "Your Destination"] },
        paymentStatus: "SUCCESS",
      })
        .populate("assignedDeliveryBoy", "firstName lastName phone availabilityStatus")
        .populate("createdBy", "name phone")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    const totalDeliveries = deliveryStats[0]?.totalDeliveries || 0;
    const totalEarnings = deliveryStats[0]?.totalEarnings || 0;
    const newOrders = newOrdersData.length;
    const pendingOrders = pendingOrdersData.length;

    // Format new orders with assignment info
    const newOrdersFormatted = newOrdersData.map((order) => ({
      orderId: order.orderId,
      _id: order._id,
      status: order.status,
      totalAmount: order.summary?.grandTotal || 0,
      customerName: order.createdBy?.name || "N/A",
      customerPhone: order.createdBy?.phone || "N/A",
      createdAt: order.createdAt,
      assignedDeliveryBoy: null, // Not assigned yet
    }));

    // Format pending orders with assigned delivery boy info
    const pendingOrdersFormatted = pendingOrdersData.map((order) => ({
      orderId: order.orderId,
      _id: order._id,
      status: order.status,
      totalAmount: order.summary?.grandTotal || 0,
      customerName: order.createdBy?.name || "N/A",
      customerPhone: order.createdBy?.phone || "N/A",
      createdAt: order.createdAt,
      assignedDeliveryBoy: order.assignedDeliveryBoy
        ? {
          _id: order.assignedDeliveryBoy._id,
          name: [order.assignedDeliveryBoy.firstName, order.assignedDeliveryBoy.lastName]
            .filter(Boolean)
            .join(" ")
            .trim(),
          phone: order.assignedDeliveryBoy.phone,
          availabilityStatus: order.assignedDeliveryBoy.availabilityStatus,
        }
        : null,
    }));

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: {
        totalDeliveryBoys,
        totalDeliveries,
        totalEarnings,
        pendingOrders,
        newOrders,
        assignedOrders: pendingOrdersFormatted.filter((order) => order.assignedDeliveryBoy !== null),
        unassignedOrders: newOrdersFormatted,
      },
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerDeliveryBoyDashboard", error, req, res);
  }
};

export const retailerDeliveryBoyHistory = async (req, res) => {
  try {
    const { page = 1, limit: limitQuery = 10, deliveryBoyId, status: statusQuery = "Delivered" } = req.query;

    const store = await Store.findOne({ createdBy: req.user._id }).lean();
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    const pageNumber = Number(page) > 0 ? Number(page) : 1;
    const pageSizeRaw = Number(limitQuery) > 0 ? Number(limitQuery) : 10;
    const pageSize = pageSizeRaw > 50 ? 50 : pageSizeRaw;
    const skip = (pageNumber - 1) * pageSize;

    const baseMatch = {
      storeId: store._id,
      paymentStatus: "SUCCESS",
      assignedDeliveryBoy: { $exists: true, $ne: null },
    };

    if (deliveryBoyId && ObjectId.isValid(deliveryBoyId)) {
      baseMatch.assignedDeliveryBoy = new ObjectId(deliveryBoyId);
    }

    if (statusQuery) {
      baseMatch.status = statusQuery;
    }

    const [totalOrders, orders] = await Promise.all([
      Order.countDocuments(baseMatch),
      Order.find(baseMatch)
        .populate("assignedDeliveryBoy", "firstName lastName phone availabilityStatus vehicleType totalDeliveries rating")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
    ]);

    const deliveryHistory = orders.map((order) => {
      const deliveryBoy = order.assignedDeliveryBoy
        ? {
          id: order.assignedDeliveryBoy._id,
          name: [order.assignedDeliveryBoy.firstName, order.assignedDeliveryBoy.lastName]
            .filter(Boolean)
            .join(" ")
            .trim(),
          phone: order.assignedDeliveryBoy.phone,
          vehicleType: order.assignedDeliveryBoy.vehicleType,
          rating: order.assignedDeliveryBoy.rating,
          totalDeliveries: order.assignedDeliveryBoy.totalDeliveries,
        }
        : null;

      const formattedAddress = [
        order.address?.flatHouse,
        order.address?.address_1,
        order.address?.city,
        order.address?.pincode,
      ]
        .filter(Boolean)
        .join(", ");

      return {
        orderId: order.orderId,
        orderMongoId: order._id,
        amount: order.summary?.grandTotal || order.summary?.totalAmount || 0,
        status: order.status,
        deliveredAt: order.status === "Delivered" ? order.updatedAt : null,
        customerName: order.address?.name || "Customer",
        customerPhone: order.address?.number || null,
        address: formattedAddress,
        deliveryBoy,
        createdAt: order.createdAt,
      };
    });

    // Get delivery boys summary (grouped stats)
    const deliveryBoysSummary = await Order.aggregate([
      {
        $match: {
          storeId: new ObjectId(store._id),
          paymentStatus: "SUCCESS",
          assignedDeliveryBoy: { $exists: true, $ne: null },
          status: "Delivered",
        },
      },
      {
        $group: {
          _id: "$assignedDeliveryBoy",
          totalDeliveries: { $sum: 1 },
          totalEarnings: { $sum: "$summary.grandTotal" },
        },
      },
      {
        $lookup: {
          from: "deliveryboys",
          localField: "_id",
          foreignField: "_id",
          as: "deliveryBoyInfo",
        },
      },
      {
        $unwind: {
          path: "$deliveryBoyInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          deliveryBoyId: "$_id",
          name: {
            $concat: [
              { $ifNull: ["$deliveryBoyInfo.firstName", ""] },
              " ",
              { $ifNull: ["$deliveryBoyInfo.lastName", ""] },
            ],
          },
          phone: "$deliveryBoyInfo.phone",
          totalDeliveries: 1,
          totalEarnings: 1,
          averageRating: "$deliveryBoyInfo.rating",
        },
      },
      {
        $sort: { totalDeliveries: -1 },
      },
    ]);

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: {
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total: totalOrders,
          totalPages: totalOrders ? Math.ceil(totalOrders / pageSize) : 0,
        },
        deliveryHistory,
        deliveryBoysSummary: deliveryBoysSummary.map((item) => ({
          deliveryBoyId: item.deliveryBoyId,
          name: item.name.trim(),
          phone: item.phone,
          totalDeliveries: item.totalDeliveries,
          totalEarnings: item.totalEarnings,
          averageRating: item.averageRating,
        })),
      },
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("retailerDeliveryBoyHistory", error, req, res);
  }
};

export const orderChangeStatus = async (req, res) => {
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
      "Pending",
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

    const isOrder = await Order.findById(id);
    if (!isOrder) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Order not found",
      });
    }

    let changeOrderStatus = {};

    if (orderStatus === "Accepted") {
      changeOrderStatus = await Order.findByIdAndUpdate(
        id,
        { status: orderStatus, estimatedDate },
        { new: true, runValidators: true }
      );
    } else if (orderStatus === "Delivered") {
      changeOrderStatus = await Order.findByIdAndUpdate(
        id,
        { status: orderStatus, deliverdTime: new Date() },
        { new: true, runValidators: true }
      );
    } else if (orderStatus === "Rejected") {
      // refund
      const paymentResponse = await Payment.findOne({ orderId: id });

      const refundId = `REFUND_${Date.now()}`;
      const refund = await axios.post(
        `${process.env.CF_CREATE_PRODUCT_URL}/${paymentResponse.paymentResponse?.order?.order_id}/refunds`,
        {
          refund_amount: isOrder.summary.grandTotal,
          refund_id: refundId,
        },
        {
          headers: {
            "x-api-version": "2023-08-01",
            "x-client-id": process.env.CF_CLIENT_ID,
            "x-client-secret": process.env.CF_CLIENT_SECRET,
            "Content-Type": "application/json",
          },
        }
      );

      let newRefund = new Refund({
        type: "LocalStore",
        cfOrderId: isOrder.cf_order_id,
        cfOrderResponseId: paymentResponse.paymentResponse?.order?.order_id,
        refundResponse: refund.data,
        userId: req.user._id,
        orderId: isOrder._id,
        amount: isOrder.summary.grandTotal,
        refundId,
        rejected: true,
        retailerId: req.user._id,
      });
      newRefund = await newRefund.save();

      await Payment.findByIdAndUpdate(paymentResponse._id, {
        refund: true,
        refundId,
      });

      changeOrderStatus = await Order.findByIdAndUpdate(
        id,
        { status: orderStatus, refund: true, refundId },
        { new: true, runValidators: true }
      );
    } else {
      changeOrderStatus = await Order.findByIdAndUpdate(
        id,
        { status: orderStatus },
        { new: true, runValidators: true }
      );
    }

    // Send notification to retailer about order status change
    try {
      const { notifyOrderStatusChange } = await import('../helper/notificationHelper.js');
      const Store = (await import('../models/Store.js')).default;
      const store = await Store.findById(changeOrderStatus.storeId);
      if (store && store.createdBy) {
        await notifyOrderStatusChange(store.createdBy, changeOrderStatus, orderStatus);
      }
    } catch (notifError) {
      console.error('Error sending order status change notification:', notifError);
      // Continue even if notification fails
    }

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

export const createOrderWithShiprocket = async (req, res) => {
  try {
    const { coupon, addressId } = req.body;

    // Get user's carts
    const carts = await Cart.find({ createdBy: req.user._id, deleted: false });
    if (carts.length < 1) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Cart is empty",
      });
    }

    // Get delivery address
    const address = addressId
      ? await Address.findById(addressId)
      : await Address.findOne({ createdBy: req.user._id });

    if (!address) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please add delivery address",
      });
    }

    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate totals and group by store
    let overallTotalAmount = 0;
    const storeOrders = {};

    for (const cart of carts) {
      const product = await Product.findById(cart.productId).populate('storeId');
      if (!product || !product.storeId) continue;

      const storeId = product.storeId._id.toString();
      if (!storeOrders[storeId]) {
        storeOrders[storeId] = {
          store: product.storeId,
          items: [],
          totalAmount: 0,
          totalWeight: 0
        };
      }

      const itemTotal = product.sellingPrice * cart.quantity;
      const itemWeight = (product.weight || 0.5) * cart.quantity;

      storeOrders[storeId].items.push({
        productId: cart.productId,
        productName: product.productName,
        quantity: cart.quantity,
        sellingPrice: product.sellingPrice,
        totalAmount: itemTotal,
        weight: itemWeight,
        sku: product._id.toString()
      });

      storeOrders[storeId].totalAmount += itemTotal;
      storeOrders[storeId].totalWeight += itemWeight;
      overallTotalAmount += itemTotal;
    }

    // Apply coupon if provided
    let couponCodeDiscount = 0;
    if (coupon) {
      const couponCode = await CouponCode.findById(coupon);
      if (couponCode && !couponCode.deleted) {
        couponCodeDiscount = Math.min(couponCode.discountAmount, overallTotalAmount);
      }
    }

    const finalAmount = overallTotalAmount - couponCodeDiscount;

    // Create orders for each store
    const createdOrders = [];
    const shiprocketOrders = [];

    for (const [storeId, storeOrder] of Object.entries(storeOrders)) {
      // Check if store has pickup address configured
      if (!storeOrder.store.shiprocket?.pickup_address_id) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: `Store ${storeOrder.store.name} pickup address not configured. Please contact admin.`,
        });
      }

      // Create order in database
      const order = new Order({
        createdBy: req.user._id,
        storeId: storeOrder.store._id,
        orderId: `${orderId}_${storeId.substr(-4)}`,
        cf_order_id: `${orderId}_${storeId.substr(-4)}`,
        productDetails: storeOrder.items.map(item => ({
          productId: item.productId,
          mrp: item.sellingPrice,
          productPrice: item.sellingPrice,
          quantity: item.quantity,
          freeQuantity: 0
        })),
        address: {
          name: address.name,
          number: address.number,
          address_1: address.address_1,
          flatHouse: address.flatHouse,
          landmark: address.landmark,
          pincode: address.pincode,
          state: address.state,
          city: address.city,
          lat: address.lat,
          long: address.long,
          mapLink: address.mapLink,
          type: address.type
        },
        status: "Pending",
        paymentStatus: "PENDING",
        summary: {
          totalAmount: storeOrder.totalAmount,
          discountAmount: 0,
          shippingFee: 0,
          donate: 0,
          grandTotal: storeOrder.totalAmount
        },
        estimatedDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        shiprocket: storeOrder.store?.shiprocket?.pickup_addresses ? {
          pickup_addresses: storeOrder.store.shiprocket.pickup_addresses || [],
          default_pickup_address: storeOrder.store.shiprocket.default_pickup_address || null
        } : {}
      });

      const savedOrder = await order.save();
      createdOrders.push(savedOrder);

      // Send notification to retailer about new order
      try {
        const { notifyNewOrder } = await import('../helper/notificationHelper.js');
        if (storeOrder.store.createdBy) {
          await notifyNewOrder(storeOrder.store.createdBy, savedOrder);
        }
      } catch (notifError) {
        console.error('Error sending new order notification:', notifError);
        // Continue even if notification fails
      }

      // Prepare Shiprocket order payload
      const shiprocketPayload = {
        order_id: savedOrder.orderId,
        order_date: new Date().toISOString().split('T')[0],
        pickup_location: storeOrder.store.shiprocket.pickup_address_id,

        // Billing details
        billing_customer_name: `${req.user.firstName} ${req.user.lastName}`,
        billing_address: address.address_1,
        billing_address_2: address.flatHouse || '',
        billing_city: address.city,
        billing_pincode: address.pincode,
        billing_state: address.state,
        billing_email: req.user.email || `${req.user.phone}@orsolum.com`,
        billing_phone: req.user.phone,

        // Shipping details (same as billing)
        shipping_customer_name: `${req.user.firstName} ${req.user.lastName}`,
        shipping_address: address.address_1,
        shipping_address_2: address.flatHouse || '',
        shipping_city: address.city,
        shipping_pincode: address.pincode,
        shipping_state: address.state,
        shipping_email: req.user.email || `${req.user.phone}@orsolum.com`,
        shipping_phone: req.user.phone,

        // Payment details
        payment_method: "Prepaid", // Will be updated after payment
        sub_total: storeOrder.totalAmount,
        length: 15,
        breadth: 10,
        height: 5,
        weight: Math.max(storeOrder.totalWeight, 0.1),

        // Order items
        order_items: storeOrder.items.map(item => ({
          name: item.productName,
          sku: item.sku,
          units: item.quantity,
          selling_price: item.sellingPrice
        }))
      };

      shiprocketOrders.push({
        orderId: savedOrder._id,
        storeId: storeId,
        payload: shiprocketPayload
      });
    }

    // Process payments and create Shiprocket orders
    const paymentResults = [];
    const shiprocketResults = [];

    for (const shiprocketOrder of shiprocketOrders) {
      try {
        // Create Shiprocket order
        const shiprocketResponse = await ShiprocketService.createOrder(shiprocketOrder.payload);

        if (shiprocketResponse.data) {
          // Update order with Shiprocket details (preserve existing pickup_addresses)
          const existingOrder = await Order.findById(shiprocketOrder.orderId);
          await Order.findByIdAndUpdate(shiprocketOrder.orderId, {
            $set: {
              'shiprocket.shipment_id': shiprocketResponse.data.shipment_id,
              'shiprocket.awb': shiprocketResponse.data.awb_code,
              'shiprocket.status': 'created',
              'shiprocket.last_updated': new Date(),
              status: "Product shipped"
            }
          });

          shiprocketResults.push({
            orderId: shiprocketOrder.orderId,
            storeId: shiprocketOrder.storeId,
            success: true,
            shipment_id: shiprocketResponse.data.shipment_id,
            awb: shiprocketResponse.data.awb_code
          });
        }
      } catch (error) {
        console.error(`Shiprocket order creation failed for order ${shiprocketOrder.orderId}:`, error);
        shiprocketResults.push({
          orderId: shiprocketOrder.orderId,
          storeId: shiprocketOrder.storeId,
          success: false,
          error: error.message
        });
      }
    }

    // Clear user's cart
    await Cart.updateMany(
      { createdBy: req.user._id, deleted: false },
      { deleted: true }
    );

    // Update coupon usage if applied
    if (coupon && couponCodeDiscount > 0) {
      await CouponCode.findByIdAndUpdate(coupon, {
        $inc: { usageCount: 1 }
      });
    }

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Orders created successfully with Shiprocket integration",
      data: {
        orders: createdOrders,
        shiprocket_results: shiprocketResults,
        total_amount: finalAmount,
        coupon_discount: couponCodeDiscount,
        summary: {
          total_orders: createdOrders.length,
          successful_shiprocket: shiprocketResults.filter(r => r.success).length,
          failed_shiprocket: shiprocketResults.filter(r => !r.success).length
        }
      }
    });

  } catch (error) {
    console.error('Create order with Shiprocket error:', error);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
  }
};

// Process payment and update Shiprocket order
export const processPaymentAndUpdateShiprocket = async (req, res) => {
  try {
    const { orderIds, paymentMethod, paymentStatus } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Order IDs are required"
      });
    }

    const results = [];

    for (const orderId of orderIds) {
      try {
        const order = await Order.findOne({ orderId: orderId }).populate('storeId');
        if (!order) {
          results.push({
            orderId,
            success: false,
            error: "Order not found"
          });
          continue;
        }

        // Update payment status
        order.paymentStatus = paymentStatus;
        await order.save();

        // If payment successful and has Shiprocket shipment
        if (paymentStatus === "SUCCESS" && order.shiprocket?.shipment_id) {
          // Update Shiprocket order payment method
          const updatePayload = {
            payment_method: paymentMethod === "COD" ? "COD" : "Prepaid"
          };

          await ShiprocketService.updateOrder(order.orderId, updatePayload);

          // Request pickup if payment is successful
          if (paymentStatus === "SUCCESS") {
            await ShiprocketService.requestPickup({
              shipment_id: order.shiprocket.shipment_id
            });

            // Update order status
            order.status = "Product shipped";
            await order.save();
          }
        }

        results.push({
          orderId,
          success: true,
          paymentStatus,
          shiprocketUpdated: !!(order.shiprocket?.shipment_id)
        });

      } catch (error) {
        console.error(`Payment processing error for order ${orderId}:`, error);
        results.push({
          orderId,
          success: false,
          error: error.message
        });
      }
    }

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Payment processed successfully",
      data: {
        results,
        summary: {
          total: orderIds.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      }
    });

  } catch (error) {
    console.error('Process payment error:', error);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
  }
};

/**
 * Create Order by Retailer
 * Allows retailer to create orders for customers (walk-in, phone orders, etc.)
 */
export const retailerCreateOrder = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      address,
      products, // Array of { productId, quantity, freeQuantity? }
      coupon,
      donate = 0,
      paymentType = "COD",
      paymentStatus = "SUCCESS", // For retailer-created orders, usually COD or already paid
      estimatedDate,
      notes,
    } = req.body;

    // ✅ Validate required fields
    if (!customerName || !customerPhone) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Customer name and phone are required",
      });
    }

    if (!address || !address.address_1 || !address.pincode) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Complete address is required (address_1, pincode, city, state)",
      });
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "At least one product is required",
      });
    }

    // ✅ Get retailer's store
    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found. Please create a store first.",
      });
    }

    // ✅ Find or create customer user
    let customerUser = await User.findOne({ phone: customerPhone, role: "user" });
    if (!customerUser) {
      // Create a guest user for the customer
      customerUser = new User({
        name: customerName,
        phone: customerPhone,
        email: customerEmail || `${customerPhone}@guest.orsolum.com`,
        role: "user",
        state: address.state || "",
        city: address.city || "",
      });
      await customerUser.save();
    } else {
      // Update customer name if provided
      if (customerName && customerUser.name !== customerName) {
        customerUser.name = customerName;
        await customerUser.save();
      }
    }

    // ✅ Validate and process products
    let storeTotal = 0;
    let storeDiscountAmount = 0;
    const productDetails = [];
    const stockUpdates = [];

    const storeOffers = await StoreOffer.find({ storeId: store._id, deleted: false });

    for (const item of products) {
      const { productId, quantity, freeQuantity = 0 } = item;

      if (!productId || !quantity || quantity <= 0) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Invalid product data. Each product must have productId and quantity > 0",
        });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(status.NotFound).json({
          status: jsonStatus.NotFound,
          success: false,
          message: `Product with ID ${productId} not found`,
        });
      }

      // Verify product belongs to retailer's store
      if (product.storeId?.toString() !== store._id.toString()) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: `Product ${product.productName} does not belong to your store`,
        });
      }

      // Check stock
      const currentStock = typeof product.stock === "number" ? product.stock : null;
      if (currentStock !== null && quantity > currentStock) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: `Only ${currentStock} unit(s) of ${product.productName} available`,
        });
      }

      const productPrice = product.sellingPrice;
      const mrp = product.mrp || productPrice;
      let appliedOffers = [];
      let calculatedFreeQuantity = freeQuantity;

      // Apply store offers (BOGO, etc.)
      storeOffers.forEach((offer) => {
        if (
          offer.offerType === "buy_one_get_one" &&
          offer.selectedProducts.includes(productId.toString())
        ) {
          calculatedFreeQuantity = quantity;
          appliedOffers.push({
            type: "buy_one_get_one",
            description: offer.offer || "Buy 1 Get 1 Free",
          });
        }
      });

      storeTotal += productPrice * quantity;

      productDetails.push({
        productId: product._id,
        productPrice,
        mrp,
        quantity,
        freeQuantity: calculatedFreeQuantity,
        appliedOffers,
      });

      // Track stock updates
      if (currentStock !== null) {
        stockUpdates.push({
          productId: product._id,
          retailerId: product.createdBy,
          product,
          newStock: currentStock - quantity,
          lowStockThreshold:
            typeof product.lowStockThreshold === "number" ? product.lowStockThreshold : 0,
        });
      }
    }

    // ✅ Coupon Logic
    let couponCodeDiscount = 0;
    if (coupon) {
      const couponCode = await CouponCode.findById(coupon);
      if (!couponCode || couponCode.deleted) {
        return res.status(status.NotFound).json({
          status: jsonStatus.NotFound,
          success: false,
          message: "Coupon not found or deleted",
        });
      }

      const rawDiscount = (storeTotal * couponCode.discount) / 100;
      couponCodeDiscount = couponCode.upto
        ? Math.min(rawDiscount, couponCode.upto)
        : rawDiscount;
    }

    // ✅ Shipping Fee
    const storeShippingFee = storeTotal > 500 ? 0 : 50;

    // ✅ Grand Total
    const donateValue = Number(donate || 0);
    const grandTotal =
      storeTotal - storeDiscountAmount - couponCodeDiscount + storeShippingFee + donateValue;

    // ✅ Prepare address object
    const orderAddress = {
      name: customerName,
      number: customerPhone,
      flatHouse: address.flatHouse || "",
      address_1: address.address_1,
      city: address.city || "",
      state: address.state || "",
      pincode: address.pincode,
      landmark: address.landmark || "",
      lat: address.lat || "0",
      long: address.long || "0",
      mapLink: address.mapLink || "",
      type: address.type || "Home",
    };

    // ✅ Create order
    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const newOrder = new Order({
      createdBy: customerUser._id,
      storeId: store._id,
      orderId,
      paymentStatus: paymentStatus.toUpperCase(),
      paymentType: paymentType.toUpperCase(),
      address: orderAddress,
      summary: {
        totalAmount: storeTotal,
        discountAmount: storeDiscountAmount + couponCodeDiscount,
        shippingFee: storeShippingFee,
        donate: donateValue,
        grandTotal,
      },
      productDetails,
      status: "Pending",
      estimatedDate: estimatedDate ? new Date(estimatedDate) : null,
      deliveryNotes: notes || "",
      shiprocket: store?.shiprocket?.pickup_addresses
        ? {
          pickup_addresses: store.shiprocket.pickup_addresses || [],
          default_pickup_address: store.shiprocket.default_pickup_address || null,
        }
        : {},
    });

    await newOrder.save();

    // ✅ Update stock
    if (stockUpdates.length) {
      await Promise.all(
        stockUpdates.map(async (update) => {
          await Product.findByIdAndUpdate(
            update.productId,
            {
              $set: { stock: update.newStock, totalStock: update.newStock },
              updatedBy: update.retailerId,
            },
            { new: true }
          );

          if (
            update.product &&
            update.lowStockThreshold > 0 &&
            update.newStock <= update.lowStockThreshold
          ) {
            try {
              update.product.stock = update.newStock;
              await notifyLowStock(update.retailerId, update.product, update.newStock);
            } catch (notifyErr) {
              console.warn("Low stock notification failed:", notifyErr.message);
            }
          }
        })
      );
    }

    // ✅ Populate order details for response
    const populatedOrder = await Order.findById(newOrder._id)
      .populate("createdBy", "name phone email")
      .populate("storeId", "name phone address")
      .populate("productDetails.productId", "productName productImages sellingPrice mrp")
      .lean();

    return res.status(status.Created).json({
      status: jsonStatus.Created,
      success: true,
      message: "Order created successfully",
      data: {
        _id: newOrder._id,
        orderId: newOrder.orderId,
        status: newOrder.status,
        paymentStatus: newOrder.paymentStatus,
        customer: {
          name: customerUser.name,
          phone: customerUser.phone,
          email: customerUser.email,
        },
        address: orderAddress,
        summary: newOrder.summary,
        productDetails: productDetails.map((pd) => ({
          productId: pd.productId,
          quantity: pd.quantity,
          freeQuantity: pd.freeQuantity,
          productPrice: pd.productPrice,
          mrp: pd.mrp,
          appliedOffers: pd.appliedOffers,
        })),
        createdAt: newOrder.createdAt,
        estimatedDate: newOrder.estimatedDate,
      },
    });
  } catch (error) {
    console.error("Error in retailerCreateOrder:", error);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
  }
};


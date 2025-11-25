import { jsonStatus, messages, status } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";
import Cart from "../models/Cart.js";
import Store from "../models/Store.js";
import Product from "../models/Product.js";
import Address from "../models/Address.js";
import Order from "../models/Order.js";
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
import {
  handleLocalStoreOrderCallback,
  handleOnlineStoreOrderCallback,
  handlePremiumUserCallback,
} from "../helper/helper.js";
import Payment from "../models/Payment.js";
// import { image } from "pdfkit";


const { ObjectId } = mongoose.Types;

let limit = process.env.LIMIT;
limit = limit ? Number(limit) : 10;

const IN_PROGRESS_STATUSES = ["Accepted", "Product shipped", "On the way", "Your Destination"];

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
    const { coupon } = req.body;

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

    // 🎟️ Coupon logic (unchanged)
    let couponCodeDiscount = 0;
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

      if (couponCode.minPrice && overallTotalAmount < couponCode.minPrice) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ${couponCode.minPrice} required`,
        });
      }

      const rawDiscount = (overallTotalAmount * couponCode.discount) / 100;
      couponCodeDiscount = couponCode.upto
        ? Math.min(rawDiscount, couponCode.upto)
        : rawDiscount;
    }

    const totalCartItems = cartDetails.length;
    const discountPerItem = couponCodeDiscount / totalCartItems;

    // 🧾 Create orders
    await Promise.all(
      cartDetails.map(async (item) => {
        const itemDiscount = discountPerItem;
        const grandTotal = item.totalAmount - itemDiscount;

        const summary = {
          totalAmount: item.totalAmount,
          shippingFee: 0,
          coupon: itemDiscount,
          grandTotal,
        };

        const newOrder = new Order({
          address,
          createdBy: req.user._id,
          productId: item.productId,
          quantity: item.quantity,
          productPrice: item.sellingPrice,
          summary,
          orderId,
        });

        await newOrder.save();

        // 🚀 Create Shiprocket order automatically
        try {
          const store = await Store.findById(item.storeId);
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
              newOrder.shiprocket = {
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

    if (coupon) {
      await new CouponHistory({ couponId: coupon, userId: req.user._id }).save();
    }

    await Cart.updateMany({ createdBy: req.user._id }, { $set: { deleted: true } });

    res.status(200).json({
      success: true,
      message: "Order created successfully & synced with Shiprocket",
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

    const productDetails = await Product.findById(productId);
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

    const findProductInCart = await Cart.findOne({
      createdBy: req.user._id,
      productId,
      storeId,
      deleted: false,
    });
    if (findProductInCart) {
      findProductInCart.quantity = quantity
        ? findProductInCart.quantity + quantity
        : findProductInCart.quantity + 1;
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
        message: "Product added in to the Cart",
        count: findProductInCart.quantity,
        totalCartCount,
      });
    } else {
      let newCart = new Cart({
        productId,
        storeId,
        createdBy: req.user._id,
        quantity: quantity || 1,
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

    const findCart = await Cart.findOne({
      productId: id,
      createdBy: req.user._id,
      deleted: false,
    });
    if (!findCart) {
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
        message: "Quantity incremented",
        count: newCart.quantity,
        totalCartCount,
      });
    } else {
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
        message: "Quantity incremented",
        count: findCart.quantity,
        totalCartCount,
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

    const findStore = await Store.findById(id);
    if (!findStore) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    const list = await Store.aggregate([
      {
        $match: {
          _id: new ObjectId(id),
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
                      createdBy: new ObjectId(req.user._id),
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
          ],
        },
      },
      {
        $match: {
          productList: { $ne: [] },
        },
      },
    ]);

    const address = await Address.findOne({ createdBy: req.user._id });

    let overallTotalAmount = 0;
    let overallShippingFee = 0;
    let overallGrandTotal = 0;
    let overallDiscountAmount = 0;
    let appliedOffers = []; // Store applied offers

    // Fetch store offers
    const storeOffers = await StoreOffer.find({ storeId: id, deleted: false });

    const enhancedList = list.map((store) => {
      let storeTotalAmount = 0;
      let storeDiscountAmount = 0;
      let storeAppliedOffers = []; // Track applied offers at store level
      let storeBOGOProducts = new Set();

      store.productList = store.productList.map((product) => {
        let productTotal = 0;
        let productDiscount = 0;
        let appliedProductOffers = [];
        let freeQuantity = 0;

        // product.cartDetails.forEach(cart => {
        //     // ✅ Fix: Calculate product total correctly
        productTotal += product.sellingPrice * product.cartDetails.quantity;
        // });

        storeTotalAmount += productTotal; // ✅ Fix: Ensure total is accumulated

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
            // product.cartDetails.forEach(cart => {
            storeBOGOProducts.add(product._id.toString());
            freeQuantity = product.cartDetails.quantity; // ✅ Add same quantity as free
            // });
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
        };
      });

      const storeShippingFee = storeTotalAmount > 500 ? 0 : 50; // Example shipping logic
      const storeGrandTotal =
        storeTotalAmount - storeDiscountAmount + storeShippingFee;

      overallTotalAmount += storeTotalAmount;
      overallDiscountAmount += storeDiscountAmount;
      overallShippingFee += storeShippingFee;
      overallGrandTotal += storeGrandTotal;

      appliedOffers.push(...storeAppliedOffers);

      return {
        ...store,
        totalAmount: storeTotalAmount,
        discountAmount: storeDiscountAmount,
        grandTotal: storeGrandTotal,
        bogoProducts: Array.from(storeBOGOProducts),
        appliedOffers: storeAppliedOffers,
      };
    });

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

      overallGrandTotal =
        overallTotalAmount -
        overallDiscountAmount -
        couponCodeDiscount +
        overallShippingFee;
    }

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

    overallGrandTotal += donate;

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
        couponCodeDiscount,
        appliedOffers,
        similarProducts,
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
    let couponCodeDiscount = 0;
    if (req.query.coupon) {
      const couponCode = await CouponCode.findById(req.query.coupon);

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
    const { address_1, flatHouse, name, pincode, mapLink, lat, long } =
      req.body;

    if (
      !address_1 ||
      !flatHouse ||
      !name ||
      !pincode ||
      !flatHouse ||
      !lat ||
      !long ||
      !mapLink
    ) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Please enter details`,
      });
    }

    let newAddress = new Address({
      ...req.body,
      number: req.user.phone,
      createdBy: req.user._id,
    });
    newAddress = await newAddress.save();

    return res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: newAddress });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("createAddress", error, req, res);
  }
};

export const editAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({ _id: id, createdBy: req.user._id });
    if (!address) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Address not found",
      });
    }

    const updateAddress = await Address.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    return res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: updateAddress });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("editAddress", error, req, res);
  }
};

export const getAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({ createdBy: req.user._id, _id: id });

    return res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: address || {} });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("getAddress", error, req, res);
  }
};

export const getUserAllAddress = async (req, res) => {
  try {
    const address = await Address.find({ createdBy: req.user._id });

    return res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: address || [] });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("getUserAllAddress", error, req, res);
  }
};

export const getAllAddress = async (req, res) => {
  try {
    const address = await Address.find();

    return res
      .status(status.OK)
      .json({ status: jsonStatus.OK, success: true, data: address || [] });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("getAllAddress", error, req, res);
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

    // ✅ Calculate totals
    let storeTotal = 0;
    let storeDiscountAmount = 0;
    let productDetails = [];

    const storeOffers = await StoreOffer.find({ storeId, deleted: false });

    carts.forEach((cart) => {
      const productPrice = cart.productId.sellingPrice;
      const mrp = cart.productId.mrp;
      const quantity = cart.quantity;
      let freeQuantity = 0;
      let appliedOffers = [];

      storeOffers.forEach((offer) => {
        if (offer.offerType === "buy_one_get_one" && offer.selectedProducts.includes(cart.productId._id.toString())) {
          freeQuantity = quantity;
          appliedOffers.push({
            type: "buy_one_get_one",
            description: "Buy 1 Get 1 Free",
          });
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
      });
    });

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
    const grandTotal =
      storeTotal - storeDiscountAmount - couponCodeDiscount + storeShippingFee + donateValue;

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

    const headers = {
      "x-api-version": process.env.CF_API_VERSION,
      "x-client-id": process.env.CF_CLIENT_ID,
      "x-client-secret": process.env.CF_CLIENT_SECRET,
      "Content-Type": "application/json",
    };

    const cashFreeSession = await axios.post(
      process.env.CF_CREATE_PRODUCT_URL,
      paymentRequestData,
      { headers }
    );

    const cf_order_id = cashFreeSession.data.order_id;
    const paymentSessionId = cashFreeSession.data.payment_session_id;

    // ✅ Save the Order in MongoDB before sending response
    const newOrder = new Order({
      createdBy: req.user._id,
      storeId,
      orderId: `ORD_${Date.now()}`,
      cf_order_id,
      paymentSessionId,
      paymentStatus: "PENDING",
      paymentType: paymentType || "CARD",
      address,
      summary: {
        totalAmount: storeTotal,
        discountAmount: storeDiscountAmount + couponCodeDiscount,
        shippingFee: storeShippingFee,
        donate,
        grandTotal,
      },
      productDetails,
      status: "Pending",
    });

    await newOrder.save();

    // ✅ Respond with the actual Mongo ID
    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Order created successfully",
      data: {
        _id: newOrder._id, // ✅ Real ID now
        paymentSessionId,
        cf_order_id,
      },
    });
  } catch (error) {
    console.error("Error in createOrderV2:", error);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
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
    let { skip } = req.query;
    skip = skip ? skip : 1;

    const list = await Order.aggregate([
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(req.user._id),
        },
      },
      // Lookup for store details
      {
        $lookup: {
          from: "stores",
          localField: "storeId",
          foreignField: "_id",
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
      // Lookup for product details
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
          preserveNullAndEmptyArrays: true,
        },
      },
      // Add additional fields including totalAmount for products
      {
        $addFields: {
          "productDetails.productName": "$productInfo.productName",
          "productDetails.productImages": "$productInfo.productImages",
          "productDetails.companyName": "$productInfo.companyName",
          "productDetails.qty": "$productInfo.qty",
          "productDetails.totalAmount": {
            $multiply: [
              "$productDetails.productPrice",
              "$productDetails.quantity",
            ],
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
        $skip: (skip - 1) * limit,
      },
      {
        $limit: limit,
      },
    ]);

    // Format response as per UI requirements
    const formattedResponse = list.map((order) => ({
      _id: order._id,
      storeId: order.storeDetails._id,
      store: {
        name: order.storeDetails.name,
        address: order.storeDetails.address,
        contact: order.storeDetails.contact,
      },
      orderId: order.orderId,
      status: order.status,
      totalPrice: order.summary.grandTotal,
      discountAmount: order.summary.discountAmount,
      shippingFee: order.summary.shippingFee,
      createdAt: order.createdAt,
      totalQuantity: order.totalQuantity, // ✅ Aggregated total quantity
      totalFreeQuantity: order.totalFreeQuantity, // ✅ Aggregated total free quantity
      products: order.productDetails.map((product) => ({
        productName: product.productName,
        companyName: product.companyName,
        qty: product.qty || null,
        productImages: product.productImages,
        price: product.productPrice,
        mrp: product.mrp || null,
        quantity: product.quantity,
        freeQuantity: product.freeQuantity,
        totalAmount: product.totalAmount,
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

    const order = await Order.findById(id);
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

    // 1️⃣ Try to find order by _id or alternate IDs (orderId / cf_order_id)
    let orderExists = null;

    if (mongoose.isValidObjectId(id)) {
      orderExists = await Order.findOne({
        _id: new mongoose.Types.ObjectId(id),
        createdBy: new mongoose.Types.ObjectId(req.user._id),
      });
    }

    if (!orderExists) {
      orderExists = await Order.findOne({
        createdBy: new mongoose.Types.ObjectId(req.user._id),
        $or: [{ orderId: id }, { cf_order_id: id }],
      });
    }

    // 2️⃣ If no order found, return clean message
    if (!orderExists) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "Order not found with this ID",
      });
    }

    // 3️⃣ Run aggregation pipeline for full details
    const details = await Order.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(orderExists._id),
          createdBy: new mongoose.Types.ObjectId(req.user._id),
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
      { $unwind: { path: "$storeDetails", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "products",
          localField: "productDetails.productId",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          "productDetails.productName": "$productInfo.productName",
          "productDetails.productImages": "$productInfo.productImages",
          "productDetails.companyName": "$productInfo.companyName",
          "productDetails.qty": "$productInfo.qty",
          "productDetails.deliverdTime": "$productInfo.deliverdTime",
          "productDetails.estimatedDate": "$productInfo.estimatedDate",
          "productDetails.totalAmount": {
            $multiply: [
              "$productDetails.productPrice",
              "$productDetails.quantity",
            ],
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          storeDetails: { $first: "$storeDetails" },
          orderId: { $first: "$orderId" },
          cf_order_id: { $first: "$cf_order_id" },
          estimatedDate: { $first: "$estimatedDate" },
          status: { $first: "$status" },
          summary: { $first: "$summary" },
          invoiceUrl: { $first: "$invoiceUrl" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          address: { $first: "$address" },
          products: { $push: "$productDetails" },
        },
      },
    ]);

    if (!details.length) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "Order details not found",
      });
    }

    // 4️⃣ Format the output
    const formattedDetails = {
      _id: details[0]._id,
      store: details[0].storeDetails
        ? {
          _id: details[0].storeDetails._id,
          name: details[0].storeDetails.name,
          address: details[0].storeDetails.address,
          contact: details[0].storeDetails.contact,
        }
        : null,
      orderId: details[0].orderId,
      cf_order_id: details[0].cf_order_id,
      estimatedDate: details[0].estimatedDate || null,
      status: details[0].status,
      totalPrice: details[0].summary?.grandTotal || 0,
      discountAmount: details[0].summary?.discountAmount || 0,
      shippingFee: details[0].summary?.shippingFee || 0,
      createdAt: details[0].createdAt,
      updatedAt: details[0].updatedAt,
      summary: details[0].summary,
      invoiceUrl: details[0].invoiceUrl || null,
      address: details[0].address,
      products: details[0].products.map((product) => ({
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
        totalAmount: product.totalAmount,
        appliedOffers: product.appliedOffers || [],
      })),
    };

    // 5️⃣ Send response
    return res.status(200).json({
      status: 200,
      success: true,
      data: formattedDetails,
    });
  } catch (error) {
    console.error("Error in orderDetailsV2:", error.message);
    return res.status(500).json({
      status: 500,
      success: false,
      message: error.message,
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

    // Retrieve the store linked to the retailer
    const findStore = await Store.findOne({ createdBy: req.user._id });
    if (!findStore) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    // Match condition for pending orders specific to the retailer's store
    let matchObj = {
      storeId: new mongoose.Types.ObjectId(findStore._id),
      status: "Pending",
      paymentStatus: "SUCCESS",
    };

    const pipeline = [
      {
        $match: matchObj, // Filter only pending orders of the store
      },
      {
        $unwind: {
          path: "$productDetails", // Unwind productDetails array
          preserveNullAndEmptyArrays: true,
        },
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
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id", // Group by order document's _id
          orderId: { $first: "$orderId" }, // Order ID
          createdAt: { $first: "$createdAt" }, // Created At
          totalItems: {
            $sum: {
              $add: [
                "$productDetails.quantity",
                "$productDetails.freeQuantity",
              ],
            },
          }, // ✅ Fix: Correctly counts both purchased and free BOGO items
          totalAmount: { $first: "$summary.grandTotal" }, // ✅ Use grandTotal for total order amount
          status: { $first: "$status" }, // Status
        },
      },
    ];

    // If 'products' query is present, filter orders based on the number of products in the order
    if (products && products !== "0") {
      pipeline.push({
        $match: {
          totalItems: { $gte: Number(products) }, // ✅ Filter by correct product quantity (including free items)
        },
      });
    }

    // Add sorting based on query parameters
    if (recent === "1") {
      pipeline.push({
        $sort: { createdAt: -1 }, // ✅ Sort by newest orders first
      });
    }

    if (hightolow === "1") {
      pipeline.push({
        $sort: { totalAmount: -1 }, // ✅ Sort by total amount (high to low)
      });
    } else if (lowtohigh === "1") {
      pipeline.push({
        $sort: { totalAmount: 1 }, // ✅ Sort by total amount (low to high)
      });
    }

    // Execute the aggregation pipeline
    const pendingOrders = await Order.aggregate(pipeline);

    // Respond with the pending orders
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

    // Retrieve the store linked to the retailer
    const findStore = await Store.findOne({ createdBy: req.user._id });
    if (!findStore) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found",
      });
    }

    // Match condition for past orders (excluding pending)
    let matchObj = {
      storeId: new mongoose.Types.ObjectId(findStore._id),
      status: { $ne: "Pending" },
    };

    const pipeline = [
      {
        $match: matchObj, // Filter only non-pending orders
      },
      {
        $unwind: {
          path: "$productDetails", // Unwind productDetails array
          preserveNullAndEmptyArrays: true,
        },
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
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id", // Group by order document's _id
          orderId: { $first: "$orderId" }, // Order ID
          createdAt: { $first: "$createdAt" }, // Created At
          totalItems: {
            $sum: {
              $add: [
                "$productDetails.quantity",
                "$productDetails.freeQuantity",
              ],
            },
          }, // ✅ Fix: Correctly count both purchased and free BOGO items
          totalAmount: { $first: "$summary.grandTotal" }, // ✅ Use grandTotal for accurate total order amount
          status: { $first: "$status" }, // Status
        },
      },
    ];

    // If 'products' query is present, filter orders based on the number of products in the order
    if (products && products !== "0") {
      pipeline.push({
        $match: {
          totalItems: { $gte: Number(products) }, // ✅ Filter by correct product quantity (including free items)
        },
      });
    }

    // Add sorting based on query parameters
    if (recent === "1") {
      pipeline.push({
        $sort: { createdAt: -1 }, // ✅ Sort by newest orders first
      });
    }

    if (hightolow === "1") {
      pipeline.push({
        $sort: { totalAmount: -1 }, // ✅ Sort by total amount (high to low)
      });
    } else if (lowtohigh === "1") {
      pipeline.push({
        $sort: { totalAmount: 1 }, // ✅ Sort by total amount (low to high)
      });
    }

    // Execute the aggregation pipeline
    const orderHistory = await Order.aggregate(pipeline);

    // Respond with the order history
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
              $cond: [{ $in: ["$status", ["Product shipped", "On the way", "Your Destination"]] }, 1, 0],
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
        estimatedDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
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
          // Update order with Shiprocket details
          await Order.findByIdAndUpdate(shiprocketOrder.orderId, {
            shiprocket: {
              shipment_id: shiprocketResponse.data.shipment_id,
              awb: shiprocketResponse.data.awb_code,
              status: 'created',
              last_updated: new Date()
            },
            status: "Product shipped"
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


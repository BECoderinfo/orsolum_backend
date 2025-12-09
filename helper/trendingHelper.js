import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Store from "../models/Store.js";

const { ObjectId } = mongoose.Types;

const formatProductMedia = (productDoc = {}) => {
  const imagesArray = Array.isArray(productDoc.productImages)
    ? productDoc.productImages.filter(Boolean)
    : [];
  const primaryImage = productDoc.primaryImage || imagesArray[0] || null;

  return {
    ...productDoc,
    primaryImage,
    productImages: imagesArray,
  };
};

const sanitizeStoreIds = (storeIds = []) =>
  (Array.isArray(storeIds) ? storeIds : [])
    .map((id) => {
      if (!id) return null;
      if (id instanceof ObjectId) return id;
      try {
        return new ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

export const fetchTrendingProducts = async ({
  storeIds = [],
  limit = 8,
} = {}) => {
  const storeObjectIds = sanitizeStoreIds(storeIds);

  const matchStage = {
    status: { $nin: ["Cancelled"] },
    paymentStatus: { $ne: "FAILED" },
    "productDetails.productId": { $exists: true, $ne: null },
  };

  if (storeObjectIds.length) {
    matchStage.storeId = { $in: storeObjectIds };
  }

  const pipeline = [
    { $match: matchStage },
    { $unwind: "$productDetails" },
    {
      $group: {
        _id: "$productDetails.productId",
        storeId: { $first: "$storeId" },
        orderCount: { $sum: 1 },
        totalQuantity: {
          $sum: {
            $add: [
              "$productDetails.quantity",
              { $ifNull: ["$productDetails.freeQuantity", 0] },
            ],
          },
        },
        totalRevenue: {
          $sum: {
            $multiply: [
              "$productDetails.productPrice",
              "$productDetails.quantity",
            ],
          },
        },
      },
    },
    { $sort: { orderCount: -1, totalQuantity: -1, totalRevenue: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $match: {
        "product.deleted": false,
        "product.status": "A",
      },
    },
    {
      $lookup: {
        from: "stores",
        localField: "product.storeId",
        foreignField: "_id",
        as: "store",
      },
    },
    {
      $unwind: {
        path: "$store",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        productId: "$product._id",
        productName: "$product.productName",
        sellingPrice: "$product.sellingPrice",
        mrp: "$product.mrp",
        primaryImage: "$product.primaryImage",
        productImages: "$product.productImages",
        companyName: "$product.companyName",
        orderCount: 1,
        totalQuantity: 1,
        totalRevenue: 1,
        store: {
          _id: "$store._id",
          name: "$store.name",
          address: "$store.address",
        },
      },
    },
  ];

  let trending = await Order.aggregate(pipeline);

  trending = trending.map((entry) => {
    const formatted = formatProductMedia(entry);
    return {
      ...entry,
      primaryImage: formatted.primaryImage,
      productImages: formatted.productImages,
    };
  });

  if (trending.length) {
    return trending;
  }

  // Fallback: show latest active products if no completed orders yet
  const fallbackQuery = { deleted: false, status: "A" };
  if (storeObjectIds.length) {
    fallbackQuery.storeId = { $in: storeObjectIds };
  }

  const fallbackProducts = await Product.find(fallbackQuery)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (!fallbackProducts.length) {
    return [];
  }

  const fallbackStoreIds = [
    ...new Set(
      fallbackProducts
        .map((product) => product.storeId?.toString())
        .filter(Boolean)
    ),
  ];

  const storeDocs = await Store.find({ _id: { $in: fallbackStoreIds } })
    .select("name address")
    .lean();
  const storeMap = new Map(
    storeDocs.map((store) => [store._id.toString(), store])
  );

  return fallbackProducts.map((product) => {
    const formatted = formatProductMedia(product);
    return {
      productId: product._id,
      productName: product.productName,
      sellingPrice: product.sellingPrice,
      mrp: product.mrp,
      primaryImage: formatted.primaryImage,
      productImages: formatted.productImages,
      companyName: product.companyName,
      orderCount: 0,
      totalQuantity: 0,
      totalRevenue: 0,
      store: storeMap.get(product.storeId?.toString()) || null,
    };
  });
};

import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import Store from '../models/Store.js';
import Product from '../models/Product.js';
import StorePopularProduct from '../models/StorePopularProduct.js';
import StoreOffer from '../models/StoreOffer.js';
import StoreCategory from '../models/StoreCategory.js';
import mongoose from 'mongoose';
import { signedUrl } from '../helper/s3.config.js';
import { processGoogleMapsLink } from '../helper/latAndLong.js';
import PickupAddress from '../models/PickupAddress.js';

let limit = process.env.LIMIT;
limit = limit ? Number(limit) : 10;

const { ObjectId } = mongoose.Types;

const extractFileKeys = (files = []) => {
  if (!Array.isArray(files) || !files.length) return [];
  return files
    .map((file) => file?.key || file?.location || file?.path)
    .filter((key) => typeof key === "string" && key.trim().length)
    .map((key) => key.trim());
};

const parseIncomingImages = (incoming) => {
  if (!incoming) return [];
  if (Array.isArray(incoming)) {
    return incoming
      .filter((img) => typeof img === "string" && img.trim().length)
      .map((img) => img.trim());
  }
  if (typeof incoming === "string") {
    try {
      const parsed = JSON.parse(incoming);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((img) => typeof img === "string" && img.trim().length)
          .map((img) => img.trim());
      }
    } catch (err) {
      // not a JSON string, fallback to comma separated parsing
    }
    return incoming
      .split(",")
      .map((img) => img.trim())
      .filter((img) => img.length);
  }
  return [];
};

const mergeUniqueImages = (...lists) => {
  const flat = lists.flat().filter(Boolean);
  return [...new Set(flat)];
};

export const uploadStoreImage = async (req, res) => {
    try {
        signedUrl(req, res, 'Store/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadStoreImage', error, req, res);
    }
}


/**
 * @route   POST /api/retailer/create/store/v1
 * @desc    Create a new retailer store
 * @access  Private (Retailer)
 */
export const createStore = async (req, res) => {
  try {
    const { name, category, information, phone, address, email, location, directMe } = req.body;

    if (!name || !category || !information || !phone || !address || !email) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please fill all required fields (name, category, info, phone, address, email)",
      });
    }

    // Prevent multiple stores for one retailer
    const existingStore = await Store.findOne({ createdBy: req.user._id });
    if (existingStore) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "A store already exists for this retailer account",
      });
    }

    // Handle Google Maps link or custom location
    let geoLocation = null;
    if (directMe) {
      const coords = await processGoogleMapsLink(directMe);
      if (coords?.lat && coords?.lng) {
        geoLocation = { type: "Point", coordinates: [coords.lng, coords.lat] };
      } else {
        geoLocation = { type: "Point", coordinates: [77.209, 28.6139] }; // fallback to Delhi
      }
    } else if (location?.coordinates) {
      geoLocation = location;
    } else {
      geoLocation = { type: "Point", coordinates: [77.209, 28.6139] };
    }

    const incomingImages = mergeUniqueImages(
      parseIncomingImages(req.body?.images),
      extractFileKeys(req.files)
    );

    const store = new Store({
      name,
      category,
      information,
      phone,
      address,
      email,
      directMe,
      images: incomingImages,
      location: geoLocation,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const savedStore = await store.save();

    res.status(status.Create).json({
      status: jsonStatus.Create,
      success: true,
      message: "Store created successfully",
      data: savedStore,
    });
  } catch (error) {
    console.error("❌ Error creating store:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("createStore", error, req, res);
  }
};

export const editStore = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body };

    const isStore = await Store.findOne({ createdBy: req.user._id, _id: id });
    if (!isStore) {
      return res.status(404).json({ success: false, message: "Store not found" });
    }

    const updateData = { updatedBy: req.user._id };
    const allowedFields = ["name", "category", "information", "phone", "address", "email"];

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        updateData[field] = payload[field];
      }
    });

    let geoLocation = null;

    if (Object.prototype.hasOwnProperty.call(payload, "location") && payload.location) {
      geoLocation = payload.location;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "directMe")) {
      updateData.directMe = payload.directMe;
      if (payload.directMe && typeof payload.directMe === "string") {
        const coordinate = await processGoogleMapsLink(payload.directMe);
        if (coordinate.lat && coordinate.lng) {
          geoLocation = {
            type: "Point",
            coordinates: [coordinate.lng, coordinate.lat],
          };
        } else {
          return res.status(400).json({
            success: false,
            message: "Please enter a valid Google Maps link",
          });
        }
      }
    }

    if (geoLocation) {
      updateData.location = geoLocation;
    }

    const newImages = mergeUniqueImages(
      parseIncomingImages(payload.images),
      extractFileKeys(req.files)
    );

    if (newImages.length) {
      const existing = Array.isArray(isStore.images) ? isStore.images : [];
      updateData.images = mergeUniqueImages(existing, newImages);
    }

    if (Object.keys(updateData).length === 1) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one field to update",
      });
    }

    await Store.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    const storeDetails = await Store.aggregate([
      { $match: { _id: new ObjectId(id) } },
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
    ]);

    res.status(200).json({
      success: true,
      message: "Store updated successfully",
      data: storeDetails[0],
    });
  } catch (error) {
    console.error("Error editing store:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
  
export const storeDetails = async (req, res) => {
    try {
      if (!req.user || !req.user._id) {
        return res
          .status(status.Unauthorized)
          .json({ success: false, message: "Unauthorized access" });
      }
  
      const store = await Store.findOne({ createdBy: req.user._id });
      if (!store) {
        return res
          .status(status.NotFound)
          .json({
            success: false,
            message: "You have not created any store with this account",
          });
      }
  
      const storeDetails = await Store.aggregate([
        { $match: { createdBy: new ObjectId(req.user._id) } },
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
            from: "store_offers",
            localField: "_id",
            foreignField: "storeId",
            as: "storeOffers",
            pipeline: [{ $match: { deleted: false } }],
          },
        },
        {
          $lookup: {
            from: "store_popular_products",
            localField: "_id",
            foreignField: "storeId",
            as: "popularProducts",
            pipeline: [
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
            ],
          },
        },
      ]);
  
      const enrichedStores = await Promise.all(
        storeDetails.map(async (storeDoc) => {
          const shiprocketInfo = storeDoc.shiprocket || {};
          const pickupIds = shiprocketInfo.pickup_addresses || [];

          let pickupAddresses = [];
          if (pickupIds.length) {
            pickupAddresses = await PickupAddress.find({ _id: { $in: pickupIds } })
              .select("-__v")
              .lean();
          }

          const defaultPickupId = shiprocketInfo.default_pickup_address?.toString() || null;
          const defaultPickup = defaultPickupId
            ? pickupAddresses.find((addr) => addr._id.toString() === defaultPickupId)
            : null;

          return {
            ...storeDoc,
            shiprocket: {
              ...shiprocketInfo,
              pickup_addresses_ids: pickupIds,
              pickup_addresses_data: pickupAddresses,
              default_pickup_address_id: defaultPickupId,
              default_pickup_address_data: defaultPickup || null,
            },
          };
        })
      );

      return res.status(status.OK).json({
        success: true,
        message: "Store details fetched successfully",
        data: enrichedStores,
      });
    } catch (error) {
      console.error("Error in storeDetails:", error);
      return res.status(status.InternalServerError).json({
        success: false,
        message: error.message,
      });
    }
  };
  
export const deleteStoreImage = async (req, res) => {
    try {

        const store = await Store.findOne({ createdBy: req.user._id });
        if (!store) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "You have not created any store with this account" });
        }

        const { index } = req.body;

        if (typeof index !== "number" || index < 0) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Invalid index provided." });
        }

        if (index >= store.images.length) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Index out of bounds." });
        }

        const updatedStore = await Store.findByIdAndUpdate(
            store._id,
            {
                $pull: {
                    images: store.images[index]
                }
            },
            { new: true, runValidators: true }
        );

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: updatedStore });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteStoreImage', error, req, res);
    }
};

export const listOfCategories = async (req, res) => {
    try {

        const listCategories = await StoreCategory.aggregate([
            {
                $match: {
                    deleted: false
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: listCategories });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('listOfCategories', error, req, res);
    }
};

export const saveAllOffers = async (req, res) => {
    try {
        const { offers } = req.body;

        const store = await Store.findOne({ createdBy: req.user._id });
        if (!store) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "You have not created any store with this account" });
        }

        if (!Array.isArray(offers)) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Offers must be an array." });
        }

        const userId = req.user._id;

        const offerDocuments = offers.map(offer => ({
            offer,
            createdBy: userId,
            storeId: store._id
        }));

        await StoreOffer.deleteMany({ storeId: store._id, createdBy: userId });

        const insertedOffers = await StoreOffer.insertMany(offerDocuments);

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: insertedOffers });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('saveAllOffers', error, req, res);
    }
};

export const createStoreOffer = async (req, res) => {
    try {
        const { offer } = req.body;
        const { id } = req.params;

        if (!offer) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Please enter offer" });
        }

        const store = await Store.findOne({ _id: id, createdBy: req.user._id });
        if (!store) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Store not found" });
        }

        let newStoreOffer = new StoreOffer({ offer, createdBy: req.user._id, storeId: id });
        newStoreOffer = await newStoreOffer.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: newStoreOffer });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createStoreOffer', error, req, res);
    }
};

export const deleteStoreOffer = async (req, res) => {
    try {
        const { store, offer } = req.params;

        const findOffer = await StoreOffer.findOne({ _id: offer, storeId: store, createdBy: req.user._id });
        if (!findOffer) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Store Offer not found" });
        }

        await StoreOffer.findByIdAndDelete(findOffer._id);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteStoreOffer', error, req, res);
    }
};

export const createOffers = async (req, res) => {
    try {
        const { storeId, offers } = req.body; // Accepting an array of offers

        // Validation: Ensure required fields are present
        if (!storeId || !Array.isArray(offers) || offers.length === 0) {
            return res.status(400).json({ success: false, message: 'storeId and at least one offer are required.' });
        }

        // Array to store new offers
        let newOffers = [];

        for (let offer of offers) {
            const { offerType, discountValue, minOrderValue, selectedProducts, title } = offer;

            // Validate offerType
            if (!offerType) {
                return res.status(400).json({ success: false, message: 'offerType is required for all offers.' });
            }

            // Validation: If offerType is 'buy_one_get_one', selectedProducts must be provided
            if (offerType === 'buy_one_get_one' && (!selectedProducts || selectedProducts.length === 0)) {
                return res.status(400).json({ success: false, message: 'For Buy One Get One, selectedProducts is required.' });
            }

            // Validation: If offerType is percentage or flat discount, discountValue must be provided
            if ((offerType === 'percentage_discount' || offerType === 'flat_discount') && (discountValue === undefined || discountValue <= 0)) {
                return res.status(400).json({ success: false, message: 'Discount value must be greater than 0 for discount offers.' });
            }

            // Creating offer object
            newOffers.push({
                storeId,
                createdBy: req.user._id,
                offerType,
                discountValue: offerType === 'buy_one_get_one' ? null : discountValue, // No discount value for BOGO
                minOrderValue: minOrderValue || 0, // Default to 0
                selectedProducts: offerType === 'buy_one_get_one' ? selectedProducts : [], // Only include products for BOGO
                title: title || ''
            });
        }

        // Bulk insert into MongoDB
        const savedOffers = await StoreOffer.insertMany(newOffers);

        res.status(201).json({
            success: true,
            message: `${savedOffers.length} offers created successfully`,
            data: savedOffers
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
        return catchError('createOffers', error, req, res);
    }
};

export const saveAllPopularProducts = async (req, res) => {
    try {
        const { productIds, storeId } = req.body;

        // 🧩 1️⃣ Validate Input
        if (!Array.isArray(productIds) || !storeId) {
            return res.status(400).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please provide a valid array of Product IDs and a Store ID."
            });
        }

        // 🧩 2️⃣ Validate Store Ownership
        const store = await Store.findOne({ _id: storeId, createdBy: req.user._id });
        if (!store) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Store not found or does not belong to you."
            });
        }

        // 🧩 3️⃣ Check if all products belong to this store
        const products = await Product.find({
            _id: { $in: productIds },
            storeId: storeId, // ✅ Matching by store instead of createdBy
        });

        if (products.length !== productIds.length) {
            return res.status(404).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Some products were not found in this store."
            });
        }

        // 🧩 4️⃣ Remove old popular products for this store
        await StorePopularProduct.deleteMany({ storeId, createdBy: req.user._id });

        // 🧩 5️⃣ Create new popular product documents
        const popularProductDocs = productIds.map(productId => ({
            productId,
            storeId,
            createdBy: req.user._id
        }));

        // 🧩 6️⃣ Insert new ones
        const insertedPopularProducts = await StorePopularProduct.insertMany(popularProductDocs);

        // 🧩 7️⃣ Respond with success
        res.status(status.Create).json({
            status: jsonStatus.Create,
            success: true,
            message: "Popular products saved successfully.",
            data: insertedPopularProducts
        });

    } catch (error) {
        // 🧩 8️⃣ Catch and log errors
        console.error("Error in saveAllPopularProducts:", error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('saveAllPopularProducts', error, req, res);
    }
};

export const createPopularProduct = async (req, res) => {
    try {
        const { productId, storeId } = req.body;

        if (!productId || !storeId) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Please enter Product ID and Store ID" });
        }

        const store = await Store.findOne({ _id: storeId, createdBy: req.user._id });
        if (!store) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Store not found" });
        }

        const product = await Product.findOne({ _id: productId, createdBy: req.user._id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Product not found" });
        }

        const popularProductFind = await StorePopularProduct.findOne({ productId, storeId, createdBy: req.user._id });
        if (popularProductFind) {
            return res.status(status.ResourceExist).json({ status: jsonStatus.ResourceExist, success: false, message: "Popular product already added" });
        }

        let newPopularProduct = new StorePopularProduct({ productId, storeId, createdBy: req.user._id });
        newPopularProduct = await newPopularProduct.save();

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: newPopularProduct });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('createPopularProduct', error, req, res);
    }
};

export const deleteStoreSelectedOffer = async (req, res) => {
    try {
        const { id } = req.params;

        const findOffer = await StoreOffer.findOne({ createdBy: req.user._id, _id: id });
        if (!findOffer) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Offer not found" });
        }

        findOffer.deleted = true;
        await findOffer.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteStoreSelectedOffer', error, req, res);
    }
};

export const deletePopularProduct = async (req, res) => {
    try {
        const { store, id } = req.params;

        const storeDetails = await Store.findOne({ _id: store, createdBy: req.user._id });
        if (!storeDetails) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Store not found" });
        }

        const findPopProduct = await StorePopularProduct.findById(id);
        if (!findPopProduct) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Popular product not found with this ID" });
        }

        await StorePopularProduct.findByIdAndDelete(id);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deletePopularProduct', error, req, res);
    }
};

export const searchPopularProduct = async (req, res) => {
    try {
        const { search } = req.query;
        let { skip } = req.query;
        skip = skip || 1;

        const list = await Product.aggregate([
            {
                $match: {
                    deleted: false,
                    createdBy: new ObjectId(req.user._id),
                    productName: {
                        $regex: search, $options: 'i'
                    }
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $skip: (Number(skip) - 1) * limit
            },
            {
                $limit: limit
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('searchPopularProduct', error, req, res);
    }
};
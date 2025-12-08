import Store from "../models/Store.js";
import User from "../models/User.js";
import ShiprocketService from "../helper/shiprocketService.js";
import { processGoogleMapsLink } from "../helper/latAndLong.js"; // optional helper
import { jsonStatus, status } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";
import StoreOffer from "../models/StoreOffer.js";
import StorePopularProduct from "../models/StorePopularProduct.js";
import Product from "../models/Product.js";
import StoreCategory from "../models/StoreCategory.js";
import { isAutomobileCategory } from "./slotBookingController.js";
import mongoose from "mongoose";
import PickupAddress from "../models/PickupAddress.js";

const { ObjectId } = mongoose.Types;


export const createSellerStore = async (req, res) => {
  try {
    const { name, category, information, phone, address, email, directMe, city, state, pincode } = req.body;

    if (!name || !category || !information || !phone || !address || !email) {
      return res.status(400).json({ success: false, message: "All store details are required" });
    }

    // 🚫 Check if seller already created a store
    const existingStore = await Store.findOne({ createdBy: req.user._id });
    if (existingStore) {
      return res.status(400).json({ success: false, message: "Store already exists for this seller" });
    }

    // 🗺️ Convert Google Maps link to coordinates (optional)
    let coordinates = [77.209, 28.6139]; // Default Delhi
    if (directMe) {
      const coords = await processGoogleMapsLink(directMe);
      if (coords?.lat && coords?.lng) coordinates = [coords.lng, coords.lat];
    }

    // 📸 Handle images from multer
    const images = req.files && req.files.length > 0 
      ? req.files.map(file => file.key) 
      : [];

    // 🏪 Create Store in DB
    const newStore = await Store.create({
      name,
      category,
      information,
      phone,
      address,
      email,
      directMe,
      images,
      coverImage: images[0] || "",
      location: { type: "Point", coordinates },
      createdBy: req.user._id,
      updatedBy: req.user._id,
      onboardingCompleted: false,
      status: "P",
    });

    // 🚀 Shiprocket Pickup Creation
    const pickupPayload = {
      pickup_location: name.replace(/\s+/g, "_").toLowerCase(),
      name,
      email,
      phone,
      address,
      city: city || "Delhi",
      state: state || "Delhi",
      country: "India",
      pin_code: pincode || "110001",
    };

    try {
      const shipResponse = await ShiprocketService.createPickupAddress(pickupPayload);
      if (shipResponse?.pickup_location || shipResponse?.id) {
        newStore.shiprocket = {
          pickup_address_id: shipResponse.pickup_location || shipResponse.id,
          pickup_location: pickupPayload,
        };
        await newStore.save();
      }
    } catch (err) {
      console.warn("⚠️ Shiprocket pickup creation failed:", err.message);
    }

    // 🔄 Sync store address, city, state to seller profile
    try {
      const seller = await User.findById(req.user._id);
      if (seller) {
        // Update seller profile with store business address, city, state
        if (address && !seller.address) {
          seller.address = address;
        }
        if (city && !seller.city) {
          seller.city = city;
        }
        if (state && !seller.state) {
          seller.state = state;
        }
        await seller.save();
      }
    } catch (err) {
      console.warn("⚠️ Failed to sync store address to seller profile:", err.message);
      // Don't fail the store creation if profile update fails
    }

    return res.status(201).json({
      success: true,
      message: "Seller store created successfully with Shiprocket pickup",
      data: newStore,
    });
  } catch (error) {
    console.error("❌ Error creating seller store:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update Store Objectives
export const updateStoreObjectives = async (req, res) => {
  try {
    const { objectives } = req.body;

    if (!objectives || !Array.isArray(objectives) || objectives.length === 0) {
      return res.status(400).json({
        // status: jsonStatus.BadRequest,
        success: false,
        message: "At least one objective is required",
      });
    }

    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(404).json({
        // status: jsonStatus.NotFound,
        success: false,
        message: "Store not found"
      });
    }

    store.objectives = objectives;
    store.updatedBy = req.user._id;
    await store.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Store objectives updated successfully",
      data: store
    });
  } catch (error) {
    console.error("❌ Error updating store objectives:", error.message);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
    return catchError("updateStoreObjectives", error, req, res);
  }
};

// Update Store License
// export const updateStoreLicense = async (req, res) => {
//   try {
//     const licenseFile = req.file;

//     if (!licenseFile) {
//       return res.status(status.BadRequest).json({
//         status: jsonStatus.BadRequest,
//         success: false,
//         message: "License file is required"
//       });
//     }

//     const store = await Store.findOne({ createdBy: req.user._id });
//     if (!store) {
//       return res.status(status.NotFound).json({
//         status: jsonStatus.NotFound,
//         success: false,
//         message: "Store not found"
//       });
//     }

//     store.license = licenseFile.key;
//     store.updatedBy = req.user._id;
//     await store.save();

//     return res.status(status.OK).json({
//       status: jsonStatus.OK,
//       success: true,
//       message: "Store license updated successfully",
//       data: store
//     });
//   } catch (error) {
//     console.error("❌ Error updating store license:", error.message);
//     return res.status(status.InternalServerError).json({
//       status: jsonStatus.InternalServerError,
//       success: false,
//       message: error.message
//     });
//     return catchError("updateStoreLicense", error, req, res);
//   }
// };


export const updateStoreLicense = async (req, res) => {
  try {
    if (!req.file || !req.file.key) {
      return res.status(400).json({
        success: false,
        message: "Business license file is required",
      });
    }

    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found for this seller",
      });
    }

    store.license = req.file.key;
    store.updatedBy = req.user._id;
    store.onboardingCompleted = true; // 🎯 multipart done
    // status remains "P" — waiting for admin approval

    await store.save();

    return res.status(200).json({
      success: true,
      message:
        "Store verification (license) uploaded successfully. Your request is pending admin approval.",
      data: store,
    });
  } catch (error) {
    console.error("❌ Error updating store license:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};




// Get Seller Store Details
export const getSellerStoreDetails = async (req, res) => {
  try {
    const store = await Store.findOne({ createdBy: req.user._id })
      .populate("category", "name")
      .lean();

    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found"
      });
    }

    const storeOffers = await StoreOffer.find({
      storeId: store._id,
      createdBy: req.user._id,
      deleted: false
    })
      .sort({ createdAt: -1 })
      .lean();

    const popularProducts = await StorePopularProduct.aggregate([
      {
        $match: {
          storeId: new ObjectId(store._id),
          createdBy: new ObjectId(req.user._id)
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product"
        }
      },
      {
        $unwind: {
          path: "$product",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $project: {
          _id: "$product._id",
          productName: "$product.productName",
          primaryImage: "$product.primaryImage",
          mrp: "$product.mrp",
          sellingPrice: "$product.sellingPrice",
          offPer: "$product.offPer",
          status: "$product.status",
          createdAt: "$product.createdAt"
        }
      },
      {
        $sort: {
          createdAt: -1
        }
      },
      {
        $limit: 8
      }
    ]);

    // Check if store category is automobile
    const categoryName = store.category?.name || "";
    const isAutomobile = isAutomobileCategory(categoryName);
    
    // Debug logging
    console.log("🔍 Store Category Check:", {
      categoryName,
      isAutomobile,
      categoryId: store.category?._id
    });

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: {
        ...store,
        storeOffers,
        popularProducts,
        isAutomobile
      }
    });
  } catch (error) {
    console.error("❌ Error fetching store details:", error.message);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
    return catchError("getSellerStoreDetails", error, req, res);
  }
};


export const updateSellerStore = async (req, res) => {
  try {
    const { name, category, information, phone, address, email, directMe } =
      req.body;

    const store = await Store.findOne({ createdBy: req.user._id });

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store does not exist, please start onboarding first.",
      });
    }

    // Update fields
    store.name = name ?? store.name;
    store.category = category ?? store.category;
    store.information = information ?? store.information;
    store.phone = phone ?? store.phone;
    store.address = address ?? store.address;
    store.email = email ?? store.email;
    store.directMe = directMe ?? store.directMe;

    // Images update
    if (req.files && req.files.length > 0) {
      store.images = req.files.map((file) => file.key);
      store.coverImage = store.images[0];
    }

    store.updatedBy = req.user._id;

    await store.save();

    return res.status(200).json({
      success: true,
      message: "Store details updated successfully",
      data: store,
    });
  } catch (error) {
    console.error("Update store error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

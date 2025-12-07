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

    // Validate required fields
    if (!name || !category || !information || !phone || !address || !email) {
      return res.status(400).json({ success: false, message: "All store details are required" });
    }

    // Validate Shiprocket required fields (city, state, pincode)
    if (!city || !state || !pincode) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide city, state, and pincode for Shiprocket pickup address" 
      });
    }

    // Validate phone format (should start with +)
    if (!phone.startsWith('+')) {
      return res.status(400).json({ 
        success: false, 
        message: "Phone number must include country code (e.g., +918780654545)" 
      });
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
    });

    // 🚀 Shiprocket Pickup Creation
    // Ensure all fields are properly formatted
    const pickupPayload = {
      pickup_location: name.replace(/\s+/g, "_").toLowerCase().substring(0, 50),
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      country: "India",
      pin_code: pincode.toString().trim(), // Ensure pincode is string
    };

    console.log("📋 Pickup payload prepared:", {
      pickup_location: pickupPayload.pickup_location,
      name: pickupPayload.name,
      email: pickupPayload.email,
      phone: pickupPayload.phone,
      city: pickupPayload.city,
      state: pickupPayload.state,
      pin_code: pickupPayload.pin_code
    });

    let shiprocketPickupId = null;
    let shiprocketError = null;
    let shipResponse = null;

    try {
      console.log("🚀 Creating Shiprocket pickup address with payload:", {
        pickup_location: pickupPayload.pickup_location,
        name: pickupPayload.name,
        city: pickupPayload.city,
        state: pickupPayload.state
      });
      
      shipResponse = await ShiprocketService.createPickupAddress(pickupPayload);
      console.log("📦 Shiprocket raw response:", JSON.stringify(shipResponse, null, 2));
      
      // Handle different response structures from Shiprocket
      // Try multiple possible response formats
      shiprocketPickupId = shipResponse?.data?.pickup_location || 
                      shipResponse?.data?.id || 
                      shipResponse?.data?.pickup_address_id ||
                      shipResponse?.data?.pickup_id ||
                      shipResponse?.pickup_location || 
                      shipResponse?.id ||
                      shipResponse?.pickup_address_id ||
                      shipResponse?.pickup_id ||
                      shipResponse?.data?.data?.pickup_location ||
                      shipResponse?.data?.data?.id ||
                      null;

      // If still null, try to extract from response message or other fields
      if (!shiprocketPickupId && shipResponse?.data) {
        // Sometimes the ID might be in a nested structure
        const data = shipResponse.data;
        shiprocketPickupId = data.pickup_location || data.id || data.pickup_id || 
                           (typeof data === 'object' && Object.values(data).find(v => typeof v === 'number' || typeof v === 'string'));
      }

      if (!shiprocketPickupId) {
        shiprocketError = "Shiprocket response missing pickup address ID";
        console.warn("⚠️ Shiprocket pickup creation response format unexpected. Full response:", JSON.stringify(shipResponse, null, 2));
        // Log the response structure for debugging
        console.warn("⚠️ Response keys:", Object.keys(shipResponse || {}));
        if (shipResponse?.data) {
          console.warn("⚠️ Response.data keys:", Object.keys(shipResponse.data));
        }
      } else {
        console.log("✅ Shiprocket pickup created successfully. ID:", shiprocketPickupId);
      }
    } catch (err) {
      shiprocketError = err.message || err.response?.data?.message || "Unknown error";
      console.error("❌ Shiprocket pickup creation failed:", {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
    }

    // 📦 Create PickupAddress document in database
    let savedPickupAddress = null;
    try {
      // Ensure all required fields are present
      if (!name || !phone || !address || !pickupPayload.city || !pickupPayload.state || !pickupPayload.pin_code) {
        throw new Error("Missing required fields for pickup address");
      }

      const pickupAddress = new PickupAddress({
        storeId: newStore._id,
        nickname: name, // Use store name as nickname
        isPrimary: true, // First pickup address is always primary
        spocDetails: {
          name: name,
          phone: phone,
          email: email || `${phone}@orsolum.com`
        },
        shiprocket: {
          pickup_address_id: shiprocketPickupId,
          pickup_location: {
            name: pickupPayload.name,
            phone: pickupPayload.phone,
            address: pickupPayload.address,
            city: pickupPayload.city,
            state: pickupPayload.state,
            pincode: pickupPayload.pin_code,
            country: pickupPayload.country
          },
          error: shiprocketError || null
        },
        createdBy: req.user._id,
        updatedBy: req.user._id
      });

      savedPickupAddress = await pickupAddress.save();
      console.log("✅ PickupAddress document created successfully. ID:", savedPickupAddress._id);
      console.log("✅ PickupAddress Shiprocket ID (before update):", savedPickupAddress.shiprocket?.pickup_address_id);

      // Get Shiprocket ID from saved PickupAddress if it wasn't set earlier
      let finalShiprocketId = shiprocketPickupId || savedPickupAddress.shiprocket?.pickup_address_id;
      
      // If we have Shiprocket ID but PickupAddress doesn't, update it
      if (shiprocketPickupId && !savedPickupAddress.shiprocket.pickup_address_id) {
        savedPickupAddress.shiprocket.pickup_address_id = shiprocketPickupId;
        await savedPickupAddress.save();
        finalShiprocketId = shiprocketPickupId;
        console.log("✅ Updated PickupAddress with Shiprocket ID:", finalShiprocketId);
      }
      
      // Refresh PickupAddress to get latest data
      savedPickupAddress = await PickupAddress.findById(savedPickupAddress._id);
      finalShiprocketId = savedPickupAddress.shiprocket?.pickup_address_id || finalShiprocketId;
      console.log("✅ Final Shiprocket ID for store:", finalShiprocketId);

      // Use findByIdAndUpdate to ensure array is properly saved
      await Store.findByIdAndUpdate(
        newStore._id,
        {
          $set: {
            'shiprocket.pickup_address_id': finalShiprocketId, // Use final Shiprocket ID
            'shiprocket.pickup_location': {
              name: pickupPayload.name,
              phone: pickupPayload.phone,
              email: pickupPayload.email,
              address: pickupPayload.address,
              city: pickupPayload.city,
              state: pickupPayload.state,
              pincode: pickupPayload.pin_code,
              country: pickupPayload.country
            },
            'shiprocket.default_pickup_address': savedPickupAddress._id
          },
          $addToSet: {
            'shiprocket.pickup_addresses': savedPickupAddress._id
          }
        },
        { new: true, runValidators: true }
      );
      
      console.log("✅ Store updated with pickup address using findByIdAndUpdate");
      console.log("✅ Shiprocket pickup_address_id set to:", finalShiprocketId);
      
      // Refresh store to get latest data
      newStore = await Store.findById(newStore._id).populate('shiprocket.pickup_addresses');
      console.log("✅ Store refreshed. pickup_addresses count:", newStore.shiprocket?.pickup_addresses?.length || 0);
      console.log("✅ Store pickup_addresses IDs:", newStore.shiprocket?.pickup_addresses?.map(a => typeof a === 'object' ? a._id : a) || []);
      console.log("✅ Store pickup_address_id:", newStore.shiprocket?.pickup_address_id);
    } catch (pickupErr) {
      console.error("❌ CRITICAL: Error creating PickupAddress document:", pickupErr);
      console.error("❌ Error details:", {
        message: pickupErr.message,
        stack: pickupErr.stack,
        name: pickupErr.name,
        errors: pickupErr.errors
      });
      
      // Even if PickupAddress creation fails, save complete pickup_location structure
      if (!newStore.shiprocket) {
        newStore.shiprocket = {};
      }
      
      newStore.shiprocket.pickup_address_id = shiprocketPickupId;
      newStore.shiprocket.pickup_location = {
        name: pickupPayload.name,
        phone: pickupPayload.phone,
        email: pickupPayload.email,
        address: pickupPayload.address,
        city: pickupPayload.city,
        state: pickupPayload.state,
        pincode: pickupPayload.pin_code,
        country: pickupPayload.country
      };
      newStore.shiprocket.pickup_addresses = [];
      newStore.shiprocket.default_pickup_address = null;
      
      newStore.markModified('shiprocket');
      newStore.markModified('shiprocket.pickup_location');
      
      await newStore.save();
      console.warn("⚠️ Store saved with basic shiprocket structure (PickupAddress creation failed)");
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

    // Ensure shiprocket structure is complete in response - ALWAYS populate to get Shiprocket ID
    let responseStore = newStore;
    
    // Always try to populate pickup_addresses to get Shiprocket IDs
    if (newStore.shiprocket?.pickup_addresses?.length > 0) {
      // Always populate to ensure we get the Shiprocket ID
      responseStore = await Store.findById(newStore._id)
        .populate({
          path: 'shiprocket.pickup_addresses',
          select: '_id shiprocket.pickup_address_id nickname'
        })
        .lean();
      
      // If populate didn't work, try direct query
      if (!responseStore.shiprocket?.pickup_addresses || responseStore.shiprocket.pickup_addresses.length === 0) {
        const pickupIds = newStore.shiprocket.pickup_addresses.map(id => 
          typeof id === 'object' ? id._id || id : id
        ).filter(Boolean);
        
        if (pickupIds.length > 0) {
          const pickupAddresses = await PickupAddress.find({ _id: { $in: pickupIds } })
            .select('_id shiprocket.pickup_address_id nickname')
            .lean();
          
          responseStore = newStore.toObject ? newStore.toObject() : newStore;
          responseStore.shiprocket.pickup_addresses = pickupAddresses;
        }
      }
    } else {
      responseStore = newStore.toObject ? newStore.toObject() : newStore;
    }

    // Ensure shiprocket structure is complete in response
    if (!responseStore.shiprocket) {
      responseStore.shiprocket = {
        pickup_location: {},
        pickup_addresses: [],
        pickup_address_id: null,
        default_pickup_address: null
      };
    }
    
    // Ensure pickup_addresses is always an array
    if (!Array.isArray(responseStore.shiprocket.pickup_addresses)) {
      responseStore.shiprocket.pickup_addresses = [];
    }
    
    // If pickup_addresses is populated, add the data
    if (Array.isArray(responseStore.shiprocket.pickup_addresses) && responseStore.shiprocket.pickup_addresses.length > 0) {
      // Get full PickupAddress documents with all fields
      const pickupIds = responseStore.shiprocket.pickup_addresses.map(addr => 
        typeof addr === 'object' ? addr._id || addr : addr
      ).filter(Boolean);
      
      // Fetch full PickupAddress documents
      const fullPickupAddresses = await PickupAddress.find({ _id: { $in: pickupIds } })
        .select('-__v')
        .lean();
      
      responseStore.shiprocket.pickup_addresses_data = fullPickupAddresses;
      responseStore.shiprocket.pickup_addresses_ids = pickupIds;
      
      // Get Shiprocket ID from the first pickup address if available
      if (!responseStore.shiprocket.pickup_address_id && fullPickupAddresses.length > 0) {
        const firstPickup = fullPickupAddresses[0];
        if (firstPickup?.shiprocket?.pickup_address_id) {
          responseStore.shiprocket.pickup_address_id = firstPickup.shiprocket.pickup_address_id;
        }
      }
    } else {
      responseStore.shiprocket.pickup_addresses_data = [];
      responseStore.shiprocket.pickup_addresses_ids = [];
    }
    
    // Final validation - ensure no null values in critical fields
    if (responseStore.shiprocket) {
      if (!Array.isArray(responseStore.shiprocket.pickup_addresses)) {
        responseStore.shiprocket.pickup_addresses = [];
      }
      
      // If default_pickup_address exists but pickup_addresses is empty, add it
      if (responseStore.shiprocket.default_pickup_address && 
          (!responseStore.shiprocket.pickup_addresses || responseStore.shiprocket.pickup_addresses.length === 0)) {
        responseStore.shiprocket.pickup_addresses = [responseStore.shiprocket.default_pickup_address];
        responseStore.shiprocket.pickup_addresses_ids = [responseStore.shiprocket.default_pickup_address];
      }
      
      // Get Shiprocket ID from PickupAddress if not set in store
      if (!responseStore.shiprocket.pickup_address_id) {
        if (savedPickupAddress?.shiprocket?.pickup_address_id) {
          responseStore.shiprocket.pickup_address_id = savedPickupAddress.shiprocket.pickup_address_id;
        } else if (responseStore.shiprocket.pickup_addresses?.length > 0) {
          // Try to get from populated pickup_addresses
          const firstAddr = responseStore.shiprocket.pickup_addresses[0];
          if (typeof firstAddr === 'object' && firstAddr.shiprocket?.pickup_address_id) {
            responseStore.shiprocket.pickup_address_id = firstAddr.shiprocket.pickup_address_id;
          }
        }
      }
      if (!responseStore.shiprocket.default_pickup_address && savedPickupAddress?._id) {
        responseStore.shiprocket.default_pickup_address = savedPickupAddress._id;
        // Also add to pickup_addresses if not already there
        if (!responseStore.shiprocket.pickup_addresses || responseStore.shiprocket.pickup_addresses.length === 0) {
          responseStore.shiprocket.pickup_addresses = [savedPickupAddress._id];
          responseStore.shiprocket.pickup_addresses_ids = [savedPickupAddress._id];
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: "Seller store created successfully with Shiprocket pickup",
      data: responseStore,
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
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Objectives array is required and must not be empty"
      });
    }

    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
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
export const updateStoreLicense = async (req, res) => {
  try {
    const licenseFile = req.file;

    if (!licenseFile) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "License file is required"
      });
    }

    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found"
      });
    }

    store.license = licenseFile.key;
    store.updatedBy = req.user._id;
    await store.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Store license updated successfully",
      data: store
    });
  } catch (error) {
    console.error("❌ Error updating store license:", error.message);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
    return catchError("updateStoreLicense", error, req, res);
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

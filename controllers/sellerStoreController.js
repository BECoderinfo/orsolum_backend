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
    
    // 🔍 Fetch pickup addresses if pickup_address_id exists but pickup_addresses is empty
    let pickupAddressesData = [];
    if (store.shiprocket?.pickup_address_id && (!store.shiprocket?.pickup_addresses || store.shiprocket.pickup_addresses.length === 0)) {
      try {
        // First, try to find PickupAddress documents in database for this store
        const dbPickupAddresses = await PickupAddress.find({ storeId: store._id })
          .select('-__v')
          .lean();
        
        if (dbPickupAddresses.length > 0) {
          // Use database pickup addresses
          pickupAddressesData = dbPickupAddresses;
          console.log("✅ Found pickup addresses in database:", dbPickupAddresses.length);
          
          // Update store with pickup_addresses if not already set
          if (!store.shiprocket.pickup_addresses || store.shiprocket.pickup_addresses.length === 0) {
            await Store.findByIdAndUpdate(store._id, {
              $set: {
                'shiprocket.pickup_addresses': dbPickupAddresses.map(addr => addr._id),
                'shiprocket.default_pickup_address': dbPickupAddresses.find(addr => addr.isPrimary)?._id || dbPickupAddresses[0]?._id || null
              }
            });
          }
        } else {
          // If no database pickup addresses, fetch from Shiprocket
          console.log("🔍 No pickup addresses in database, fetching from Shiprocket...");
          try {
            const shiprocketPickupId = store.shiprocket.pickup_address_id;
            
            // Fetch specific pickup address from Shiprocket
            const shiprocketResponse = await ShiprocketService.getPickupAddressById(shiprocketPickupId);
            const shiprocketPickupData = shiprocketResponse?.data || shiprocketResponse;
            
            if (shiprocketPickupData) {
              // Create a pickup address object from Shiprocket data
              const pickupAddressFromShiprocket = {
                _id: new ObjectId(),
                storeId: store._id,
                nickname: shiprocketPickupData.name || store.name || "Primary Pickup Address",
                isPrimary: true,
                shiprocket: {
                  pickup_address_id: shiprocketPickupId,
                  pickup_location: {
                    name: shiprocketPickupData.name || store.name || "",
                    phone: shiprocketPickupData.phone || store.phone || "",
                    address: shiprocketPickupData.address || store.address || "",
                    address_2: shiprocketPickupData.address_2 || "",
                    city: shiprocketPickupData.city || store.shiprocket?.pickup_location?.city || "",
                    state: shiprocketPickupData.state || store.shiprocket?.pickup_location?.state || "",
                    pincode: shiprocketPickupData.pincode || shiprocketPickupData.pin_code || store.shiprocket?.pickup_location?.pincode || "",
                    country: shiprocketPickupData.country || "India"
                  }
                },
                spocDetails: {
                  name: shiprocketPickupData.name || store.name || "",
                  phone: shiprocketPickupData.phone || store.phone || "",
                  email: shiprocketPickupData.email || store.email || ""
                },
                status: "ACTIVE",
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
                updatedAt: new Date()
              };
              
              pickupAddressesData = [pickupAddressFromShiprocket];
              console.log("✅ Fetched pickup address from Shiprocket:", shiprocketPickupId);
            } else {
              // Fallback: Use pickup_location data from store
              if (store.shiprocket?.pickup_location) {
                const pickupAddressFromStore = {
                  _id: new ObjectId(),
                  storeId: store._id,
                  nickname: store.shiprocket.pickup_location.name || store.name || "Primary Pickup Address",
                  isPrimary: true,
                  shiprocket: {
                    pickup_address_id: store.shiprocket.pickup_address_id,
                    pickup_location: store.shiprocket.pickup_location
                  },
                  spocDetails: {
                    name: store.shiprocket.pickup_location.name || store.name || "",
                    phone: store.shiprocket.pickup_location.phone || store.phone || "",
                    email: store.email || ""
                  },
                  status: "ACTIVE",
                  verificationStatus: "VERIFIED",
                  createdAt: new Date(),
                  updatedAt: new Date()
                };
                pickupAddressesData = [pickupAddressFromStore];
                console.log("✅ Using pickup_location data from store");
              }
            }
          } catch (shiprocketError) {
            console.error("❌ Error fetching pickup address from Shiprocket:", shiprocketError.message);
            // Fallback: Use pickup_location data from store
            if (store.shiprocket?.pickup_location) {
              const pickupAddressFromStore = {
                _id: new ObjectId(),
                storeId: store._id,
                nickname: store.shiprocket.pickup_location.name || store.name || "Primary Pickup Address",
                isPrimary: true,
                shiprocket: {
                  pickup_address_id: store.shiprocket.pickup_address_id,
                  pickup_location: store.shiprocket.pickup_location
                },
                spocDetails: {
                  name: store.shiprocket.pickup_location.name || store.name || "",
                  phone: store.shiprocket.pickup_location.phone || store.phone || "",
                  email: store.email || ""
                },
                status: "ACTIVE",
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
                updatedAt: new Date()
              };
              pickupAddressesData = [pickupAddressFromStore];
              console.log("✅ Using pickup_location data from store (fallback)");
            }
          }
        }
      } catch (error) {
        console.error("❌ Error fetching pickup addresses:", error.message);
        // Continue without pickup addresses
      }
    } else if (store.shiprocket?.pickup_addresses && store.shiprocket.pickup_addresses.length > 0) {
      // If pickup_addresses array exists, populate them
      const pickupIds = store.shiprocket.pickup_addresses.map(addr => 
        typeof addr === 'object' ? addr._id || addr : addr
      ).filter(Boolean);
      
      if (pickupIds.length > 0) {
        pickupAddressesData = await PickupAddress.find({ _id: { $in: pickupIds } })
          .select('-__v')
          .lean();
      }
    }
    
    // Ensure shiprocket structure exists
    if (!store.shiprocket) {
      store.shiprocket = {};
    }
    
    // Add pickup_addresses_data to response
    store.shiprocket.pickup_addresses_data = pickupAddressesData;
    store.shiprocket.pickup_addresses_ids = pickupAddressesData.map(addr => addr._id);
    
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
    const { name, category, information, phone, address, email, directMe, city, state, pincode } =
      req.body;

    const store = await Store.findOne({ createdBy: req.user._id });

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store does not exist, please start onboarding first.",
      });
    }

    // Helper function to parse address and extract city, state, pincode
    const parseAddress = (addressString) => {
      if (!addressString) return { city: "", state: "", pincode: "" };
      
      // Try to extract pincode (6 digits, usually at the end)
      const pincodeMatch = addressString.match(/\b(\d{6})\b/);
      const extractedPincode = pincodeMatch ? pincodeMatch[1] : "";
      
      // Common Indian states (case insensitive)
      const states = ["Gujarat", "Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "West Bengal", 
                     "Rajasthan", "Uttar Pradesh", "Madhya Pradesh", "Punjab", "Haryana", 
                     "Bihar", "Odisha", "Andhra Pradesh", "Telangana", "Kerala", "Assam",
                     "Jharkhand", "Chhattisgarh", "Himachal Pradesh", "Uttarakhand", "Goa",
                     "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Tripura", "Sikkim",
                     "Arunachal Pradesh", "Jammu and Kashmir", "Ladakh"];
      
      let extractedState = "";
      let extractedCity = "";
      
      // Try to find state in address (case insensitive)
      const addressLower = addressString.toLowerCase();
      for (const stateName of states) {
        if (addressLower.includes(stateName.toLowerCase())) {
          extractedState = stateName;
          break;
        }
      }
      
      // Common Indian cities (expandable list)
      const allCities = [
        // Gujarat
        "Surat", "Ahmedabad", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar", "Jamnagar", "Junagadh",
        // Maharashtra
        "Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Solapur", "Thane",
        // Delhi
        "New Delhi", "Delhi",
        // Karnataka
        "Bangalore", "Mysore", "Hubli", "Mangalore", "Belgaum",
        // Tamil Nadu
        "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem",
        // West Bengal
        "Kolkata", "Howrah", "Durgapur", "Asansol",
        // Rajasthan
        "Jaipur", "Jodhpur", "Kota", "Bikaner", "Ajmer",
        // Uttar Pradesh
        "Lucknow", "Kanpur", "Agra", "Varanasi", "Allahabad",
        // And more...
      ];
      
      // Try to find city in address (case insensitive, check before state to avoid false matches)
      for (const cityName of allCities) {
        if (addressLower.includes(cityName.toLowerCase())) {
          extractedCity = cityName;
          break;
        }
      }
      
      return {
        city: extractedCity,
        state: extractedState,
        pincode: extractedPincode
      };
    };

    // Update fields first
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

    // Parse address if city/state/pincode not provided separately
    const parsedAddress = parseAddress(address || store.address);
    const finalCity = city || parsedAddress.city || store.shiprocket?.pickup_location?.city || "";
    const finalState = state || parsedAddress.state || store.shiprocket?.pickup_location?.state || "";
    const finalPincode = pincode || parsedAddress.pincode || store.shiprocket?.pickup_location?.pincode || "";

    // 🚀 Always try to create/update Shiprocket pickup address if we have address data
    // Update if address, city, state, or pincode was updated
    const addressWasUpdated = (address && address !== store.address) || 
                              (city && city !== (store.shiprocket?.pickup_location?.city || "")) ||
                              (state && state !== (store.shiprocket?.pickup_location?.state || "")) ||
                              (pincode && pincode !== (store.shiprocket?.pickup_location?.pincode || ""));
    
    const shouldUpdateShiprocket = (address || store.address) && 
                                   (name || store.name) && 
                                   (phone || store.phone) &&
                                   (finalCity && finalState && finalPincode) &&
                                   (addressWasUpdated || !store.shiprocket?.pickup_address_id || 
                                    !store.shiprocket?.pickup_location?.city || 
                                    !store.shiprocket?.pickup_location?.state ||
                                    !store.shiprocket?.pickup_location?.pincode);

    if (shouldUpdateShiprocket) {
      try {
        const pickupPayload = {
          pickup_location: (name || store.name).replace(/\s+/g, "_").toLowerCase().substring(0, 50),
          name: name || store.name,
          email: email || store.email || `${phone || store.phone}@orsolum.com`,
          phone: phone || store.phone,
          address: address || store.address,
          city: finalCity || "Delhi",
          state: finalState || "Delhi",
          country: "India",
          pin_code: finalPincode || "110001",
        };

        console.log("🚀 Shiprocket pickup payload:", JSON.stringify(pickupPayload, null, 2));

        let shiprocketPickupId = null;
        let shipResponse;

        // Check if store already has a Shiprocket pickup address ID
        if (store.shiprocket?.pickup_address_id) {
          // Update existing pickup address in Shiprocket
          try {
            console.log("🔄 Updating existing Shiprocket pickup address:", store.shiprocket.pickup_address_id);
            shipResponse = await ShiprocketService.updatePickupAddress(
              store.shiprocket.pickup_address_id,
              pickupPayload
            );
            shiprocketPickupId = store.shiprocket.pickup_address_id;
            console.log("✅ Shiprocket pickup address updated:", shiprocketPickupId);
          } catch (updateErr) {
            console.warn("⚠️ Failed to update Shiprocket pickup, trying to create new:", updateErr.message);
            // If update fails, try creating a new one
            shipResponse = await ShiprocketService.createPickupAddress(pickupPayload);
            console.log("📦 Shiprocket create response:", JSON.stringify(shipResponse, null, 2));
            
            // Try multiple response formats
            shiprocketPickupId = shipResponse?.data?.pickup_location || 
                                shipResponse?.data?.id || 
                                shipResponse?.data?.pickup_address_id ||
                                shipResponse?.data?.pickup_id ||
                                shipResponse?.pickup_location || 
                                shipResponse?.id ||
                                shipResponse?.pickup_address_id ||
                                shipResponse?.pickup_id ||
                                null;
            console.log("✅ New Shiprocket pickup address created:", shiprocketPickupId);
          }
        } else {
          // Create new pickup address in Shiprocket
          console.log("🆕 Creating new Shiprocket pickup address");
          shipResponse = await ShiprocketService.createPickupAddress(pickupPayload);
          console.log("📦 Shiprocket create response:", JSON.stringify(shipResponse, null, 2));
          
          // Try multiple response formats
          shiprocketPickupId = shipResponse?.data?.pickup_location || 
                              shipResponse?.data?.id || 
                              shipResponse?.data?.pickup_address_id ||
                              shipResponse?.data?.pickup_id ||
                              shipResponse?.pickup_location || 
                              shipResponse?.id ||
                              shipResponse?.pickup_address_id ||
                              shipResponse?.pickup_id ||
                              null;
          console.log("✅ Shiprocket pickup address created:", shiprocketPickupId);
        }

        // Always update store with Shiprocket pickup address details (even if ID is null, save the location data)
        if (!store.shiprocket) {
          store.shiprocket = {};
        }
        
        if (shiprocketPickupId) {
          store.shiprocket.pickup_address_id = shiprocketPickupId;
        }
        
        // Always update pickup_location with complete data
        store.shiprocket.pickup_location = {
          name: pickupPayload.name,
          phone: pickupPayload.phone,
          email: pickupPayload.email,
          address: pickupPayload.address,
          city: pickupPayload.city,
          state: pickupPayload.state,
          pincode: pickupPayload.pin_code,
          country: pickupPayload.country
        };

        console.log("✅ Store shiprocket data updated:", {
          pickup_address_id: store.shiprocket.pickup_address_id,
          pickup_location: store.shiprocket.pickup_location
        });
      } catch (shipErr) {
        console.error("❌ Shiprocket pickup address sync failed:", shipErr.message);
        console.error("Error details:", shipErr);
        // Still save the pickup_location data even if Shiprocket API fails
        if (!store.shiprocket) {
          store.shiprocket = {};
        }
        store.shiprocket.pickup_location = {
          name: name || store.name,
          phone: phone || store.phone,
          email: email || store.email || `${phone || store.phone}@orsolum.com`,
          address: address || store.address,
          city: finalCity || "",
          state: finalState || "",
          pincode: finalPincode || "",
          country: "India"
        };
      }
    }

    // Update location coordinates if directMe changed
    if (directMe && directMe !== store.directMe) {
      try {
        const coords = await processGoogleMapsLink(directMe);
        if (coords?.lat && coords?.lng) {
          store.location = { type: "Point", coordinates: [coords.lng, coords.lat] };
        }
      } catch (coordErr) {
        console.warn("⚠️ Failed to update coordinates:", coordErr.message);
      }
    }

    store.updatedBy = req.user._id;
    await store.save();

    return res.status(200).json({
      success: true,
      message: "Store details updated successfully" + (shouldUpdateShiprocket ? " with Shiprocket pickup address" : ""),
      data: store,
    });
  } catch (error) {
    console.error("Update store error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

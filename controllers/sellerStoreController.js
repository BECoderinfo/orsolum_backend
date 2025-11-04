import Store from "../models/Store.js";
import ShiprocketService from "../helper/shiprocketService.js";
import { processGoogleMapsLink } from "../helper/latAndLong.js"; // optional helper
import { jsonStatus, status } from "../helper/api.responses.js";

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

    // 🏪 Create Store in DB
    const newStore = await Store.create({
      name,
      category,
      information,
      phone,
      address,
      email,
      directMe,
      location: { type: "Point", coordinates },
      createdBy: req.user._id,
      updatedBy: req.user._id,
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

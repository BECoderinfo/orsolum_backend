import SlotBooking from "../models/SlotBooking.js";
import Store from "../models/Store.js";
import Product from "../models/Product.js";
import StoreCategory from "../models/StoreCategory.js";
import { jsonStatus, status } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";

// Helper function to check if category is automobile
export const isAutomobileCategory = (categoryName) => {
  if (!categoryName) return false;
  const name = categoryName.toLowerCase().trim();
  return name.includes("automobile") || 
         name.includes("automobiles") ||
         name.includes("bike") || 
         name.includes("bikes") ||
         name.includes("car") || 
         name.includes("cars") ||
         name.includes("vehicle") ||
         name.includes("vehicles") ||
         name.includes("auto") ||
         name.includes("two wheeler") ||
         name.includes("two-wheeler") ||
         name.includes("four wheeler") ||
         name.includes("four-wheeler");
};

// Create Slot Booking (User App)
export const createSlotBooking = async (req, res) => {
  try {
    const { storeId, productId, preferredDate, preferredTime, message } = req.body;

    if (!storeId || !productId || !preferredDate || !preferredTime) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Store ID, Product ID, Preferred Date and Time are required"
      });
    }

    // Verify store exists
    const store = await Store.findById(storeId).populate("category");
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found"
      });
    }

    // Check if store category is automobile
    const category = await StoreCategory.findById(store.category);
    if (!category) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid store category"
      });
    }

    if (!isAutomobileCategory(category.name)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Slot booking is only available for automobile stores"
      });
    }

    // Verify product exists and belongs to store
    const product = await Product.findById(productId);
    if (!product || product.storeId.toString() !== storeId.toString()) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Product not found or does not belong to this store"
      });
    }

    // Create slot booking
    const slotBooking = await SlotBooking.create({
      createdBy: req.user._id,
      storeId,
      productId,
      // store/product snapshots keep API responses populated even if refs go missing
      storeDetails: {
        _id: store._id,
        name: store.name,
        phone: store.phone,
        address: store.address,
        email: store.email
      },
      productDetails: {
        _id: product._id,
        productName: product.productName,
        primaryImage: product.primaryImage,
        sellingPrice: product.sellingPrice,
        mrp: product.mrp
      },
      userName: req.user.name || "User",
      userPhone: req.user.phone,
      userEmail: req.user.email,
      preferredDate: new Date(preferredDate),
      preferredTime,
      message: message || "",
      status: "pending"
    });

    return res.status(status.Create).json({
      status: jsonStatus.Create,
      success: true,
      message: "Slot booking created successfully",
      data: slotBooking
    });
  } catch (error) {
    console.error("❌ Error creating slot booking:", error);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
    return catchError("createSlotBooking", error, req, res);
  }
};

// Get Seller Inquiries (Seller Panel)
export const getSellerInquiries = async (req, res) => {
  try {
    // Get seller's store
    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found. Please create a store first."
      });
    }

    // Get all inquiries for this store
    const inquiries = await SlotBooking.find({ storeId: store._id })
      .populate("createdBy", "name phone email")
      .populate("productId", "productName primaryImage sellingPrice mrp")
      .sort({ createdAt: -1 })
      .lean();

    // Ensure product/store data is always present for seller view
    const normalizedInquiries = inquiries.map((inquiry) => ({
      ...inquiry,
      storeId: inquiry.storeId || inquiry.storeDetails || null,
      productId: inquiry.productId || inquiry.productDetails || null
    }));

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: normalizedInquiries
    });
  } catch (error) {
    console.error("❌ Error fetching seller inquiries:", error);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
    return catchError("getSellerInquiries", error, req, res);
  }
};

// Update Inquiry Status (Seller Panel)
export const updateInquiryStatus = async (req, res) => {
  try {
    const { inquiryId } = req.params;
    const { status: newStatus, sellerNotes } = req.body;

    if (!inquiryId) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Inquiry ID is required"
      });
    }

    const validStatuses = ["pending", "contacted", "done", "cancelled"];
    if (newStatus && !validStatuses.includes(newStatus)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    // Verify inquiry belongs to seller's store
    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found"
      });
    }

    const inquiry = await SlotBooking.findById(inquiryId);
    if (!inquiry) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Inquiry not found"
      });
    }

    if (inquiry.storeId.toString() !== store._id.toString()) {
      return res.status(status.Forbidden).json({
        status: jsonStatus.Forbidden,
        success: false,
        message: "You don't have permission to update this inquiry"
      });
    }

    // Update status
    if (newStatus) {
      inquiry.status = newStatus;
      
      // Set timestamps based on status
      if (newStatus === "contacted" && !inquiry.contactedAt) {
        inquiry.contactedAt = new Date();
      }
      if (newStatus === "done" && !inquiry.completedAt) {
        inquiry.completedAt = new Date();
      }
    }

    if (sellerNotes !== undefined) {
      inquiry.sellerNotes = sellerNotes;
    }

    await inquiry.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Inquiry status updated successfully",
      data: inquiry
    });
  } catch (error) {
    console.error("❌ Error updating inquiry status:", error);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
    return catchError("updateInquiryStatus", error, req, res);
  }
};

// Delete Inquiry (Seller Panel)
export const deleteInquiry = async (req, res) => {
  try {
    const { inquiryId } = req.params;

    if (!inquiryId) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Inquiry ID is required"
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

    const inquiry = await SlotBooking.findById(inquiryId);
    if (!inquiry) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Inquiry not found"
      });
    }

    if (inquiry.storeId.toString() !== store._id.toString()) {
      return res.status(status.Forbidden).json({
        status: jsonStatus.Forbidden,
        success: false,
        message: "You don't have permission to delete this inquiry"
      });
    }

    await SlotBooking.deleteOne({ _id: inquiryId });

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Inquiry removed successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting inquiry:", error);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
  }
};

// Get User's Slot Bookings (User App)
export const getUserSlotBookings = async (req, res) => {
  try {
    const bookings = await SlotBooking.find({ createdBy: req.user._id })
      .populate("storeId", "name address phone email")
      .populate("productId", "productName primaryImage")
      .sort({ createdAt: -1 })
      .lean();

    // Fill null store/product fields with stored snapshots for consistent UI
    const normalizedBookings = bookings.map((booking) => ({
      ...booking,
      storeId: booking.storeId || booking.storeDetails || null,
      productId: booking.productId || booking.productDetails || null
    }));

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: normalizedBookings
    });
  } catch (error) {
    console.error("❌ Error fetching user slot bookings:", error);
    return res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message
    });
    return catchError("getUserSlotBookings", error, req, res);
  }
};


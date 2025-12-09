import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const AdSchema = new mongoose.Schema(
  {
    // Who created this ad
    sellerId: {
      type: ObjectId,
      ref: "user",
    },
    storeId: {
      type: ObjectId,
      ref: "store",
    },
    productId: {
      type: ObjectId,
      ref: "product",
    },

    // Basic details
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      enum: ["banner", "popup", "offer_bar", "crazy_deals", "trending_items", "popular_categories", "stores_near_me", "promotional_banner"],
      required: true,
    },
    images: [
      {
        type: String,
      },
    ],
    // Optional videos (mp4) or GIFs
    videos: [
      {
        type: String,
      },
    ],
    // Optional videos (mp4) or GIFs (can also be in images, but this is explicit)
    videos: [
      {
        type: String,
      },
    ],

    // Run time configuration
    totalRunDays: {
      type: Number,
      required: true,
      min: 1,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    scheduledStartDate: {
      type: Date,
      // Optional: If provided, ad will activate on this date instead of immediately after payment
    },

    // Inquiry / additional info from seller
    inquiry: {
      type: String,
      trim: true,
    },

    // Status & lifecycle
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "active", "completed", "cancelled"],
      default: "pending",
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedBy: {
      type: String,
      enum: ["admin", "seller"],
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    expiryNotified: {
      type: Boolean,
      default: false,
    },

    // Payment info (offline / manual)
    amount: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    paymentReference: {
      type: String,
      trim: true,
    },

    // Admin meta
    createdByAdmin: {
      type: ObjectId,
      ref: "admin",
    },
    approvedBy: {
      type: ObjectId,
      ref: "admin",
    },
  },
  {
    timestamps: true,
  }
);

AdSchema.index({ sellerId: 1, createdAt: -1 });
AdSchema.index({ status: 1, endDate: 1 });

const Ad = mongoose.model("ad", AdSchema);

export default Ad;



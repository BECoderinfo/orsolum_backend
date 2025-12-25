import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const AdSchema = new mongoose.Schema(
  {
    // Who created this ad
    // For backward compatibility, keeping sellerId
    sellerId: {
      type: ObjectId,
      ref: "user",
    },
    // New fields for flexible ad ownership
    adOwnerType: {
      type: String,
      enum: ["seller", "retailer"],
      required: function() {
        // Required if sellerId is not present
        return !this.sellerId;
      },
      index: true
    },
    adOwnerId: {
      type: ObjectId,
      ref: "user",
      required: function() {
        // Required if sellerId is not present
        return !this.sellerId;
      },
      index: true
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
      enum: ["crazy_deals", "trending_items", "popular_categories", "stores_near_me", "promotional_banner"],
      required: true,
    },
    images: [
      {
        type: String,
      },
    ],
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
      enum: ["admin", "seller", "retailer"],
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
    paymentDeadline: {
      type: Date,
      // 48 hours deadline from approval - if not paid, ad will be deleted
    },
    isDead: {
      type: Boolean,
      default: false,
      // Mark as dead if payment deadline passed without payment
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
AdSchema.index({ adOwnerType: 1, adOwnerId: 1, createdAt: -1 });
AdSchema.index({ adOwnerType: 1, adOwnerId: 1, status: 1, endDate: 1 });

// Static method to check for overlapping ads
AdSchema.statics.hasOverlappingAd = async function(location, startDate, endDate, excludeAdId = null, adOwnerType = null, adOwnerId = null) {
  const query = {
    location: location,
    status: { $in: ['active', 'approved'] }, // Only check active and approved ads
    deleted: { $ne: true },
    isDead: { $ne: true },
    $and: [
      { $or: [
        { startDate: { $lte: endDate } },
        { startDate: { $exists: false } }
      ]},
      { $or: [
        { endDate: { $gte: startDate } },
        { endDate: { $exists: false } }
      ]}
    ]
  };

  // Add owner type and ID to prevent cross-owner ad conflicts
  if (adOwnerType && adOwnerId) {
    query.adOwnerType = adOwnerType;
    query.adOwnerId = adOwnerId;
  }
  // For backward compatibility, if no owner type is provided, don't add owner-specific filters
  // This allows the function to work for both old and new ad types

  // Exclude the current ad if provided (for updates)
  if (excludeAdId) {
    query._id = { $ne: excludeAdId };
  }

  const overlappingAd = await this.findOne(query);
  return !!overlappingAd;
};

const Ad = mongoose.model("ad", AdSchema);

export default Ad;



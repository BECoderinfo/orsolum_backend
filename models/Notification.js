import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const NotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["info", "order", "payout", "system", "promo", "alert"],
      default: "info",
    },
    image: {
      type: String,
    },
    action: {
      label: { type: String },
      type: {
        type: String,
        enum: ["none", "screen", "url", "order", "store"],
        default: "none",
      },
      value: { type: String },
    },
    targetRoles: {
      type: [String],
      default: ["retailer"],
    },
    targetUserIds: [
      {
        type: ObjectId,
        ref: "user",
      },
    ],
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readBy: [
      {
        userId: { type: ObjectId, ref: "user" },
        readAt: { type: Date, default: Date.now },
      },
    ],
    dismissedByUserIds: [
      {
        type: ObjectId,
        ref: "user",
      },
    ],
    expiresAt: {
      type: Date,
    },
    createdBy: {
      type: ObjectId,
      ref: "admin",
    },
  },
  { timestamps: true }
);

NotificationSchema.index({ createdAt: -1 });

const Notification = mongoose.model("notification", NotificationSchema);

export default Notification;


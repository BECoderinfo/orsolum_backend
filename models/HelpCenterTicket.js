import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const HelpCenterTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
    },
    sellerId: {
      type: ObjectId,
      ref: "user",
      required: true,
    },
    storeId: {
      type: ObjectId,
      ref: "store",
      required: true,
    },
    orderId: {
      type: ObjectId,
      ref: "order",
    },
    orderNumber: {
      type: String,
      trim: true,
    },
    productName: {
      type: String,
      trim: true,
    },
    issueType: {
      type: String,
      enum: ["rto_issue", "wrong_product", "payment_hold", "other"],
      default: "other",
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    lossAmount: {
      type: Number,
      default: 0,
    },
    attachments: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    updates: [
      {
        message: { type: String, trim: true },
        addedBy: {
          type: String,
          enum: ["seller", "admin"],
          default: "seller",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

HelpCenterTicketSchema.pre("save", function (next) {
  if (!this.ticketId) {
    const randomSuffix = Math.floor(Math.random() * 900) + 100;
    this.ticketId = `TKT-${Date.now().toString().slice(-6)}-${randomSuffix}`;
  }
  next();
});

const HelpCenterTicket = mongoose.model(
  "help_center_ticket",
  HelpCenterTicketSchema
);

export default HelpCenterTicket;


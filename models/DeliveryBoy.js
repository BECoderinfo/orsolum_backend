import mongoose from "mongoose";

const DeliveryBoySchema = new mongoose.Schema({
  // Basic Registration Info
  phone: { type: String, required: true, unique: true },
  state: { type: String, required: true },
  city: { type: String, required: true },

  // Personal Info (optional, updated later)
  firstName: { type: String },
  lastName: { type: String },
  dob: { type: Date },
  email: { type: String, unique: true, sparse: true },
  password: { type: String }, // required only after login setup
  image: { type: String },
  aadharNumber: { type: String, unique: true, sparse: true },
  panNumber: { type: String, unique: true, sparse: true },
  employeeId: { type: String, unique: true, sparse: true },

  // Work Info
  workType: { type: mongoose.Schema.Types.ObjectId, ref: "WorkHours" },
  workCity: { type: String },
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number }
  },
  assignedOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
  availabilityStatus: {
    type: String,
    enum: ["available", "on_delivery", "offline"],
    default: "available"
  },
  shiftTiming: {
    start: { type: Date },
    end: { type: Date }
  },

  // Vehicle Details
  vehicleType: { type: String, enum: ["bike", "scooter", "bicycle", "car"] },
  vehicleNumber: { type: String },
  licenseNumber: { type: String },
  rcBook: { type: String },

  // Payment & Earnings
  walletBalance: { type: Number, default: 0 },
  paymentMethod: {
    type: String,
    enum: ["bank", "upi", "cash"],
    default: "upi"
  },
  bankDetails: {
    accountNumber: { type: String },
    ifscCode: { type: String },
    bankName: { type: String },
    upiId: { type: String }
  },

  // Performance & Ratings
  rating: { type: Number, default: 0 },
  totalDeliveries: { type: Number, default: 0 },
  successRate: { type: Number, default: 100 },

  // Security & Tracking
  lastLogin: { type: Date },
  deviceToken: { type: String },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false }

}, { timestamps: true });

const DeliveryBoy = mongoose.model("DeliveryBoy", DeliveryBoySchema);

export default DeliveryBoy;

import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const DonationOptionSchema = new mongoose.Schema({
  amount: {
    type: mongoose.Schema.Types.Mixed, // Can be number or "other"
    required: true
  },
  bestChoice: {
    type: Boolean,
    default: false
  }
});

const DonationSettingsSchema = new mongoose.Schema({
  donationEnabled: {
    type: Boolean,
    default: false
  },
  donationOptions: [DonationOptionSchema],
  minDonationAmount: {
    type: Number,
    default: 1
  },
  maxDonationAmount: {
    type: Number,
    default: 1000
  },
  defaultDonationAmount: {
    type: Number,
    default: 0
  },
  donationLabel: {
    type: String,
    default: "Add a Touch of Green to Your Purchase"
  },
  donationDescription: {
    type: String,
    default: "Your contribution helps plant trees and support environmental causes"
  },
  // Settings updated by
  updatedBy: {
    type: ObjectId,
    ref: 'admin',
  }
}, { timestamps: true });

// Singleton pattern - only one donation settings document
DonationSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({}).lean();
  if (!doc) {
    doc = await this.create({
      donationEnabled: false,
      donationOptions: [
        { amount: 10, bestChoice: false },
        { amount: 20, bestChoice: true },
        { amount: 50, bestChoice: false },
        { amount: 100, bestChoice: false },
        { amount: "other", bestChoice: false }
      ],
      minDonationAmount: 1,
      maxDonationAmount: 1000,
      defaultDonationAmount: 0,
      donationLabel: "Add a Touch of Green to Your Purchase",
      donationDescription: "Your contribution helps plant trees and support environmental causes"
    });
  }
  return doc;
};

// Method to update donation settings
DonationSettingsSchema.statics.updateSettings = async function (settingsData, adminId) {
  let doc = await this.findOne({});
  if (doc) {
    // Update existing document
    Object.assign(doc, settingsData, { updatedBy: adminId });
    await doc.save();
  } else {
    // Create new document
    doc = await this.create({
      ...settingsData,
      updatedBy: adminId
    });
  }
  return doc;
};

const DonationSettings = mongoose.model("donation_settings", DonationSettingsSchema);

export default DonationSettings;
import mongoose from "mongoose";

const AdConfigSchema = new mongoose.Schema(
  {
    locationRates: {
      crazy_deals: { type: Number, default: 0 },
      trending_items: { type: Number, default: 0 },
      popular_categories: { type: Number, default: 0 },
      stores_near_me: { type: Number, default: 0 },
      promotional_banner: { type: Number, default: 0 },
    },
    bankDetails: {
      accountName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      ifsc: { type: String, default: "" },
      bankName: { type: String, default: "" },
      branch: { type: String, default: "" },
      upiId: { type: String, default: "" },
      note: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

// Singleton config
AdConfigSchema.statics.getSingleton = async function () {
  let doc = await this.findOne().lean();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

const AdConfig = mongoose.model("ad_config", AdConfigSchema);

export default AdConfig;



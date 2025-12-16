import mongoose from "mongoose";

const AppSettingsSchema = new mongoose.Schema(
  {
    // Primary theme color (main brand color)
    primaryColor: {
      type: String,
      default: "#1F6728", // Default green color
      required: true,
    },
    // Secondary color (for backgrounds, accents)
    secondaryColor: {
      type: String,
      default: "#1f67293e", // Default semi-transparent green
    },
    // Animation preferences
    animations: {
      // Animation type: 'none', 'fade', 'slide', 'bounce', 'pulse', 'spin'
      type: {
        type: String,
        enum: ['none', 'fade', 'slide', 'bounce', 'pulse', 'spin', 'float'],
        default: 'none',
      },
      // Animation duration in seconds
      duration: {
        type: Number,
        default: 0.5,
        min: 0.1,
        max: 3,
      },
      // Enable/disable animations globally
      enabled: {
        type: Boolean,
        default: false,
      },
      // Specific animations for different elements
      headerAnimation: {
        type: String,
        enum: ['none', 'fade', 'slide', 'bounce'],
        default: 'none',
      },
      productCardAnimation: {
        type: String,
        enum: ['none', 'fade', 'slide', 'bounce', 'float'],
        default: 'none',
      },
      buttonAnimation: {
        type: String,
        enum: ['none', 'pulse', 'bounce', 'scale'],
        default: 'none',
      },
    },
    // Additional theme colors
    themeColors: {
      darkColor: {
        type: String,
        default: "#333",
      },
      lightColor: {
        type: String,
        default: "#fff",
      },
      successColor: {
        type: String,
        default: "#0DB14B",
      },
      warningColor: {
        type: String,
        default: "#FFA500",
      },
      errorColor: {
        type: String,
        default: "#f4324c",
      },
    },
    // Optional animation/video asset to be used in user app (e.g. intro animation)
    animationVideoUrl: {
      type: String,
      default: null,
    },
    // Active status
    isActive: {
      type: Boolean,
      default: true,
    },
    // Settings updated by
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'admin',
    },
  },
  { timestamps: true }
);

// Singleton pattern - only one settings document
AppSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ isActive: true }).lean();
  if (!doc) {
    doc = await this.create({
      primaryColor: "#1F6728",
      secondaryColor: "#1f67293e",
      animations: {
        type: 'none',
        enabled: false,
      },
    });
  }
  return doc;
};

// Method to update settings
AppSettingsSchema.statics.updateSettings = async function (settingsData, adminId) {
  // Deactivate all existing settings
  await this.updateMany({ isActive: true }, { isActive: false });
  
  // Create new active settings
  const newSettings = await this.create({
    ...settingsData,
    updatedBy: adminId,
    isActive: true,
  });
  
  return newSettings;
};

const AppSettings = mongoose.model("app_settings", AppSettingsSchema);

export default AppSettings;

import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const CoinConfigurationSchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    subCategoryId: {
        type: ObjectId,
        ref: 'product_sub_category',
        required: true
    },
    coinType: {
        type: String,
        enum: ["percentage", "fixed"],
        default: "percentage",
        required: true
    },
    coinValue: {
        type: Number,
        required: true,
        min: 0
    },
    enabled: {
        type: Boolean,
        default: true
    },
    deleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Index for faster lookups
CoinConfigurationSchema.index({ subCategoryId: 1, deleted: 1, enabled: 1 });

const CoinConfiguration = mongoose.model('coin_configuration', CoinConfigurationSchema);

export default CoinConfiguration;


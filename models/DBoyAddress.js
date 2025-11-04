import mongoose from "mongoose";

const workAddressSchema = new mongoose.Schema(
    {
        flatHouseNo: {
            type: String,
            required: true,
            trim: true,
        },
        streetName: {
            type: String,
            required: true,
            trim: true,
        },
        landmark: {
            type: String,
            trim: true,
        },
        city: {
            type: String,
            required: true,
            trim: true,
        },
        state: {
            type: String,
            required: true,
            trim: true,
        },
        addressType: {
            type: String,
            enum: ["Home", "Work", "Other"],
            default: "Work",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DeliveryBoy",
            required: true,
        },
    },
    { timestamps: true }
);

const DBoyAddress = mongoose.model("DBoyAddress", workAddressSchema);

export default DBoyAddress;
import mongoose from "mongoose";

const OtpSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: false,
    },
    email: {
        type: String,
        required: false,
    },
    otp: {
        type: String,
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    verified: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

const OtpModel = mongoose.model('otp', OtpSchema);

export default OtpModel;
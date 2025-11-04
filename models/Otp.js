import mongoose from "mongoose";

const OtpSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
    },
    otp: {
        type: String,
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    }
}, { timestamps: true });

const OtpModel = mongoose.model('otp', OtpSchema);

export default OtpModel;
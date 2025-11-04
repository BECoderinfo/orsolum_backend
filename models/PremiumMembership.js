import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const PremiumMembershipSchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    updatedBy: {
        type: ObjectId,
        ref: 'admin',
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    perMonth: {
        type: Number,
        required: true
    }
}, { timestamps: true });

const PremiumMembership = mongoose.model('premium_membership', PremiumMembershipSchema);

export default PremiumMembership;
import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const AddressSchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    name: {
        type: String,
        default: "Home"
    },
    number: {
        type: String,
        default: ""
    },
    address_1: {
        type: String,
        required: true
    },
    mapLink: {
        type: String,
        default: ""
    },
    lat: {
        type: String,
        default: "0"
    },
    long: {
        type: String,
        default: "0"
    },
    flatHouse: {
        type: String,
        default: ""
    },
    landmark: {
        type: String
    },
    pincode: {
        type: String,
        required: true
    },
    state: {
        type: String
    },
    city: {
        type: String
    },
    type: {
        type: String
    }
}, { timestamps: true });

const Address = mongoose.model('address', AddressSchema);

export default Address;
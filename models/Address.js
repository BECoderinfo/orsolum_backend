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
        required: true
    },
    number: {
        type: String,
        required: true
    },
    address_1: {
        type: String,
        required: true
    },
    mapLink: {
        type: String,
        required: true
    },
    lat: {
        type: String,
        required: true
    },
    long: {
        type: String,
        required: true
    },
    flatHouse: {
        type: String,
        required: true
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
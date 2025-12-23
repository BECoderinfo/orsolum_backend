import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const AddressSchema = new mongoose.Schema({
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true,
        index: true
    },
    name: {
        type: String,
        default: "Home",
        trim: true,
        maxlength: 50
    },
    number: {
        type: String,
        default: "",
        trim: true
    },
    deleted: {
        type: Boolean,
        default: false,
        index: true
    },
    address_1: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    mapLink: {
        type: String,
        default: "",
        trim: true
    },
    lat: {
        type: String,
        default: "0",
        trim: true,
        validate: {
            validator: function(v) {
                return v === "0" || /^-?\d+(\.\d+)?$/.test(v);
            },
            message: props => `${props.value} is not a valid latitude!`
        }
    },
    long: {
        type: String,
        default: "0",
        trim: true,
        validate: {
            validator: function(v) {
                return v === "0" || /^-?\d+(\.\d+)?$/.test(v);
            },
            message: props => `${props.value} is not a valid longitude!`
        }
    },
    flatHouse: {
        type: String,
        default: "",
        trim: true,
        maxlength: 100
    },
    landmark: {
        type: String,
        trim: true,
        maxlength: 100
    },
    pincode: {
        type: String,
        required: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^\d{6}$/.test(v);
            },
            message: props => `${props.value} is not a valid 6-digit pincode!`
        }
    },
    state: {
        type: String,
        trim: true,
        maxlength: 50
    },
    city: {
        type: String,
        trim: true,
        maxlength: 50
    },
    type: {
        type: String,
        enum: ["Home", "Work", "Other"],
        default: "Home"
    },
    country: {
        type: String,
        default: "India",
        trim: true,
        maxlength: 50
    }
}, { 
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
});

// Add indexes for better query performance
AddressSchema.index({ createdBy: 1, type: 1 });
AddressSchema.index({ pincode: 1 });
AddressSchema.index({ city: 1, state: 1 });

const Address = mongoose.model('address', AddressSchema);

export default Address;
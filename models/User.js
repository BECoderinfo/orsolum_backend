import mongoose from "mongoose";
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        maxlength: 100,
        trim: true
    },
    shareHandle: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    state: {
        type: String,
        trim: true,
        maxlength: 20
    },
    role: {
        type: String,
        enum: ['user', 'retailer', 'seller'],
        default: 'user'
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    password: {
        type: String
    },
    city: {
        type: String,
        trim: true,
        maxlength: 20
    },
    phone: {
        type: String,
        trim: true,
        required: true
    },
    image: {
        type: String
    },
    entity: {
        type: String
    },
    address: {
        type: String
    },
    gst: {
        type: String
    },
    deleted: {
        type: Boolean,
        default: false
    },
    active: {
        type: Boolean,
        default: true
    },
    lat: {
        type: String
    },
    long: {
        type: String
    },
    coins: {
        type: Number,
        default: 0
    },
    isPremium: {
        type: Boolean,
        default: false
    },
    expiryDate: {
        type: Date
    },
    cardNumber: {
        type: Number
    }
}, { timestamps: true });

// Hash password before saving (only for sellers)
UserSchema.pre('save', function (next) {
    if (this.isModified('password') && this.password && this.role === 'seller') {
        const salt = bcrypt.genSaltSync(10);
        this.password = bcrypt.hashSync(this.password, salt);
    }
    next();
});

const User = mongoose.model('user', UserSchema);

export default User;
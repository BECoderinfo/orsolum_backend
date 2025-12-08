import mongoose from "mongoose";
import bcrypt from 'bcrypt';

const AdminSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ["admin", "superadmin"],
        default: "admin"
    }
}, { timestamps: true });

AdminSchema.pre('save', function (next) {
    if (this.isModified('password')) {
        const salt = bcrypt.genSaltSync(10);
        this.password = bcrypt.hashSync(this.password, salt);
    }
    next();
});

const Admin = mongoose.model('admin', AdminSchema);

export default Admin;
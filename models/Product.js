import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const ProductSchema = new mongoose.Schema({
    primaryImage: {
        type: String
    },
    productImages: [
        {
            type: String
        }
    ],
    productName: {
        type: String,
        required: true
    },
    qty: {
        type: String
    },
    companyName: {
        type: String,
        required: true
    },
    mrp: {
        type: Number,
        required: true
    },
    sellingPrice: {
        type: Number,
        required: true
    },
    information: {
        type: String,
        required: true
    },
    createdBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    updatedBy: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    storeId: {
        type: ObjectId,
        ref: 'store',
        required: true
    },
    deleted: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ["P", "A", "R"], // P = Pending, A = Accepted, R = Rejected
        default: "A" // Auto-approved: products show immediately after creation
    },
    details: [
        {
            title: String,
            details: String,
            icon: String
        }
    ],
    categoryId: {
        type: ObjectId,
        ref: 'product_category',
        default: null
    },
    subCategoryId: {
        type: ObjectId,
        ref: 'product_sub_category',
        default: null
    },
    stock: {
        type: Number,
        default: 0,
        min: 0
    },
    totalStock: {
        type: Number,
        default: 0,
        min: 0
    },
    lowStockThreshold: {
        type: Number,
        default: 5,
        min: 0
    },
    variantTemplate: {
        type: String,
        default: null
    },
    variantGroups: [
        {
            key: {
                type: String,
                trim: true
            },
            name: {
                type: String,
                trim: true
            },
            options: [
                {
                    type: String,
                    trim: true
                }
            ]
        }
    ],
    offPer: {
        type: String
    },
    units: [
        {
            label: {
                type: String,
                trim: true
            },
            qty: {
                type: String,
                trim: true
            },
            mrp: Number,
            sellingPrice: Number,
            offPer: String
        }
    ],
    // Automobile/Car/Bike specific fields
    vehicleDetails: {
        vehicleType: {
            type: String,
            enum: ["car", "bike", "scooter", "motorcycle", "suv", "sedan", "hatchback", "other"],
            default: null
        },
        brand: {
            type: String,
            trim: true
        },
        model: {
            type: String,
            trim: true
        },
        year: {
            type: Number,
            min: 1900,
            max: 2100
        },
        mileage: {
            type: String,
            trim: true // e.g., "15 kmpl", "50000 km"
        },
        fuelType: {
            type: String,
            enum: ["petrol", "diesel", "electric", "hybrid", "cng", "lpg"],
            default: null
        },
        transmission: {
            type: String,
            enum: ["manual", "automatic", "cvt", "amt"],
            default: null
        },
        color: {
            type: String,
            trim: true
        },
        engineCapacity: {
            type: String,
            trim: true // e.g., "150cc", "1.5L"
        },
        seatingCapacity: {
            type: Number,
            min: 1,
            max: 50
        },
        registrationNumber: {
            type: String,
            trim: true
        },
        registrationYear: {
            type: Number,
            min: 1900,
            max: 2100
        },
        ownerNumber: {
            type: Number,
            min: 1,
            max: 50 // 1st owner, 2nd owner, etc. (increased max to handle edge cases)
        },
        condition: {
            type: String,
            enum: ["new", "used", "certified"],
            default: null
        },
        kmDriven: {
            type: Number,
            min: 0
        },
        insuranceValidTill: {
            type: Date
        },
        rto: {
            type: String,
            trim: true // RTO location
        }
    }
}, { timestamps: true });

const Product = mongoose.model('product', ProductSchema);

export default Product;
import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const PaymentSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ["LocalStore", "OnlineStore", "Premium"]
    },
    paymentResponse: {}, // Fixed typo: was paymentResonse
    userId: {
        type: ObjectId,
        ref: 'user',
        required: true
    },
    orderId: {
        type: ObjectId,
        ref: 'order'
    },
    onlineOrderId: {
        type: ObjectId,
        ref: 'online_order'
    },
    orderIdString: {
        type: String
    },
    paymentStatus: {
        type: String,
        enum: ["SUCCESS", "FAILED", "PENDING"],
        required: true,
        default: "PENDING"
    },
    cfoOrder_id: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    refund: {
        type: Boolean,
        default: false
    },
    refundId: {
        type: String
    },
    collectedBy: {
        type: ObjectId,
        ref: 'DeliveryBoy'
    },
    collectedAt: {
        type: Date
    },
    paymentMethod: {
        type: String,
        enum: [
            "COD", 
            "ONLINE", 
            "BANK_TRANSFER", 
            "UPI", 
            "CREDIT_CARD", 
            "DEBIT_CARD", 
            "DIGITAL_WALLET",
            "NET_BANKING",
            "QR_CODE"
        ],
        default: "ONLINE"
    },
    paymentGateway: {
        type: String,
        enum: ["CASHFREE", "RAZORPAY", "UPI_DIRECT", "QR_CODE", "COD"],
        default: "CASHFREE"
    },
    status: {
        type: String,
        enum: ["SUCCESS", "PENDING", "SETTLED", "FAILED"],
        default: "PENDING"
    },
    settledAt: {
        type: Date
    },
    // QR Code specific fields
    qrCodeData: {
        type: String
    },
    qrCodeUrl: {
        type: String
    },
    // Digital Wallet fields
    walletProvider: {
        type: String,
        enum: ["PAYTM", "PHONEPE", "GOOGLE_PAY", "AMAZON_PAY", "BHIM"]
    },
    walletTransactionId: {
        type: String
    },
    // Bank Transfer fields
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        transactionId: String
    },
    // Card details (encrypted)
    cardDetails: {
        lastFourDigits: String,
        cardType: String,
        expiryMonth: String,
        expiryYear: String
    },
    // UPI details
    upiDetails: {
        upiId: String,
        transactionId: String,
        referenceId: String
    }
}, { timestamps: true });

const Payment = mongoose.model('payment', PaymentSchema);
export default Payment;
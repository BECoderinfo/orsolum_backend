import Payment from "../models/Payment.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { status, jsonStatus } from "../helper/api.responses.js";
import { catchError } from '../helper/service.js';
import axios from "axios";
import QRCode from "qrcode";

// Generate QR Code Payment
export const generateQRPayment = async (req, res) => {
    try {
        const { orderId, amount } = req.body;
        const userId = req.user._id;

        if (!orderId || !amount) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order ID and amount are required"
            });
        }

        // Generate UPI QR Code
        const upiId = process.env.COMPANY_UPI_ID || "test@upi";
        const companyName = process.env.COMPANY_UPI_NAME || "Orsolum";
        const transactionId = `TXN${Date.now()}`;
        
        const upiString = `upi://pay?pa=${upiId}&pn=${companyName}&am=${amount}&cu=INR&tn=Order-${orderId}&tr=${transactionId}`;
        
        // Generate QR Code
        const qrCodeDataURL = await QRCode.toDataURL(upiString);
        
        // Save payment record
        const payment = new Payment({
            type: "LocalStore",
            userId: userId,
            orderId: orderId,
            amount: amount,
            paymentMethod: "QR_CODE",
            paymentGateway: "QR_CODE",
            paymentStatus: "PENDING",
            cfoOrder_id: transactionId,
            qrCodeData: upiString,
            qrCodeUrl: qrCodeDataURL
        });
        
        await payment.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "QR Code generated successfully",
            data: {
                qrCodeUrl: qrCodeDataURL,
                qrCodeData: upiString,
                transactionId: transactionId,
                amount: amount,
                upiId: upiId
            }
        });
    } catch (error) {
        return catchError('generateQRPayment', error, req, res);
    }
};

// Process Digital Wallet Payment
export const processDigitalWalletPayment = async (req, res) => {
    try {
        const { orderId, amount, walletProvider, walletTransactionId } = req.body;
        const userId = req.user._id;

        if (!orderId || !amount || !walletProvider || !walletTransactionId) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "All fields are required for digital wallet payment"
            });
        }

        // Verify wallet transaction (implement according to wallet provider)
        const isVerified = await verifyWalletTransaction(walletProvider, walletTransactionId, amount);
        
        if (!isVerified) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Invalid wallet transaction"
            });
        }

        // Save payment record
        const payment = new Payment({
            type: "LocalStore",
            userId: userId,
            orderId: orderId,
            amount: amount,
            paymentMethod: "DIGITAL_WALLET",
            paymentGateway: walletProvider,
            paymentStatus: "SUCCESS",
            cfoOrder_id: walletTransactionId,
            walletProvider: walletProvider,
            walletTransactionId: walletTransactionId
        });
        
        await payment.save();

        // Update order payment status
        await Order.findByIdAndUpdate(orderId, { paymentStatus: "SUCCESS" });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Digital wallet payment processed successfully",
            data: {
                transactionId: walletTransactionId,
                amount: amount,
                walletProvider: walletProvider
            }
        });
    } catch (error) {
        return catchError('processDigitalWalletPayment', error, req, res);
    }
};

// Process Bank Transfer Payment
export const processBankTransferPayment = async (req, res) => {
    try {
        const { 
            orderId, 
            amount, 
            accountNumber, 
            ifscCode, 
            bankName, 
            transactionId 
        } = req.body;
        const userId = req.user._id;

        if (!orderId || !amount || !accountNumber || !ifscCode || !bankName || !transactionId) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "All bank transfer fields are required"
            });
        }

        // Save payment record
        const payment = new Payment({
            type: "LocalStore",
            userId: userId,
            orderId: orderId,
            amount: amount,
            paymentMethod: "BANK_TRANSFER",
            paymentGateway: "BANK_TRANSFER",
            paymentStatus: "SUCCESS",
            cfoOrder_id: transactionId,
            bankDetails: {
                accountNumber: accountNumber,
                ifscCode: ifscCode,
                bankName: bankName,
                transactionId: transactionId
            }
        });
        
        await payment.save();

        // Update order payment status
        await Order.findByIdAndUpdate(orderId, { paymentStatus: "SUCCESS" });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Bank transfer payment processed successfully",
            data: {
                transactionId: transactionId,
                amount: amount,
                bankName: bankName
            }
        });
    } catch (error) {
        return catchError('processBankTransferPayment', error, req, res);
    }
};

// Process Credit/Debit Card Payment
export const processCardPayment = async (req, res) => {
    try {
        const { 
            orderId, 
            amount, 
            cardNumber, 
            expiryMonth, 
            expiryYear, 
            cvv, 
            cardType 
        } = req.body;
        const userId = req.user._id;

        if (!orderId || !amount || !cardNumber || !expiryMonth || !expiryYear || !cvv) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "All card details are required"
            });
        }

        // Process card payment through Cashfree
        const paymentData = {
            order_currency: 'INR',
            order_amount: amount,
            order_tags: {
                forPayment: "LocalStore",
                userId: userId,
                orderId: orderId
            },
            customer_details: {
                customer_id: userId,
                customer_phone: req.user.phone?.replace('+91', '') || '9999999999'
            },
            payment_methods: ["card"],
            card_details: {
                card_number: cardNumber,
                card_expiry_month: expiryMonth,
                card_expiry_year: expiryYear,
                card_cvv: cvv
            }
        };

        const headers = {
            'x-api-version': process.env.CF_API_VERSION,
            'x-client-id': process.env.CF_CLIENT_ID,
            'x-client-secret': process.env.CF_CLIENT_SECRET,
            'Content-Type': 'application/json'
        };

        const cashFreeSession = await axios.post(process.env.CF_CREATE_PRODUCT_URL, paymentData, { headers });

        // Save payment record
        const payment = new Payment({
            type: "LocalStore",
            userId: userId,
            orderId: orderId,
            amount: amount,
            paymentMethod: cardType === "credit" ? "CREDIT_CARD" : "DEBIT_CARD",
            paymentGateway: "CASHFREE",
            paymentStatus: "PENDING",
            cfoOrder_id: cashFreeSession.data.order_id,
            cardDetails: {
                lastFourDigits: cardNumber.slice(-4),
                cardType: cardType,
                expiryMonth: expiryMonth,
                expiryYear: expiryYear
            }
        });
        
        await payment.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Card payment initiated successfully",
            data: {
                paymentSessionId: cashFreeSession.data.payment_session_id,
                orderId: cashFreeSession.data.order_id,
                amount: amount
            }
        });
    } catch (error) {
        return catchError('processCardPayment', error, req, res);
    }
};

// Process COD Payment
export const processCODPayment = async (req, res) => {
    try {
        const { orderId, amount } = req.body;
        const userId = req.user._id;

        if (!orderId || !amount) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Order ID and amount are required"
            });
        }

        // Save payment record
        const payment = new Payment({
            type: "LocalStore",
            userId: userId,
            orderId: orderId,
            amount: amount,
            paymentMethod: "COD",
            paymentGateway: "COD",
            paymentStatus: "PENDING",
            cfoOrder_id: `COD${Date.now()}`
        });
        
        await payment.save();

        // Update order payment status
        await Order.findByIdAndUpdate(orderId, { paymentStatus: "PENDING" });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "COD payment confirmed",
            data: {
                orderId: orderId,
                amount: amount,
                paymentMethod: "COD"
            }
        });
    } catch (error) {
        return catchError('processCODPayment', error, req, res);
    }
};

// Get Payment Methods List
export const getPaymentMethods = async (req, res) => {
    try {
        const paymentMethods = [
            {
                id: "qr_code",
                name: "QR Code Payment",
                description: "Scan QR code to pay via UPI",
                icon: "qr-code",
                enabled: true
            },
            {
                id: "credit_card",
                name: "Credit Card",
                description: "Pay using credit card",
                icon: "credit-card",
                enabled: true
            },
            {
                id: "debit_card",
                name: "Debit Card",
                description: "Pay using debit card",
                icon: "debit-card",
                enabled: true
            },
            {
                id: "digital_wallet",
                name: "Digital Wallet",
                description: "Pay using digital wallet (Paytm, PhonePe, etc.)",
                icon: "wallet",
                enabled: true,
                providers: ["PAYTM", "PHONEPE", "GOOGLE_PAY", "AMAZON_PAY", "BHIM"]
            },
            {
                id: "bank_transfer",
                name: "Bank Transfer",
                description: "Transfer money directly to bank account",
                icon: "bank",
                enabled: true
            },
            {
                id: "cod",
                name: "Cash on Delivery",
                description: "Pay when you receive the order",
                icon: "cash",
                enabled: true
            }
        ];

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Payment methods retrieved successfully",
            data: paymentMethods
        });
    } catch (error) {
        return catchError('getPaymentMethods', error, req, res);
    }
};

// Verify wallet transaction (implement according to wallet provider)
const verifyWalletTransaction = async (provider, transactionId, amount) => {
    // This is a placeholder implementation
    // You need to implement actual verification based on wallet provider APIs
    try {
        // Example for different wallet providers
        switch (provider) {
            case "PAYTM":
                // Implement Paytm verification API call
                return true;
            case "PHONEPE":
                // Implement PhonePe verification API call
                return true;
            case "GOOGLE_PAY":
                // Implement Google Pay verification API call
                return true;
            default:
                return false;
        }
    } catch (error) {
        console.error("Wallet verification error:", error);
        return false;
    }
};
import express from "express";
import { body } from 'express-validator';
import { userAuthentication } from "../middlewares/middleware.js";
import {
    generateQRPayment,
    processDigitalWalletPayment,
    processBankTransferPayment,
    processCardPayment,
    processCODPayment,
    getPaymentMethods
} from "../controllers/paymentController.js";

const paymentRouter = express.Router();

// Get available payment methods
paymentRouter.get('/methods/v1', getPaymentMethods);

// QR Code Payment
paymentRouter.post('/qr/generate/v1', [
    body('orderId').not().isEmpty().withMessage('Order ID is required'),
    body('amount').isNumeric().withMessage('Amount must be a number')
], userAuthentication, generateQRPayment);

// Digital Wallet Payment
paymentRouter.post('/digital-wallet/v1', [
    body('orderId').not().isEmpty().withMessage('Order ID is required'),
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('walletProvider').not().isEmpty().withMessage('Wallet provider is required'),
    body('walletTransactionId').not().isEmpty().withMessage('Wallet transaction ID is required')
], userAuthentication, processDigitalWalletPayment);

// Bank Transfer Payment
paymentRouter.post('/bank-transfer/v1', [
    body('orderId').not().isEmpty().withMessage('Order ID is required'),
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('accountNumber').not().isEmpty().withMessage('Account number is required'),
    body('ifscCode').not().isEmpty().withMessage('IFSC code is required'),
    body('bankName').not().isEmpty().withMessage('Bank name is required'),
    body('transactionId').not().isEmpty().withMessage('Transaction ID is required')
], userAuthentication, processBankTransferPayment);

// Credit/Debit Card Payment
paymentRouter.post('/card/v1', [
    body('orderId').not().isEmpty().withMessage('Order ID is required'),
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('cardNumber').isLength({ min: 16, max: 16 }).withMessage('Card number must be 16 digits'),
    body('expiryMonth').isInt({ min: 1, max: 12 }).withMessage('Expiry month must be between 1-12'),
    body('expiryYear').isInt({ min: new Date().getFullYear() }).withMessage('Invalid expiry year'),
    body('cvv').isLength({ min: 3, max: 4 }).withMessage('CVV must be 3-4 digits'),
    body('cardType').isIn(['credit', 'debit']).withMessage('Card type must be credit or debit')
], userAuthentication, processCardPayment);

// COD Payment
paymentRouter.post('/cod/v1', [
    body('orderId').not().isEmpty().withMessage('Order ID is required'),
    body('amount').isNumeric().withMessage('Amount must be a number')
], userAuthentication, processCODPayment);

export default paymentRouter;
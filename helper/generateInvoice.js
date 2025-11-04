import PDFDocument from 'pdfkit';
import AWS from 'aws-sdk';
import Order from '../models/Order.js';
import OnlineOrder from '../models/OnlineStore/OnlineOrder.js';
import { bucketCred } from '../s3.config.js';

// Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: bucketCred.accessKey,
    secretAccessKey: bucketCred.secretKey,
    region: "ap-south-1"
});

export const generateInvoice = async (orderId) => {
    try {
        const order = await Order.findById(orderId).populate('storeId').populate('createdBy');
        if (!order) {
            throw new Error('Order not found');
        }

        // Generate PDF for Invoice
        const pdfBuffer = await new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50
            });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // Add logo (you'll need to replace this with your actual logo path)
            doc.image('./orsolum_logo.png', 50, 45, { width: 100 });

            // Invoice header
            doc.fontSize(20)
               .text('INVOICE', 275, 50, { align: 'center' })
               .fontSize(10)
               .text(`Invoice #: ${order.orderId}`, 275, 80, { align: 'center' })
               .text(`Date: ${new Date().toLocaleDateString()}`, 275, 95, { align: 'center' });

            // Store and Customer Information
            doc.fontSize(12)
               .text('Store Information:', 50, 150)
               .fontSize(10)
               .text(order.storeId.name, 50, 170);

            doc.fontSize(12)
               .text('Customer Information:', 300, 150)
               .fontSize(10)
               .text(order.createdBy.name, 300, 170)
               .text(order.address.addressLine, 300, 185);

            // Table Header
            const tableTop = 250;
            doc.fontSize(10)
               .text('Product', 50, tableTop)
               .text('Price', 200, tableTop)
               .text('Quantity', 300, tableTop)
               .text('Total', 400, tableTop);

            // Draw horizontal line
            doc.moveTo(50, tableTop + 20)
               .lineTo(550, tableTop + 20)
               .stroke();

            // Table Content
            let y = tableTop + 30;
            order.productDetails.forEach(item => {
                doc.text(item.productId.toString(), 50, y)
                   .text(`₹${item.productPrice}`, 200, y)
                   .text(item.quantity.toString(), 300, y)
                   .text(`₹${item.productPrice * item.quantity}`, 400, y);
                y += 20;
            });

            // Draw horizontal line
            doc.moveTo(50, y)
               .lineTo(550, y)
               .stroke();

            // Summary Section
            y += 20;
            doc.fontSize(12)
               .text('Summary', 400, y)
               .fontSize(10)
               .text('Total Amount:', 400, y + 20)
               .text(`₹${order.summary.totalAmount}`, 500, y + 20, { align: 'right' })
               .text('Discount:', 400, y + 35)
               .text(`₹${order.summary.discountAmount}`, 500, y + 35, { align: 'right' })
               .text('Shipping Fee:', 400, y + 50)
               .text(`₹${order.summary.shippingFee}`, 500, y + 50, { align: 'right' })
               .text('Donation:', 400, y + 65)
               .text(`₹${order.summary.donate}`, 500, y + 65, { align: 'right' });

            // Grand Total
            doc.fontSize(12)
               .text('Grand Total:', 400, y + 90)
               .text(`₹${order.summary.grandTotal}`, 500, y + 90, { align: 'right' });

            // Footer
            doc.fontSize(8)
               .text('Thank you for your business!', 50, 700, { align: 'center' });

            doc.end();
        });

        // Upload PDF to S3 without ACL
        const pdfKey = `invoices/${order.orderId}.pdf`;
        const s3Params = {
            Bucket: bucketCred.bucketName,
            Key: pdfKey,
            Body: pdfBuffer,
            ContentType: 'application/pdf'
        };
        await s3.upload(s3Params).promise();

        const invoiceUrl = `https://${bucketCred.bucketName}.s3.ap-south-1.amazonaws.com/${pdfKey}`;

        // Update Order with Invoice Link
        order.invoiceUrl = invoiceUrl;
        await order.save();

        console.log('Invoice generated and uploaded:', invoiceUrl);
        return invoiceUrl;

    } catch (error) {
        console.error('Error generating invoice:', error);
        throw error;
    }
};

export const generateOnlineInvoice = async (orderId) => {
    try {
        const order = await OnlineOrder.findById(orderId).populate('createdBy');
        if (!order) {
            throw new Error('Order not found');
        }

        // Generate PDF for Invoice
        const pdfBuffer = await new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50
            });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // Add logo (you'll need to replace this with your actual logo path)
            doc.image('./orsolum_logo.png', 50, 45, { width: 100 });

            // Invoice header
            doc.fontSize(20)
               .text('INVOICE', 275, 50, { align: 'center' })
               .fontSize(10)
               .text(`Invoice #: ${order.orderId}`, 275, 80, { align: 'center' })
               .text(`Date: ${new Date().toLocaleDateString()}`, 275, 95, { align: 'center' });

            // Customer Information
            doc.fontSize(12)
               .text('Customer Information:', 50, 150)
               .fontSize(10)
               .text(order.createdBy.name, 50, 170)
               .text(order.address.addressLine, 50, 185);

            // Table Header
            const tableTop = 250;
            doc.fontSize(10)
               .text('Product', 50, tableTop)
               .text('Price', 200, tableTop)
               .text('Quantity', 300, tableTop)
               .text('Total', 400, tableTop);

            // Draw horizontal line
            doc.moveTo(50, tableTop + 20)
               .lineTo(550, tableTop + 20)
               .stroke();

            // Table Content
            let y = tableTop + 30;
            order.productDetails.forEach(item => {
                doc.text(item.productId.toString(), 50, y)
                   .text(`₹${item.productPrice}`, 200, y)
                   .text(item.quantity.toString(), 300, y)
                   .text(`₹${item.productPrice * item.quantity}`, 400, y);
                y += 20;
            });

            // Draw horizontal line
            doc.moveTo(50, y)
               .lineTo(550, y)
               .stroke();

            // Summary Section
            y += 20;
            doc.fontSize(12)
               .text('Summary', 400, y)
               .fontSize(10)
               .text('Total Amount:', 400, y + 20)
               .text(`₹${order.summary.totalAmount}`, 500, y + 20, { align: 'right' })
               .text('Coupon Discount:', 400, y + 35)
               .text(`₹${order.summary.couponCodeDiscount}`, 500, y + 35, { align: 'right' })
               .text('Shipping Fee:', 400, y + 50)
               .text(`₹${order.summary.shippingFee}`, 500, y + 50, { align: 'right' })
               .text('Donation:', 400, y + 65)
               .text(`₹${order.summary.donate}`, 500, y + 65, { align: 'right' });

            // Grand Total
            doc.fontSize(12)
               .text('Grand Total:', 400, y + 90)
               .text(`₹${order.summary.grandTotal}`, 500, y + 90, { align: 'right' });

            // Footer
            doc.fontSize(8)
               .text('Thank you for your business!', 50, 700, { align: 'center' });

            doc.end();
        });

        // Upload PDF to S3 without ACL
        const pdfKey = `invoices/${order.orderId}.pdf`;
        const s3Params = {
            Bucket: bucketCred.bucketName,
            Key: pdfKey,
            Body: pdfBuffer,
            ContentType: 'application/pdf'
        };
        await new AWS.S3().upload(s3Params).promise();

        const invoiceUrl = `https://${bucketCred.bucketName}.s3.ap-south-1.amazonaws.com/${pdfKey}`;

        // Update Order with Invoice Link
        order.invoiceUrl = invoiceUrl;
        await order.save();

        console.log('Online Invoice generated and uploaded:', invoiceUrl);
        return invoiceUrl;

    } catch (error) {
        console.error('Error generating online invoice:', error);
        throw error;
    }
};
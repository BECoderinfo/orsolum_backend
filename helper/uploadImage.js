import multer from 'multer';
import multerS3 from 'multer-s3';
import { bucketCred } from '../s3.config.js';
import { S3Client } from '@aws-sdk/client-s3';

let s3 = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: bucketCred.accessKey,
        secretAccessKey: bucketCred.secretKey,
    },
    sslEnabled: false,
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
});

export const uploadUserImage = multer({
    storage: multerS3({
        s3: s3,
        bucket: bucketCred.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, { fieldName: file.fieldname });
        },
        key: (req, file, cb) => {
            const folderName = 'Users';
            const fileName = `${Date.now().toString()}_${file.originalname}`;
            cb(null, `${folderName}/${fileName}`);
        },
    }),
});

export const uploadReturnImage = multer({
    storage: multerS3({
        s3: s3,
        bucket: bucketCred.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, { fileName: file.fieldname });
        },
        key: (req, file, cb) => {
            const folderName= 'Return';
            const fileName = `${Date.now().toString()}_${file.originalname}`;
            cb(null, `${folderName}/${fileName}`);
        }
    })
})

export const uploadProductImagesMulter = multer({
    storage: multerS3({
        s3: s3,
        bucket: bucketCred.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, { fieldName: file.fieldname });
        },
        key: (req, file, cb) => {
            const folderName = 'Product';
            const fileName = `${Date.now().toString()}_${file.originalname}`;
            cb(null, `${folderName}/${fileName}`);
        },
    }),
});

export const uploadStoreImagesMulter = multer({
    storage: multerS3({
        s3: s3,
        bucket: bucketCred.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, { fieldName: file.fieldname });
        },
        key: (req, file, cb) => {
            const folderName = 'Store';
            const fileName = `${Date.now().toString()}_${file.originalname}`;
            cb(null, `${folderName}/${fileName}`);
        },
    }),
});

// Ads media (images + videos) uploader
export const uploadAdMediaMulter = multer({
    storage: multerS3({
        s3: s3,
        bucket: bucketCred.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, { fieldName: file.fieldname });
        },
        key: (req, file, cb) => {
            const folderName = 'Ads';
            const fileName = `${Date.now().toString()}_${file.originalname}`;
            cb(null, `${folderName}/${fileName}`);
        },
    }),
    limits: {
        fileSize: 200 * 1024 * 1024, // 200MB cap to allow video uploads
    },
});

// Flexible middleware to accept any ad media field names (images/videos)
export const uploadAdMediaAny = uploadAdMediaMulter.any();

export const uploadDeliveryBoyImage = multer({
    storage: multerS3({
        s3: s3,
        bucket: bucketCred.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, { fieldName: file.fieldname });
        },
        key: (req, file, cb) => {
            const folderName = 'DeliveryBoys'; // Folder in S3 bucket
            const fileName = `${Date.now().toString()}_${file.originalname}`;
            cb(null, `${folderName}/${fileName}`);
        },
    }),
    // Make image optional - allow requests without image file
    // Note: single('image') already makes the file optional
    // If no file is provided, req.file will be undefined (which is fine)
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
});

export const uploadReelFiles = multer({
    storage: multerS3({
        s3: s3,
        bucket: bucketCred.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: (req, file, cb) => {
            cb(null, { fieldName: file.fieldname });
        },
        key: (req, file, cb) => {
            const folderName = file.fieldname === 'video' ? 'Reels' : 'Reels/Thumbnails';
            const fileName = `${Date.now().toString()}_${file.originalname}`;
            cb(null, `${folderName}/${fileName}`);
        },
    }),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
    },
});
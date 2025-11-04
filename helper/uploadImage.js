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
});

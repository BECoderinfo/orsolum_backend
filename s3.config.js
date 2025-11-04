import dotEnv from "dotenv";

dotEnv.config({ path: "./.env" });

export const bucketCred = {
    accessKey: process.env.AWS_ACCESS_KEY,
    secretKey: process.env.AWS_SECRET_KEY,
    bucketName: process.env.AWS_BUCKET_NAME
};
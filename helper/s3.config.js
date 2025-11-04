import { catchError } from './service.js';
import { messages, status, jsonStatus } from './api.responses.js';
import { bucketCred } from "../s3.config.js";
import AWS from 'aws-sdk';

AWS.config.update({ accessKeyId: bucketCred.accessKey, secretAccessKey: bucketCred.secretKey, signatureVersion: 'v4', region: 'ap-south-1' })
var s3 = new AWS.S3()

export const signedUrl = (req, res, path) => {
    try {
        let { sFileName, sContentType } = req.body

        // ✅ Add validation for required fields
        if (!sFileName) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "sFileName is required"
            });
        }

        if (!sContentType) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "sContentType is required"
            });
        }

        // ✅ Safe string operations
        sFileName = String(sFileName).replace('/', '-')
        sFileName = sFileName.replace(/\s/gi, '-')

        let fileKey = ''
        const s3Path = path

        fileKey = `${Date.now()}_${sFileName}`

        const params = {
            Bucket: bucketCred.bucketName,
            Key: s3Path + fileKey,
            Expires: 300,
            ContentType: sContentType
        }

        s3.getSignedUrl('putObject', params, function (error, url) {
            if (error) {
                catchError(`${path}.getSignedUrl`, error, req, res)
            } else {
                return res.status(status.OK).jsonp({ 
                    status: jsonStatus.OK, 
                    message: messages.English.presigned_succ, 
                    data: { sUrl: url, sPath: s3Path + fileKey } 
                })
            }
        })
    } catch (error) {
        return res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
    }
}

export const deleteObject = async (s3Params) => {
    let data
    await s3.headObject(s3Params, function (err) {
        if (err) {
            console.log('err', err)
        } else {
            s3.deleteObject(s3Params, function (errDel, d) {
                if (errDel) console.log(errDel, errDel.stack)
                data = d
            })
        }
    })
    return data
}

export const putObj = (sFileName, sContentType, path, fileStream) => {
    return new Promise((resolve, reject) => {
        // ✅ Add validation
        if (!sFileName) {
            reject(new Error("sFileName is required"));
            return;
        }

        sFileName = String(sFileName).replace('/', '-')
        sFileName = sFileName.replace(/\s/gi, '-')

        let fileKey = ''
        const s3Path = path

        fileKey = `${Date.now()}_${sFileName}`

        const params = {
            Bucket: bucketCred.bucketName,
            Key: s3Path + fileKey,
            ContentType: sContentType,
            Body: fileStream
        }

        s3.upload(params, function (err, data) {
            if (err) reject(err)
            resolve(data)
        })
    })
}
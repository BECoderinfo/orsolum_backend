import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import User from '../models/User.js';
import OtpModel from '../models/Otp.js';
import PremiumMembership from '../models/PremiumMembership.js';
import { generateToken } from '../helper/generateToken.js';
import { signedUrl } from '../helper/s3.config.js';
import OTP_GENERATOR from "otp-generator";
import { sendSms } from '../helper/sendSms.js';
import axios from 'axios';
import mongoose from 'mongoose';

export const uploadProfileImage = async (req, res) => {
    try {
        signedUrl(req, res, 'Users/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadProfileImage', error, req, res);
    }
}

export const sendRegisterOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter phone number` });
        }

        const userRecord = await User.findOne({ phone });
        if (userRecord) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `${userRecord.role === 'user' ? 'User account' : 'Retailer account'}  Already exists with ${phone} mobile number.` });
        }

        // generate OTP login
        const otp = OTP_GENERATOR.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false, digits: true })
        // send OTP using msg91
        await sendSms(phone.replace('+', ''), { var1: req.body.name || 'User', var2: otp });

        // const otp = '123456';
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 mins

        const otpRecord = new OtpModel({
            phone,
            otp,
            expiresAt: otpExpires,
        });

        await otpRecord.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: `OTP has been sent to ${phone}` });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('sendRegisterOtp', error, req, res);
    }
};

export const sendLoginOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter phone number` });
        }

        const userRecord = await User.findOne({ phone });
        if (!userRecord) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Mobile number is not exist" });
        }

        if (userRecord.deleted) {
            return res.status(status.Forbidden).json({ status: jsonStatus.Forbidden, success: false, message: "Your account was deleted!" });
        }

        if (!userRecord.active) {
            return res.status(status.Unauthorized).json({ status: jsonStatus.Unauthorized, success: false, message: "Your account is in active! Please contact admin" });
        }

        if (userRecord.role !== 'user') {
            return res.status(status.OK).json({ status: jsonStatus.OK, success: false, message: `${userRecord.role === 'user' ? 'User account' : 'Retailer account'} Already exist with ${phone} mobile number` });
        }

        await OtpModel.deleteMany({ phone });

        // generate OTP login
        const otp = OTP_GENERATOR.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false, digits: true })
        // send OTP using msg91
        await sendSms(phone.replace('+', ''), { var1: userRecord.name || 'User', var2: otp });

        // const otp = '123456';
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 mins

        const otpRecord = new OtpModel({
            phone,
            otp,
            expiresAt: otpExpires,
        });

        await otpRecord.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, message: `OTP has been sent to ${phone}` });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('sendLoginOtp', error, req, res);
    }
};

export const registerUser = async (req, res) => {
    try {
        const { phone, otp, state, city, name } = req.body;

        if (!phone || !otp || !state || !city || !name) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter details` });
        }

        const otpRecord = await OtpModel.findOne({ phone, otp, expiresAt: { $gt: Date.now() } });
        if (!otpRecord) {
            return res.status(status.BadRequest).json({ jsonStatus: jsonStatus.BadRequest, success: false, message: 'Invalid OTP or phone number.' });
        }

        if (otpRecord.expiresAt < Date.now()) {
            return res.status(status.BadRequest).json({ jsonStatus: jsonStatus.BadRequest, success: false, message: 'OTP has expired.' });
        }

        const findUser = await User.findOne({ phone });
        if (findUser) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Phone number is already exists" });
        }

        const user = new User(req.body);
        await user.save();

        await OtpModel.deleteOne({ _id: otpRecord._id });

        const token = generateToken(user._id);

        res.status(status.Create).json({ status: jsonStatus.Create, success: true, data: user, token });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('registerUser', error, req, res);
    }
};

export const loginUser = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: `Please enter details` });
        }

        const otpRecord = await OtpModel.findOne({ phone, otp });
        if (!otpRecord) {
            return res.status(status.BadRequest).json({ jsonStatus: jsonStatus.BadRequest, success: false, message: 'Invalid OTP or phone number.' });
        }

        if (otpRecord.expiresAt < Date.now()) {
            return res.status(status.BadRequest).json({ jsonStatus: jsonStatus.BadRequest, success: false, message: 'OTP has expired.' });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(status.Forbidden).json({ status: jsonStatus.Forbidden, success: false, message: "User not found with this number" });
        }

        if (user.deleted) {
            return res.status(status.Forbidden).json({ status: jsonStatus.Forbidden, success: false, message: "Your account was deleted!" });
        }

        if (!user.active) {
            return res.status(status.Unauthorized).json({ status: jsonStatus.Unauthorized, success: false, message: "Your account is in active! Please contact admin" });
        }

        await OtpModel.deleteOne({ _id: otpRecord._id });

        const token = generateToken(user._id);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: user, token });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('loginUser', error, req, res);
    }
};

export const getMyProfile = async (req, res) => {
    try {

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: req.user });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getMyProfile', error, req, res);
    }
};

const trimTrailingSlash = (value = "") =>
    value.endsWith("/") ? value.slice(0, -1) : value;

const buildShareBaseUrl = (req) => {
    const envBase =
        process.env.USER_PROFILE_SHARE_BASE_URL ||
        process.env.USER_APP_SHARE_BASE_URL;

    if (envBase) {
        return trimTrailingSlash(envBase);
    }

    if (req?.protocol && req?.get) {
        return `${req.protocol}://${req.get("host")}/u`;
    }

    return "https://orsolum.com/u";
};

const slugifyHandle = (value = "") => {
    return (
        value
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/-+/g, '-') || "orsolum-user"
    );
};

const createShareHandle = async (user) => {
    const base = slugifyHandle(user.name || "orsolum-user");
    for (let attempt = 0; attempt < 5; attempt++) {
        const suffix = attempt === 0 ? "" : `-${Math.random().toString(36).slice(-4)}`;
        const candidate = `${base}${suffix}`;
        const exists = await User.exists({ shareHandle: candidate });
        if (!exists) {
            return candidate;
        }
    }
    return `${base}-${user._id.toString().slice(-6)}`;
};

const ensureShareHandle = async (user) => {
    if (user.shareHandle) {
        return user.shareHandle;
    }
    const handle = await createShareHandle(user);
    await User.findByIdAndUpdate(
        user._id,
        { shareHandle: handle },
        { new: true }
    );
    return handle;
};

const buildSharePreviewImage = (image) => {
    if (image && image.startsWith("http")) {
        return image;
    }
    if (image) {
        const cdn =
            process.env.CDN_BASE_URL ||
            process.env.AWS_CDN_BASE_URL ||
            "";
        return cdn ? `${cdn.replace(/\/$/, "")}/${image}` : image;
    }
    return (
        process.env.USER_PROFILE_SHARE_PLACEHOLDER ||
        "https://cdn.orsolum.com/static/default-user.png"
    );
};

const buildShareHtml = ({ user, shareUrl }) => {
    const name = user.name || "Orsolum User";
    const location = [user.city, user.state].filter(Boolean).join(", ");
    const previewImage = buildSharePreviewImage(user.image);
    const description = location
        ? `Connect with ${name} from ${location} on Orsolum`
        : `Connect with ${name} on Orsolum`;
    const appStoreLink =
        process.env.USER_APP_PLAYSTORE_URL ||
        "https://play.google.com/store/apps/details?id=com.orsolum.app";
    const appStoreText = process.env.USER_APP_NAME || "Orsolum";

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} • Orsolum</title>
  <meta name="description" content="${description}" />
  <meta property="og:type" content="profile" />
  <meta property="og:title" content="${name} • Orsolum" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${previewImage}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${name} • Orsolum" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${previewImage}" />
  <style>
    body {
      margin: 0;
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      background: radial-gradient(circle at top, #ecfdf5, #f8fafc);
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 28px;
      box-shadow: 0 30px 65px rgba(15, 23, 42, 0.1);
      max-width: 520px;
      width: 100%;
      padding: 38px;
      text-align: center;
    }
    .avatar {
      width: 132px;
      height: 132px;
      border-radius: 50%;
      object-fit: cover;
      margin-bottom: 24px;
      border: 6px solid #d1fae5;
      box-shadow: 0 12px 30px rgba(16, 185, 129, 0.2);
    }
    h1 {
      margin: 0;
      font-size: 2rem;
      color: #0f172a;
    }
    .location {
      margin: 10px 0 18px;
      color: #475569;
      font-size: 1rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 999px;
      background: ${user.isPremium ? "#ecfccb" : "#e2e8f0"};
      color: ${user.isPremium ? "#4d7c0f" : "#475569"};
      font-weight: 600;
      font-size: 0.85rem;
      margin-bottom: 18px;
    }
    .details {
      text-align: left;
      margin-top: 20px;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
    }
    .detail-row {
      margin-bottom: 12px;
    }
    .detail-label {
      display: block;
      font-size: 0.85rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .detail-value {
      font-size: 1.05rem;
      color: #0f172a;
      font-weight: 600;
    }
    .cta-group {
      margin-top: 28px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
    }
    .cta {
      flex: 1 1 180px;
      text-align: center;
      background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
      color: #fff;
      padding: 14px 24px;
      border-radius: 16px;
      text-decoration: none;
      font-weight: 600;
      letter-spacing: 0.02em;
      box-shadow: 0 12px 30px rgba(34, 197, 94, 0.35);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .cta.secondary {
      background: #e2e8f0;
      color: #0f172a;
      box-shadow: none;
    }
    .cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 40px rgba(34, 197, 94, 0.4);
    }
    .footer {
      margin-top: 24px;
      font-size: 0.9rem;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <main class="card">
    <img class="avatar" src="${previewImage}" alt="${name}" />
    <h1>${name}</h1>
    ${location ? `<p class="location">${location}</p>` : ""}
    <div class="badge">
      ${user.isPremium ? "🌟 Premium Member" : "Orsolum Member"}
    </div>

    <div class="details">
      ${user.entity ? `
        <div class="detail-row">
          <span class="detail-label">Business</span>
          <span class="detail-value">${user.entity}</span>
        </div>
      ` : ""}
      ${user.address ? `
        <div class="detail-row">
          <span class="detail-label">Address</span>
          <span class="detail-value">${user.address}</span>
        </div>
      ` : ""}
      ${user.phone ? `
        <div class="detail-row">
          <span class="detail-label">Phone</span>
          <span class="detail-value">${user.phone}</span>
        </div>
      ` : ""}
    </div>

    <div class="cta-group">
      <a class="cta" href="${appStoreLink}" target="_blank" rel="noopener noreferrer">
        Open in ${appStoreText}
      </a>
      ${user.phone ? `
        <a class="cta secondary" href="tel:${user.phone.replace(/\s|\+91/g, '')}">
          Call ${user.name?.split(" ")[0] || "Now"}
        </a>
      ` : ""}
    </div>

    <div class="footer">
      Share link: <a href="${shareUrl}">${shareUrl}</a>
    </div>
  </main>
</body>
</html>
`;
};

export const shareMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select("name city state phone image entity address gst isPremium role createdAt shareHandle");

        if (!user) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "User not found"
            });
        }

        const shareHandle = await ensureShareHandle(user);
        const shareBaseUrl = trimTrailingSlash(buildShareBaseUrl(req));
        const shareUrl = `${shareBaseUrl}/${shareHandle}`;

        const location = [user.city, user.state].filter(Boolean).join(", ");

        const textParts = [
            `Hey! I'm ${user.name || "an Orsolum user"}.`,
            location ? `Location: ${location}` : null,
            user.entity ? `Entity: ${user.entity}` : null,
            user.address ? `Address: ${user.address}` : null,
            `Let's connect on Orsolum: ${shareUrl}`
        ].filter(Boolean);

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    image: user.image,
                    city: user.city,
                    state: user.state,
                    phone: user.phone,
                    entity: user.entity,
                    address: user.address,
                    isPremium: user.isPremium,
                    role: user.role,
                    shareHandle
                },
                share: {
                    url: shareUrl,
                    message: textParts.join("\n"),
                    meta: {
                        title: `${user.name || "Orsolum User"} • Orsolum`,
                        description: `Connect with ${user.name || "this Orsolum user"} and explore their profile`,
                        previewImage: user.image || ""
                    }
                }
            }
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('shareMyProfile', error, req, res);
    }
};

export const renderSharedProfilePage = async (req, res) => {
    try {
        const { id: handle } = req.params;
        let user = await User.findOne({ shareHandle: handle }).select("name city state phone image entity address isPremium role shareHandle");

        if (!user && mongoose.Types.ObjectId.isValid(handle)) {
            user = await User.findById(handle).select("name city state phone image entity address isPremium role shareHandle");
        }

        if (!user) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>Profile Not Found • Orsolum</title>
                    <style>
                        body {font-family: Arial, sans-serif; background:#0f172a; color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;}
                        .box {text-align:center; padding:32px;}
                        a {color:#22d3ee;}
                    </style>
                </head>
                <body>
                    <div class="box">
                        <h1>Profile not found</h1>
                        <p>The invite link is invalid or has expired.</p>
                        <a href="https://orsolum.com">Go to Orsolum</a>
                    </div>
                </body>
                </html>
            `);
        }

        const shareBaseUrl = trimTrailingSlash(buildShareBaseUrl(req));
        const shareUrl = `${shareBaseUrl}/${user.shareHandle || user._id}`;
        const html = buildShareHtml({ user, shareUrl });

        res.set("Content-Type", "text/html").status(200).send(html);
    } catch (error) {
        console.error("renderSharedProfilePage error:", error);
        res
            .status(status.InternalServerError)
            .send("Unable to render profile preview right now. Please try again later.");
    }
};

export const updateMyProfile = async (req, res) => {
    try {
        // Normalise file based uploads
        if (req.file) {
            req.body.image = req.file.key;
        }

        const allowedFields = [
            "name",
            "state",
            "city",
            "image",
            "phone",
            "email",
            "address",
            "entity",
            "gst",
            "lat",
            "long"
        ];

        const updateData = {};

        allowedFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                const value = req.body[field];

                // Allow empty string to clear the field
                if (value !== undefined) {
                    if (field === "phone" && value) {
                        updateData.phone = value.startsWith("+91") ? value : `+91${value}`;
                    } else if (field === "email" && value) {
                        updateData.email = value.toLowerCase();
                    } else {
                        updateData[field] = value;
                    }
                }
            }
        });

        if (Object.keys(updateData).length === 0) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Please provide at least one field to update"
            });
        }

        const updateUser = await User.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updateUser) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "User not found"
            });
        }

        const userData = updateUser.toObject();
        delete userData.password;

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Profile updated successfully",
            data: userData
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError('updateMyProfile', error, req, res);
    }
};

export const deleteMyAccount = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { deleted: true }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteMyAccount', error, req, res);
    }
};

export const reActivateMyAccount = async (req, res) => {
    try {

        const { phone } = req.body;

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "No user found with this phone number" });
        }

        user.deleted = false;
        await user.save();

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('reActivateMyAccount', error, req, res);
    }
};

export const purchasePremium = async (req, res) => {
    try {

        let premiumData = await PremiumMembership.find();
        premiumData = premiumData[0];

        // Generate payment session ID
        const paymentData = {
            order_currency: 'INR',
            order_amount: premiumData.price,
            order_tags: {
                forPayment: "Premium",
                userId: req.user._id,
                amount: premiumData.price.toString(),
                month: premiumData.perMonth.toString()
            },
            customer_details: {
                customer_id: req.user._id,
                customer_phone: req.user.phone.replace('+91', '')
            }
        };

        const headers = {
            'x-api-version': process.env.CF_API_VERSION,
            'x-client-id': process.env.CF_CLIENT_ID,
            'x-client-secret': process.env.CF_CLIENT_SECRET,
            'Content-Type': 'application/json'
        };

        const cashFreeSession = await axios.post(process.env.CF_CREATE_PRODUCT_URL, paymentData, { headers });

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Order created successfully",
            data: {
                paymentSessionId: cashFreeSession.data.payment_session_id,
                cf_order_id: cashFreeSession.data.order_id
            }
        });
    } catch (error) {
        console.error("error", error);
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('purchasePremium', error, req, res);
    }
};

// Logout user
export const logoutUser = async (req, res) => {
    try {
        // Verify user exists and is authenticated
        if (!req.user || !req.user._id) {
            return res.status(status.Unauthorized).json({
                status: jsonStatus.Unauthorized,
                success: false,
                message: "User not authenticated"
            });
        }

        // In a token-based system, logout is typically handled client-side by removing the token
        // However, we can add server-side logic here if needed (e.g., token blacklisting)
        // For now, we just confirm the logout was successful
        
        // Optional: You can add token blacklisting logic here if needed
        // For example, store the token in a blacklist cache/database
        
        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Logged out successfully",
            data: {
                userId: req.user._id,
                loggedOutAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message || "Failed to logout"
        });
        return catchError('logoutUser', error, req, res);
    }
};
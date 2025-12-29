import express from "express";
import { body } from 'express-validator';
import { uploadProfileImage, loginUser, registerUser, sendLoginOtp, sendRegisterOtp, getMyProfile, updateMyProfile, deleteMyAccount, purchasePremium, reActivateMyAccount, logoutUser, shareMyProfile } from "../controllers/userController.js";
import { createAddress, editAddress, deleteAddress, getAddress, getAllAddress, getUserAllAddress, addProductToCart, setDefaultAddress } from "../controllers/orderController.js";
import { getAppThemeSettings } from "../controllers/adminController.js";
import { userAuthentication } from "../middlewares/middleware.js";
import { uploadUserImage } from "../helper/uploadImage.js";
import { getUserNotifications, markUserNotificationRead, dismissUserNotification, clearUserNotifications } from "../controllers/notificationController.js";
import User from "../models/User.js";
import { getCoordinatesFromAddress, getAddressFromCoordinates, searchPlaces, getDetailedAddressFromCoordinates, detectLocationByIP } from "../helper/geocoding.js";
import { getActiveAds } from "../controllers/adController.js";
import { jsonStatus, status } from "../helper/api.responses.js";
const userRouter = express.Router();

// image upload
userRouter.post('/user/upload/profile/image/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], userAuthentication, uploadProfileImage); // not in used

// auth
userRouter.post('/send/register/otp/v1', sendRegisterOtp);
userRouter.post('/send/login/otp/v1', sendLoginOtp);
userRouter.post('/register/user/v1', registerUser);
userRouter.post('/login/user/v1', loginUser);
userRouter.post('/logout/user/v1', userAuthentication, logoutUser);

// user
userRouter.get('/my/profile/v1', userAuthentication, getMyProfile);
userRouter.put('/update/my/profile/v1', userAuthentication, uploadUserImage.single('image'), updateMyProfile);
userRouter.get('/share/my/profile/v1', userAuthentication, shareMyProfile);
// aliases with '/user' prefix for clients calling /api/user/...
userRouter.get('/user/my/profile/v1', userAuthentication, getMyProfile);
userRouter.put('/user/update/my/profile/v1', userAuthentication, uploadUserImage.single('image'), updateMyProfile);
userRouter.get('/user/my/profile/share/v1', userAuthentication, shareMyProfile);
userRouter.delete('/delete/my/account/v1', userAuthentication, deleteMyAccount);
userRouter.post('/re-activate/my/account/v1', reActivateMyAccount);

// premium purchase
userRouter.post('/purchase/premium/v1', userAuthentication, purchasePremium);

// notifications
userRouter.get('/user/notifications/v1', userAuthentication, getUserNotifications);
userRouter.patch('/user/notifications/:id/read/v1', userAuthentication, markUserNotificationRead);
userRouter.delete('/user/notifications/:id/v1', userAuthentication, dismissUserNotification);
userRouter.delete('/user/notifications/clear/v1', userAuthentication, clearUserNotifications);

userRouter.post('/create/address/v1', userAuthentication, createAddress);
userRouter.put('/edit/address/:id/v1', userAuthentication, editAddress);
userRouter.delete('/delete/address/:id/v1', userAuthentication, deleteAddress);
userRouter.get('/get/address/:id/v1', userAuthentication, getAddress);
userRouter.get('/get/address/v1', userAuthentication, getAllAddress);
userRouter.get('/get/address/user/list/v1', userAuthentication, getUserAllAddress);
userRouter.put('/set/default/address/:id/v1', userAuthentication, setDefaultAddress);

// Cart (alias without /order prefix for mobile clients)
userRouter.post('/add/product/in/cart/v1', userAuthentication, addProductToCart);

// App Theme Settings (Public - no auth required for user app)
userRouter.get('/app/theme/settings/v1', getAppThemeSettings);

// 📣 Public Ads API (For Online Store Home Screen - no auth required)
userRouter.get('/ads/active/v1', getActiveAds);

// 🗺️ Location & Geocoding Services
// Get coordinates from address
userRouter.post('/geocode/address/v1', userAuthentication, async (req, res) => {
    try {
        const { address } = req.body;

        if (!address) {
            return res.status(400).json({
                success: false,
                message: "Address is required"
            });
        }

        const result = await getCoordinatesFromAddress(address);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Could not geocode address"
            });
        }

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error("Geocode error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get address from coordinates (reverse geocoding)
userRouter.post('/reverse-geocode/v1', userAuthentication, async (req, res) => {
    try {
        const { lat, lng } = req.body;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: "Latitude and longitude are required"
            });
        }

        const result = await getAddressFromCoordinates(lat, lng);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Could not reverse geocode coordinates"
            });
        }

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error("Reverse geocode error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Search places
userRouter.post('/search/places/v1', userAuthentication, async (req, res) => {
    try {
        const { query, lat, lng } = req.body;

        // ✅ Enhanced validation
        if (!query) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Search query is required"
            });
        }

        if (typeof query !== 'string' || query.trim() === "") {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "Search query cannot be empty"
            });
        }

        console.log("Searching places for query:", query, "with location bias:", lat, lng);

        const results = await searchPlaces(query.trim(), lat, lng);

        console.log("Search results count:", results.length);

        return res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: results.length > 0 ? "Places found" : "No places found",
            data: results
        });
    } catch (error) {
        console.error("Place search error:", error);
        return res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message || "Failed to search places"
        });
    }
});

// Get Google Maps API key (for client-side use)
userRouter.get('/config/maps-api-key/v1', userAuthentication, async (req, res) => {
    try {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                success: false,
                message: "Google Maps API key not configured"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                apiKey
            }
        });
    } catch (error) {
        console.error("Config error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Auto-detect user location when app opens
userRouter.post('/detect/location/v1', userAuthentication, async (req, res) => {
    try {
        const { lat, lng } = req.body;

        // If coordinates are provided, use them
        if (lat && lng) {
            const detailedAddress = await getDetailedAddressFromCoordinates(lat, lng);
            
            if (detailedAddress) {
                // Update user's location in profile
                const updateData = {
                    lat: lat.toString(),
                    long: lng.toString(),
                    city: detailedAddress.city || "",
                    state: detailedAddress.state || ""
                };
                
                // Only update if values are not empty
                Object.keys(updateData).forEach(key => {
                    if (!updateData[key]) delete updateData[key];
                });
                
                if (Object.keys(updateData).length > 0) {
                    await User.findByIdAndUpdate(req.user._id, updateData, { new: true });
                }
                
                return res.status(200).json({
                    success: true,
                    data: {
                        coordinates: { lat, lng },
                        address: detailedAddress
                    }
                });
            }
        }

        // Fallback to IP-based location detection
        const ipLocation = await detectLocationByIP();
        if (ipLocation) {
            return res.status(200).json({
                success: true,
                data: {
                    coordinates: { 
                        lat: ipLocation.lat, 
                        lng: ipLocation.lng 
                    },
                    location: {
                        city: ipLocation.city,
                        state: ipLocation.state
                    }
                }
            });
        }

        // If all methods fail, return default response
        return res.status(200).json({
            success: true,
            data: {
                message: "Location detection completed"
            }
        });
    } catch (error) {
        console.error("Location detection error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default userRouter;
// orsolum_backend/controllers/pickupAddressController.js
import PickupAddress from '../models/PickupAddress.js';
import Store from '../models/Store.js';
import { apiResponse } from '../helper/api.responses.js';
import ShiprocketService from '../helper/shiprocketService.js';

// ✅ Add new pickup address
export const addPickupAddress = async (req, res) => {
    try {
        const { 
            storeId, 
            nickname, 
            spocDetails, 
            pickupLocation,
            isPrimary = false 
        } = req.body;

        // Validate required fields
        if (!storeId) {
            return res.status(400).json(apiResponse(false, 'Store ID is required'));
        }

        if (!nickname || !spocDetails || !pickupLocation) {
            return res.status(400).json(apiResponse(false, 'Nickname, SPOC details, and pickup location are required'));
        }

        // Validate store exists and belongs to the authenticated seller
        const store = await Store.findById(storeId);
        if (!store) {
            console.error('Store not found with ID:', storeId);
            console.error('Seller ID:', req.user._id);
            return res.status(404).json(apiResponse(false, `Store not found with ID: ${storeId}`));
        }

        // Verify that the store belongs to the authenticated seller
        if (store.createdBy.toString() !== req.user._id.toString()) {
            console.error('Store createdBy:', store.createdBy);
            console.error('Request user ID:', req.user._id);
            return res.status(403).json(apiResponse(false, 'You do not have permission to add pickup address to this store'));
        }

        // Initialize pickup_addresses array if it doesn't exist
        if (!store.shiprocket) {
            store.shiprocket = {};
        }
        if (!store.shiprocket.pickup_addresses) {
            store.shiprocket.pickup_addresses = [];
        }

        // If this is primary, make others non-primary
        if (isPrimary) {
            await PickupAddress.updateMany(
                { storeId, isPrimary: true },
                { isPrimary: false }
            );
        }

        // Validate pickup location data
        if (!pickupLocation.pincode) {
            return res.status(400).json(apiResponse(false, 'Pincode is required in pickupLocation'));
        }

        // Generate unique pickup_location name to avoid conflicts
        // Use storeId + timestamp to ensure uniqueness
        const timestamp = Date.now();
        const uniquePickupLocation = `${nickname.replace(/\s+/g, '_').toLowerCase()}_${storeId.toString().slice(-6)}_${timestamp}`.substring(0, 50); // Shiprocket limit
        
        // Shiprocket API payload (uses pin_code)
        const shiprocketPayload = {
            pickup_location: uniquePickupLocation,
            name: spocDetails.name,
            email: spocDetails.email || `${spocDetails.phone}@orsolum.com`,
            phone: spocDetails.phone,
            address: pickupLocation.address,
            address_2: pickupLocation.address_2 || '',
            city: pickupLocation.city,
            state: pickupLocation.state,
            country: pickupLocation.country || 'India',
            pin_code: pickupLocation.pincode
        };

        // Database payload (uses pincode to match model schema)
        const shiprocketLocationData = {
            name: spocDetails.name,
            phone: spocDetails.phone,
            address: pickupLocation.address,
            address_2: pickupLocation.address_2 || '',
            city: pickupLocation.city,
            state: pickupLocation.state,
            pincode: pickupLocation.pincode, // Model expects 'pincode', not 'pin_code'
            country: pickupLocation.country || 'India'
        };

        let shiprocketResponse = null;
        let shiprocketError = null;

        // Try to create pickup address in Shiprocket, but don't fail if it errors
        try {
            // Check if Shiprocket credentials are configured
            if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
                console.warn('⚠️ Shiprocket credentials not configured - skipping API sync');
                shiprocketError = 'Shiprocket credentials not configured in .env file';
            } else {
                console.log('🚀 Attempting Shiprocket API call with payload:', {
                    pickup_location: shiprocketPayload.pickup_location,
                    name: shiprocketPayload.name,
                    city: shiprocketPayload.city,
                    state: shiprocketPayload.state
                });
                
                shiprocketResponse = await ShiprocketService.createPickupAddress(shiprocketPayload);
                
                if (shiprocketResponse?.data?.id || shiprocketResponse?.pickup_location) {
                    console.log('✅ Shiprocket pickup address created successfully:', {
                        id: shiprocketResponse?.data?.id,
                        pickup_location: shiprocketResponse?.pickup_location || shiprocketResponse?.data?.pickup_location
                    });
                    shiprocketError = null; // Clear any previous error
                } else {
                    console.warn('⚠️ Shiprocket response received but no ID found:', shiprocketResponse);
                    shiprocketError = 'Shiprocket response missing pickup address ID';
                }
            }
        } catch (error) {
            shiprocketError = error.message;
            console.error('❌ Shiprocket pickup address creation failed:', {
                error: error.message,
                status: error.response?.status,
                data: error.response?.data,
                pickup_location: shiprocketPayload.pickup_location
            });
            // Continue with database creation even if Shiprocket fails
        }
        
        // Create pickup address in database
        const pickupAddress = new PickupAddress({
            storeId,
            nickname,
            isPrimary,
            spocDetails,
            shiprocket: {
                pickup_address_id: shiprocketResponse?.data?.id || shiprocketResponse?.pickup_location || null,
                pickup_location: shiprocketLocationData, // Use correct format for model
                error: shiprocketError || null // Store error if Shiprocket failed
            },
            createdBy: req.user._id,
            updatedBy: req.user._id
        });

        const savedPickupAddress = await pickupAddress.save();

        // Update store with new pickup address
        store.shiprocket.pickup_addresses.push(savedPickupAddress._id);
        if (isPrimary || store.shiprocket.pickup_addresses.length === 1) {
            store.shiprocket.default_pickup_address = savedPickupAddress._id;
        }
        await store.save();

        // Success response - Shiprocket sync is optional
        const message = shiprocketError 
            ? 'Pickup address added successfully. Note: Shiprocket sync is optional - your pickup address is saved locally and ready to use.' 
            : 'Pickup address added successfully';

        // Remove shiprocketWarning from response if you want cleaner output
        const responseData = savedPickupAddress.toObject();
        
        // Optionally remove error field from response for cleaner output
        if (responseData.shiprocket && responseData.shiprocket.error) {
            delete responseData.shiprocket.error;
        }

        return res.status(201).json(apiResponse(true, message, responseData));

    } catch (error) {
        console.error('Error adding pickup address:', error);
        return res.status(500).json(apiResponse(false, error.message));
    }
};

// ✅ Get all pickup addresses for a store
export const getStorePickupAddresses = async (req, res) => {
    try {
        const { storeId } = req.params;
        const { page = 1, limit = 10, status, verificationStatus } = req.query;

        const filter = { storeId };
        if (status) filter.status = status;
        if (verificationStatus) filter.verificationStatus = verificationStatus;

        const pickupAddresses = await PickupAddress.find(filter)
            .populate('createdBy', 'firstName lastName email phone')
            .sort({ isPrimary: -1, createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await PickupAddress.countDocuments(filter);

        return res.json(apiResponse(true, 'Pickup addresses fetched successfully', {
            pickupAddresses,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total
            }
        }));

    } catch (error) {
        console.error('Error fetching pickup addresses:', error);
        return res.status(500).json(apiResponse(false, error.message));
    }
};

// ✅ Update pickup address
export const updatePickupAddress = async (req, res) => {
    try {
        const { pickupAddressId } = req.params;
        const { nickname, spocDetails, pickupLocation, isPrimary, status } = req.body;

        const pickupAddress = await PickupAddress.findById(pickupAddressId);
        if (!pickupAddress) {
            return res.status(404).json(apiResponse(false, 'Pickup address not found'));
        }

        // If making primary, update others
        if (isPrimary && !pickupAddress.isPrimary) {
            await PickupAddress.updateMany(
                { storeId: pickupAddress.storeId, isPrimary: true },
                { isPrimary: false }
            );
        }

        // Update fields
        if (nickname) pickupAddress.nickname = nickname;
        if (spocDetails) pickupAddress.spocDetails = { ...pickupAddress.spocDetails, ...spocDetails };
        if (pickupLocation) {
            pickupAddress.shiprocket.pickup_location = { ...pickupAddress.shiprocket.pickup_location, ...pickupLocation };
        }
        if (isPrimary !== undefined) pickupAddress.isPrimary = isPrimary;
        if (status) pickupAddress.status = status;

        pickupAddress.updatedBy = req.user._id;
        const updatedPickupAddress = await pickupAddress.save();

        return res.json(apiResponse(true, 'Pickup address updated successfully', updatedPickupAddress));

    } catch (error) {
        console.error('Error updating pickup address:', error);
        return res.status(500).json(apiResponse(false, error.message));
    }
};

// ✅ Delete pickup address
export const deletePickupAddress = async (req, res) => {
    try {
        const { pickupAddressId } = req.params;

        const pickupAddress = await PickupAddress.findById(pickupAddressId);
        if (!pickupAddress) {
            return res.status(404).json(apiResponse(false, 'Pickup address not found'));
        }

        // Remove from store
        await Store.findByIdAndUpdate(
            pickupAddress.storeId,
            { $pull: { 'shiprocket.pickup_addresses': pickupAddressId } }
        );

        // If this was default, set another as default
        if (pickupAddress.isPrimary) {
            const store = await Store.findById(pickupAddress.storeId);
            const remainingAddresses = await PickupAddress.find({ 
                storeId: pickupAddress.storeId, 
                _id: { $ne: pickupAddressId } 
            });
            
            if (remainingAddresses.length > 0) {
                const newPrimary = remainingAddresses[0];
                newPrimary.isPrimary = true;
                await newPrimary.save();
                
                store.shiprocket.default_pickup_address = newPrimary._id;
                await store.save();
            }
        }

        await PickupAddress.findByIdAndDelete(pickupAddressId);

        return res.json(apiResponse(true, 'Pickup address deleted successfully'));

    } catch (error) {
        console.error('Error deleting pickup address:', error);
        return res.status(500).json(apiResponse(false, error.message));
    }
};

// ✅ Set primary pickup address
export const setPrimaryPickupAddress = async (req, res) => {
    try {
        const { pickupAddressId } = req.params;

        const pickupAddress = await PickupAddress.findById(pickupAddressId);
        if (!pickupAddress) {
            return res.status(404).json(apiResponse(false, 'Pickup address not found'));
        }

        // Make others non-primary
        await PickupAddress.updateMany(
            { storeId: pickupAddress.storeId, isPrimary: true },
            { isPrimary: false }
        );

        // Set this as primary
        pickupAddress.isPrimary = true;
        await pickupAddress.save();

        // Update store default
        await Store.findByIdAndUpdate(
            pickupAddress.storeId,
            { 'shiprocket.default_pickup_address': pickupAddressId }
        );

        return res.json(apiResponse(true, 'Primary pickup address updated successfully'));

    } catch (error) {
        console.error('Error setting primary pickup address:', error);
        return res.status(500).json(apiResponse(false, error.message));
    }
};

// ✅ Bulk operations
export const bulkUpdatePickupAddresses = async (req, res) => {
    try {
        const { pickupAddressIds, updates } = req.body;

        const result = await PickupAddress.updateMany(
            { _id: { $in: pickupAddressIds } },
            { ...updates, updatedBy: req.user._id }
        );

        return res.json(apiResponse(true, 'Bulk update completed', { modifiedCount: result.modifiedCount }));

    } catch (error) {
        console.error('Error in bulk update:', error);
        return res.status(500).json(apiResponse(false, error.message));
    }
};
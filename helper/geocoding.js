import fetch from "node-fetch";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Get coordinates from address using Google Geocoding API
 * @param {string} address - Full address string
 * @returns {Promise<{lat: number, lng: number, formatted_address: string} | null>}
 */
export const getCoordinatesFromAddress = async (address) => {
    try {
        if (!address || typeof address !== "string") {
            console.error("Invalid address provided");
            return null;
        }

        if (!GOOGLE_MAPS_API_KEY) {
            console.error("GOOGLE_MAPS_API_KEY not configured in .env");
            return null;
        }

        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "OK" && data.results && data.results.length > 0) {
            const result = data.results[0];
            return {
                lat: result.geometry.location.lat,
                lng: result.geometry.location.lng,
                formatted_address: result.formatted_address,
                place_id: result.place_id,
            };
        }

        console.error("Geocoding failed:", data.status);
        return null;
    } catch (error) {
        console.error("Error in getCoordinatesFromAddress:", error.message);
        return null;
    }
};

/**
 * Get address from coordinates using Google Reverse Geocoding API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{address: string, city: string, state: string, pincode: string, country: string} | null>}
 */
export const getAddressFromCoordinates = async (lat, lng) => {
    try {
        if (!lat || !lng) {
            console.error("Invalid coordinates provided");
            return null;
        }

        if (!GOOGLE_MAPS_API_KEY) {
            console.error("GOOGLE_MAPS_API_KEY not configured in .env");
            return null;
        }

        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "OK" && data.results && data.results.length > 0) {
            const result = data.results[0];

            // Extract address components
            let city = "";
            let state = "";
            let pincode = "";
            let country = "";

            result.address_components.forEach(component => {
                if (component.types.includes("locality")) {
                    city = component.long_name;
                }
                if (component.types.includes("administrative_area_level_1")) {
                    state = component.long_name;
                }
                if (component.types.includes("postal_code")) {
                    pincode = component.long_name;
                }
                if (component.types.includes("country")) {
                    country = component.long_name;
                }
            });

            return {
                address: result.formatted_address,
                city,
                state,
                pincode,
                country,
                place_id: result.place_id,
            };
        }

        console.error("Reverse geocoding failed:", data.status);
        return null;
    } catch (error) {
        console.error("Error in getAddressFromCoordinates:", error.message);
        return null;
    }
};

/**
 * Enhanced reverse geocoding with fallback mechanisms
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{address: string, city: string, state: string, pincode: string, country: string} | null>}
 */
export const getDetailedAddressFromCoordinates = async (lat, lng) => {
    try {
        if (!lat || !lng) {
            console.error("Invalid coordinates provided");
            return null;
        }

        if (!GOOGLE_MAPS_API_KEY) {
            console.error("GOOGLE_MAPS_API_KEY not configured in .env");
            return null;
        }

        // Try primary reverse geocoding
        const primaryResult = await getAddressFromCoordinates(lat, lng);
        if (primaryResult && primaryResult.address) {
            return primaryResult;
        }

        // Fallback mechanism - try with different parameters
        const urls = [
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&result_type=street_address`,
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&location_type=APPROXIMATE`
        ];

        for (const url of urls) {
            try {
                const response = await fetch(url);
                const data = await response.json();
                    
                if (data.status === "OK" && data.results && data.results.length > 0) {
                    const result = data.results[0];
                        
                    // Extract address components
                    let city = "";
                    let state = "";
                    let pincode = "";
                    let country = "";
                        
                    result.address_components.forEach(component => {
                        if (component.types.includes("locality")) {
                            city = component.long_name;
                        } else if (component.types.includes("administrative_area_level_1")) {
                            state = component.long_name;
                        } else if (component.types.includes("postal_code")) {
                            pincode = component.long_name;
                        } else if (component.types.includes("country")) {
                            country = component.long_name;
                        }
                    });
                        
                    return {
                        address: result.formatted_address,
                        city,
                        state,
                        pincode,
                        country,
                        place_id: result.place_id,
                    };
                }
            } catch (fallbackError) {
                console.error("Fallback geocoding attempt failed:", fallbackError.message);
                continue;
            }
        }

        console.error("All reverse geocoding attempts failed");
        return null;
    } catch (error) {
        console.error("Error in getDetailedAddressFromCoordinates:", error.message);
        return null;
    }
};

/**
 * Search places using Google Places API
 * @param {string} query - Search query
 * @param {number} lat - User's latitude (optional, for better results)
 * @param {number} lng - User's longitude (optional, for better results)
 * @returns {Promise<Array>}
 */
export const searchPlaces = async (query, lat = null, lng = null) => {
    try {
        if (!query || typeof query !== "string") {
            console.error("Invalid search query");
            return [];
        }

        if (!GOOGLE_MAPS_API_KEY) {
            console.error("GOOGLE_MAPS_API_KEY not configured in .env");
            return [];
        }

        let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;

        // Add location bias if coordinates provided
        if (lat && lng) {
            url += `&location=${lat},${lng}&radius=50000`; // 50km radius
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "OK" && data.results) {
            return data.results.map(place => ({
                name: place.name,
                address: place.formatted_address,
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng,
                place_id: place.place_id,
            }));
        }

        console.error("Place search failed:", data.status);
        return [];
    } catch (error) {
        console.error("Error in searchPlaces:", error.message);
        return [];
    }
};

/**
 * Detect current location using IP geolocation as a last resort
 * @returns {Promise<{lat: number, lng: number, city: string, state: string} | null>}
 */
export const detectLocationByIP = async () => {
    try {
        // Using ipapi.co for IP-based geolocation (free tier available)
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        if (data.latitude && data.longitude) {
            return {
                lat: data.latitude,
                lng: data.longitude,
                city: data.city || '',
                state: data.region || ''
            };
        }
        
        return null;
    } catch (error) {
        console.error("IP-based location detection failed:", error.message);
        return null;
    }
};

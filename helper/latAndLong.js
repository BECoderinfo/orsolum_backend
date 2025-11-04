const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export const processGoogleMapsLink = async (url) => {
    // Check if the link is a short Google Maps link
    function isShortLink(link) {
        return link.includes("goo.gl") || link.includes("maps.app.goo.gl");
    }

    // Expand short links
    async function expandShortenedUrl(shortUrl) {
        try {
            const response = await fetch(shortUrl, { method: "HEAD", redirect: "manual" });
            const expandedUrl = response.headers.get("location");
            return expandedUrl || shortUrl;
        } catch (error) {
            console.error("Error expanding URL:", error);
            return null;
        }
    }

    // Extract lat/lng directly from @lat,lng pattern
    function extractLatLng(url) {
        const regexAtPattern = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
        const match = url.match(regexAtPattern);
        if (match) {
            return {
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2]),
            };
        }
        return null;
    }

    // Extract place name for search queries
    function extractSearchQuery(url) {
        try {
            const decodedUrl = decodeURIComponent(url);
            const match = decodedUrl.match(/place\/([^/]+)/);
            if (match) {
                return match[1].replace(/\+/g, " ");
            }
            return null;
        } catch (error) {
            console.error("Error extracting search query:", error);
            return null;
        }
    }

    // Get coordinates using Google Maps Places API
    async function getCoordinatesFromGoogleMapsApi(query) {
        try {
            const apiUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=geometry&key=${GOOGLE_MAPS_API_KEY}`;
            const response = await fetch(apiUrl);
            const data = await response.json();
            if (data.status === "OK" && data.candidates.length > 0) {
                const { lat, lng } = data.candidates[0].geometry.location;
                return { lat, lng };
            } else {
                console.error("Google Maps API Error:", data.status);
                return null;
            }
        } catch (error) {
            console.error("Error fetching coordinates from Google Maps API:", error);
            return null;
        }
    }

    let finalUrl = url;

    // Expand short links if needed
    if (isShortLink(url)) {
        console.log("Detected a short link. Expanding...");
        finalUrl = await expandShortenedUrl(url);
        if (!finalUrl) {
            console.error("Failed to expand short link.");
            return null;
        }
    } else {
        console.log("Detected a long link. Processing directly...");
    }

    console.log("Final URL:", finalUrl);

    // Try to extract coordinates directly (for lat,lng links)
    const directCoordinates = extractLatLng(finalUrl);
    if (directCoordinates) {
        console.log(`Extracted directly: Latitude: ${directCoordinates.lat}, Longitude: ${directCoordinates.lng}`);
        return directCoordinates;
    }

    // Fallback: use Places API for location names
    const searchQuery = extractSearchQuery(finalUrl);
    if (searchQuery) {
        console.log("Search Query:", searchQuery);
        const coordinates = await getCoordinatesFromGoogleMapsApi(searchQuery);
        if (coordinates) {
            console.log(`Latitude: ${coordinates.lat}, Longitude: ${coordinates.lng}`);
            return coordinates;
        }
    }

    console.error("Failed to extract coordinates.");
    return null;
};

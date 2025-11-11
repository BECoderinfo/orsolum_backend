import fetch from "node-fetch"; // or globalThis.fetch in Node 18+

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export const processGoogleMapsLink = async (url) => {
  try {
    if (!url || typeof url !== "string") {
      console.error("Invalid or missing Google Maps URL");
      return { lat: null, lng: null };
    }

    // --- 1️⃣ Helper Functions ---

    const isShortLink = (link) =>
      link.includes("goo.gl") || link.includes("maps.app.goo.gl");

    const expandShortenedUrl = async (shortUrl) => {
      try {
        const response = await fetch(shortUrl, { method: "HEAD", redirect: "manual" });
        const expandedUrl = response.headers.get("location");
        return expandedUrl || shortUrl;
      } catch (error) {
        console.error("Error expanding short link:", error);
        return null;
      }
    };

    const extractLatLng = (url) => {
      // Match both ?q=lat,lng and @lat,lng patterns
      const regex = /[?@](-?\d+\.\d+),\s*(-?\d+\.\d+)/;
      const match = url.match(regex);
      if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      }
      return null;
    };

    const extractSearchQuery = (url) => {
      try {
        const decoded = decodeURIComponent(url);
        // Extract place or query strings like /place/ or /search/
        const match = decoded.match(/(?:place|search)\/([^/?]+)/);
        if (match) return match[1].replace(/\+/g, " ");
        return null;
      } catch (error) {
        console.error("Error extracting search query:", error);
        return null;
      }
    };

    const getCoordinatesFromGoogleMapsApi = async (query) => {
      try {
        const apiUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(
          query
        )}&inputtype=textquery&fields=geometry&key=${GOOGLE_MAPS_API_KEY}`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.status === "OK" && data.candidates.length > 0) {
          const { lat, lng } = data.candidates[0].geometry.location;
          return { lat, lng };
        } else {
          console.warn("Google Maps API returned:", data.status);
          return { lat: null, lng: null };
        }
      } catch (error) {
        console.error("Error fetching coordinates from Google Maps API:", error);
        return { lat: null, lng: null };
      }
    };

    // --- 2️⃣ Expand Short URLs if Needed ---
    let finalUrl = url;
    if (isShortLink(url)) {
      console.log("Detected short Google Maps link. Expanding...");
      const expanded = await expandShortenedUrl(url);
      if (expanded) finalUrl = expanded;
      else {
        console.error("Failed to expand Google Maps short link.");
        return { lat: null, lng: null };
      }
    }

    console.log("Final Expanded URL:", finalUrl);

    // --- 3️⃣ Try to Extract Coordinates ---
    const coordinates = extractLatLng(finalUrl);
    if (coordinates) {
      console.log(`Extracted directly: lat=${coordinates.lat}, lng=${coordinates.lng}`);
      return coordinates;
    }

    // --- 4️⃣ Try to Get Coordinates via Place API ---
    const searchQuery = extractSearchQuery(finalUrl);
    if (searchQuery) {
      console.log("Extracted Search Query:", searchQuery);
      const placeCoords = await getCoordinatesFromGoogleMapsApi(searchQuery);
      if (placeCoords && placeCoords.lat && placeCoords.lng) {
        return placeCoords;
      }
    }

    console.error("No valid coordinates found from URL.");
    return { lat: null, lng: null };
  } catch (error) {
    console.error("processGoogleMapsLink Error:", error);
    return { lat: null, lng: null };
  }
};

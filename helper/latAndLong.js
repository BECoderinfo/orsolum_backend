import fetch from "node-fetch"; // or globalThis.fetch in Node 18+

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

    console.error("No valid coordinates found from URL.");
    return { lat: null, lng: null };
  } catch (error) {
    console.error("processGoogleMapsLink Error:", error);
    return { lat: null, lng: null };
  }
};

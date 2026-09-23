import { GoogleGenAI } from "@google/genai";

// In-memory cache to prevent duplicate network calls for identical coordinates
const geocodeCache = new Map<string, string>();

/**
 * Robust geocoding service that converts coordinates (lat, lng) to a clean human-readable address.
 * Uses OpenStreetMap Nominatim as the primary fast reverse geocoding engine,
 * with graceful fallback to Gemini (if a valid key is provided) or formatted coordinates.
 */
export async function getAddressFromCoords(lat: number, lng: number): Promise<string> {
  // Handle default uninitialized or invalid coordinates
  if (lat === 0 && lng === 0) {
    return 'Waiting for GPS fix...';
  }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  // 1. Primary: Reverse geocoding via OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'VarkiGPS-App/1.0'
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const addr = data.address;
      if (addr) {
        const parts = [
          addr.building || addr.amenity || addr.road || addr.pedestrian || addr.footway,
          addr.suburb || addr.neighbourhood || addr.city_district || addr.district || addr.quarter,
          addr.city || addr.town || addr.village || addr.municipality || addr.county,
          addr.state || addr.country
        ].filter(Boolean);

        if (parts.length > 0) {
          // Keep it concise: take up to 3 segments so it fits cleanly on the watermark
          const formatted = parts.slice(0, 3).join(', ');
          geocodeCache.set(cacheKey, formatted);
          return formatted;
        }
      }

      if (data.display_name) {
        const segments = data.display_name.split(',').map((s: string) => s.trim());
        const concise = segments.slice(0, 3).join(', ');
        geocodeCache.set(cacheKey, concise);
        return concise;
      }
    }
  } catch {
    // Network or abort error from Nominatim; proceed to next fallback
  }

  // 2. Secondary fallback: Gemini API (ONLY if a real API key is configured)
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  const isValidApiKey = apiKey && apiKey !== 'PLACEHOLDER_API_KEY' && !apiKey.includes('PLACEHOLDER');

  if (isValidApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Given latitude ${lat.toFixed(6)} and longitude ${lng.toFixed(6)}, provide a concise real-world address (Street, District, City). Return only the single-line address text. Example: "Jalan Bukit Bintang, Bukit Bintang, Kuala Lumpur"`,
        config: {
          maxOutputTokens: 60,
          temperature: 0.1,
        }
      });

      const text = response.text?.trim();
      if (text && !text.toLowerCase().includes('sorry') && !text.toLowerCase().includes('cannot')) {
        geocodeCache.set(cacheKey, text);
        return text;
      }
    } catch {
      // Quietly ignore Gemini errors to avoid noisy console spam
    }
  }

  // 3. Fallback: Clean formatted coordinates
  const formattedCoords = `GPS: ${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
  geocodeCache.set(cacheKey, formattedCoords);
  return formattedCoords;
}

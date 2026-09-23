
import { GoogleGenAI, Type } from "@google/genai";

export async function getAddressFromCoords(lat: number, lng: number): Promise<string> {
  // Initialize GoogleGenAI inside the function to ensure the latest API_KEY is always used.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a geocoding service. Given latitude ${lat} and longitude ${lng}, provide a concise, real-world address for this location. Return only the address string. Example format: "Perumahan Awam Sri Johor, Block 5, Kuala Lumpur".`,
      config: {
        maxOutputTokens: 100,
        temperature: 0.1,
      }
    });

    return response.text.trim() || "Location unavailable";
  } catch (error) {
    console.error("Geocoding error:", error);
    return `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
  }
}

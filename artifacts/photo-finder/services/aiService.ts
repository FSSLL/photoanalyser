import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

const API_BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export interface AIPhotoAnalysis {
  tags: string[];
  description: string;
  mainSubject: string;
}

/**
 * Compress a photo to a small thumbnail before sending to the AI API.
 * Target: ~300px wide, JPEG quality 0.6 — keeps payload small while
 * preserving enough detail for the vision model to classify correctly.
 */
async function compressPhoto(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512 } }],
    {
      compress: 0.6,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );
  return result.base64 ?? "";
}

/**
 * Send a single photo to the AI analysis endpoint.
 * Returns tags, a short description, and the main subject.
 */
export async function analyzePhoto(
  uri: string,
  signal?: AbortSignal
): Promise<AIPhotoAnalysis> {
  if (Platform.OS === "web") {
    return { tags: [], description: "AI analysis not supported on web", mainSubject: "" };
  }

  const base64 = await compressPhoto(uri);

  if (!base64) {
    throw new Error("Failed to compress photo");
  }

  const response = await fetch(`${API_BASE_URL}/ai/analyze-photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg" }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<AIPhotoAnalysis>;
}

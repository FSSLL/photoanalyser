/**
 * Gemini Vision Photo Analysis
 *
 * Uses Google Gemini 1.5 Flash to deeply analyze every photo and generate
 * rich, specific tags — people (gender/age), animals (species/breed), food,
 * locations, activities, events, emotions, objects, and more.
 *
 * Photos are resized to 512px before sending to keep API usage minimal.
 * The free tier of Gemini handles thousands of photos per day.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImageManipulator from "expo-image-manipulator";

const STORAGE_KEY_API_KEY = "photo_finder_gemini_api_key";
const STORAGE_KEY_ENABLED = "photo_finder_gemini_enabled";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";

const ANALYSIS_PROMPT = `Analyze this photo in detail and return ONLY a valid JSON object (no markdown, no code blocks):
{
  "description": "One clear sentence describing the main content of this photo",
  "tags": ["20-40 specific searchable single-word or short-phrase tags"],
  "people": ["describe each person: e.g. 'young woman smiling', 'baby boy', 'elderly man', 'teenage girl'"],
  "animals": ["specific animal with breed/species if visible, e.g. 'golden retriever', 'tabby cat', 'parrot'"],
  "food": ["specific food items visible, e.g. 'birthday cake', 'pizza', 'coffee', 'sushi'"],
  "setting": "specific location/scene type, e.g. 'beach', 'kitchen', 'birthday party', 'park', 'gym', 'restaurant', 'bedroom', 'school'",
  "activities": ["what subjects are doing, e.g. 'laughing', 'eating', 'playing', 'hugging', 'swimming', 'dancing'"],
  "objects": ["notable objects in scene, e.g. 'birthday balloons', 'christmas tree', 'swimming pool', 'car', 'flowers'],
  "mood": "overall mood, e.g. 'happy', 'peaceful', 'exciting', 'romantic', 'funny'",
  "time": "time of day if visible: 'sunset', 'night', 'morning', 'afternoon', or 'unknown'"
}

Tags MUST include:
- Gender terms for people: girl, boy, woman, man, baby, child, toddler, teen, adult, elderly
- Specific animal breeds/species if identifiable
- Specific food types
- Event type if apparent: birthday, wedding, graduation, party, vacation, holiday, christmas, halloween
- Scene: indoor or outdoor, specific location
- Colors if distinctive
- Actions/emotions: smiling, crying, laughing, playing, hugging, dancing, running, swimming
- Any text/signs visible
- Any notable objects

Return ONLY the raw JSON object. No explanation, no markdown formatting.`;

async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64 ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function getGeminiApiKey(): Promise<string> {
  return (await AsyncStorage.getItem(STORAGE_KEY_API_KEY).catch(() => "")) ?? "";
}

export async function saveGeminiApiKey(key: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_API_KEY, key.trim()).catch(() => {});
}

export async function getGeminiEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(STORAGE_KEY_ENABLED).catch(() => "false");
  return val === "true";
}

export async function saveGeminiEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_ENABLED, String(enabled)).catch(() => {});
}

export interface GeminiAnalysisResult {
  description: string;
  tags: string[];
  richText: string;
  success: boolean;
}

export async function analyzePhotoWithGemini(
  assetUri: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<GeminiAnalysisResult> {
  if (!apiKey || signal?.aborted) {
    return { description: "", tags: [], richText: "", success: false };
  }

  try {
    const resized = await ImageManipulator.manipulateAsync(
      assetUri,
      [{ resize: { width: 512 } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.78 }
    );

    if (signal?.aborted) return { description: "", tags: [], richText: "", success: false };

    const base64 = await uriToBase64(resized.uri);
    if (!base64) return { description: "", tags: [], richText: "", success: false };

    if (signal?.aborted) return { description: "", tags: [], richText: "", success: false };

    const body = JSON.stringify({
      contents: [
        {
          parts: [
            { text: ANALYSIS_PROMPT },
            { inline_data: { mime_type: "image/jpeg", data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 700,
        responseMimeType: "application/json",
      },
    });

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn("Gemini API error:", response.status, errText.slice(0, 200));
      return { description: "", tags: [], richText: "", success: false };
    }

    const data = await response.json();
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawText) return { description: "", tags: [], richText: "", success: false };

    let parsed: Record<string, any>;
    try {
      const cleaned = rawText.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return { description: "", tags: [], richText: "", success: false };
    }

    const richParts: string[] = [
      parsed.description ?? "",
      parsed.setting ?? "",
      Array.isArray(parsed.people) ? parsed.people.join(" ") : "",
      Array.isArray(parsed.animals) ? parsed.animals.join(" ") : "",
      Array.isArray(parsed.food) ? parsed.food.join(" ") : "",
      Array.isArray(parsed.activities) ? parsed.activities.join(" ") : "",
      Array.isArray(parsed.objects) ? parsed.objects.join(" ") : "",
      parsed.mood ?? "",
      parsed.time ?? "",
    ].filter(Boolean);

    const stopWords = new Set(["a", "an", "the", "of", "in", "on", "at", "with", "and", "or", "is", "are", "was"]);

    const allTagArrays: string[] = [
      ...(Array.isArray(parsed.tags) ? parsed.tags : []),
      ...(Array.isArray(parsed.people) ? parsed.people.flatMap((p: string) => p.toLowerCase().split(/[\s,]+/)) : []),
      ...(Array.isArray(parsed.animals) ? parsed.animals.flatMap((a: string) => a.toLowerCase().split(/[\s,]+/)) : []),
      ...(Array.isArray(parsed.food) ? parsed.food.map((f: string) => f.toLowerCase()) : []),
      ...(parsed.setting ? [parsed.setting.toLowerCase()] : []),
      ...(Array.isArray(parsed.activities) ? parsed.activities.map((a: string) => a.toLowerCase()) : []),
      ...(Array.isArray(parsed.objects) ? parsed.objects.map((o: string) => o.toLowerCase()) : []),
      ...(parsed.mood ? [parsed.mood.toLowerCase()] : []),
    ]
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 1 && !stopWords.has(t));

    return {
      description: parsed.description ?? richParts[0] ?? "",
      tags: [...new Set(allTagArrays)],
      richText: richParts.join(" "),
      success: true,
    };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { description: "", tags: [], richText: "", success: false };
    }
    console.warn("Gemini analysis failed:", err);
    return { description: "", tags: [], richText: "", success: false };
  }
}

export async function testGeminiApiKey(
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey.trim()) return { valid: false, error: "No API key entered" };
  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey.trim()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Say OK" }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });
    if (response.ok) return { valid: true };
    const data = await response.json().catch(() => ({}));
    return {
      valid: false,
      error: data?.error?.message ?? `HTTP ${response.status}`,
    };
  } catch (err) {
    return { valid: false, error: (err as Error).message ?? "Network error" };
  }
}

/**
 * Offline AI Photo Classifier
 *
 * All analysis runs 100% on-device using:
 *   1. EXIF metadata (GPS, flash, ISO, focal length, etc.)
 *   2. Image dimensions & aspect ratio
 *   3. Filename pattern matching
 *   4. ML Kit Image Labeling — recognises actual photo content (food, animals,
 *      nature, people, buildings, etc.) — requires dev/production build
 *   5. ML Kit Text Recognition (OCR) — reads text inside photos for receipts,
 *      documents, whiteboards, menus, etc. — requires dev/production build
 *
 * In Expo Go, steps 4 & 5 gracefully fall back to metadata-only analysis.
 * When the app is built as a dev or App Store build the full ML pipeline runs.
 *
 * Photos NEVER leave the device.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImageManipulator from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

const MODEL_CONFIG_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/ai/model-config`;
const STORAGE_KEY_MODEL_CONFIG = "photo_finder_model_config";
const STORAGE_KEY_MODEL_VERSION = "photo_finder_model_version";

export interface ModelConfig {
  version: string;
  updated_at: string;
  description: string;
  filename_rules: FilenameRule[];
  exif_rules: ExifRule[];
  dimension_rules: DimensionRule[];
  screen_resolutions: [number, number][];
  search_aliases: Record<string, string[]>;
  suggestions: string[];
}

interface FilenameRule {
  pattern: string;
  tags: string[];
  weight: number;
}

interface ExifRule {
  field: string;
  value?: boolean;
  threshold?: number;
  tags: string[];
  weight: number;
}

interface DimensionRule {
  type: "aspect_ratio_range";
  min: number;
  max: number;
  tags?: string[];
  tags_hint?: string;
  weight: number;
}

export interface OfflineAnalysisResult {
  tags: string[];
  confidence: number;
  source: "offline-ai";
  mlkit?: boolean;
}

// ─── Built-in fallback config (used when offline & no cached config) ─────────

const FALLBACK_CONFIG: ModelConfig = {
  version: "1.0.0-builtin",
  updated_at: "2026-04-01",
  description: "Built-in offline classifier",
  filename_rules: [
    { pattern: "screenshot|screen.shot|screen_shot", tags: ["screenshot", "screen", "text"], weight: 10 },
    { pattern: "screen.rec|screenrecord", tags: ["screen recording", "video", "screen"], weight: 10 },
    { pattern: "whatsapp|telegram|signal|viber", tags: ["message", "chat", "conversation"], weight: 10 },
    { pattern: "scan|scanned|scanning", tags: ["scan", "document", "text"], weight: 9 },
    { pattern: "receipt|invoice|bill", tags: ["receipt", "document", "text"], weight: 10 },
    { pattern: "document|\\bdoc\\b", tags: ["document", "text"], weight: 9 },
    { pattern: "\\bid[_\\s\\-]|id_card|idcard|identity|passport|license|licence|national.id", tags: ["id", "document", "text", "id card"], weight: 10 },
    { pattern: "selfie", tags: ["selfie", "portrait", "person"], weight: 9 },
    { pattern: "burst", tags: ["burst", "action", "photo"], weight: 8 },
    { pattern: "panorama|pano", tags: ["panorama", "landscape", "outdoor"], weight: 9 },
    { pattern: "video|vid_|mov_", tags: ["video"], weight: 8 },
    { pattern: "slow.mo|slowmo|slo-mo", tags: ["slow motion", "video"], weight: 9 },
    { pattern: "timelapse|time.lapse", tags: ["timelapse", "video"], weight: 9 },
    { pattern: "qr|barcode|qrcode", tags: ["qr code", "barcode", "scan"], weight: 9 },
    { pattern: "meme", tags: ["meme", "text", "fun"], weight: 8 },
  ],
  exif_rules: [
    { field: "has_gps", value: true, tags: ["outdoor", "location"], weight: 6 },
    { field: "flash_fired", value: true, tags: ["indoor", "flash"], weight: 4 },
    { field: "iso_high", threshold: 1600, tags: ["night", "dark", "indoor"], weight: 5 },
    { field: "focal_length_wide", threshold: 28, tags: ["wide angle", "landscape"], weight: 4 },
    { field: "focal_length_tele", threshold: 70, tags: ["portrait", "zoom"], weight: 4 },
    { field: "long_exposure", threshold: 0.5, tags: ["night", "long exposure"], weight: 6 },
  ],
  dimension_rules: [
    { type: "aspect_ratio_range", min: 0.43, max: 0.50, tags: ["screenshot", "screen"], weight: 7 },
    { type: "aspect_ratio_range", min: 2.5, max: 99, tags: ["panorama", "landscape", "outdoor"], weight: 9 },
    { type: "aspect_ratio_range", min: 0.95, max: 1.05, tags: ["square"], weight: 3 },
  ],
  screen_resolutions: [
    [430, 932], [393, 852], [390, 844], [375, 812], [414, 896],
    [414, 736], [375, 667], [428, 926], [320, 568],
    // Physical pixels
    [1320, 2868], [1290, 2796], [1284, 2778], [1179, 2556],
    [1170, 2532], [1206, 2622], [1125, 2436], [1080, 2340],
    [750, 1334], [640, 1136],
  ],
  search_aliases: {
    // Documents & text
    "id": ["id", "id card", "document", "identity", "passport", "license"],
    "ids": ["id", "id card", "document", "identity"],
    "id card": ["id", "id card", "document", "identity"],
    "passport": ["id", "id card", "document", "passport"],
    "license": ["id", "document", "license"],
    "doc": ["document", "text", "scan"],
    "docs": ["document", "text", "scan"],
    "document": ["document", "text", "scan", "receipt"],
    "documents": ["document", "text", "scan", "receipt"],
    "receipt": ["receipt", "document", "text"],
    "receipts": ["receipt", "document", "text"],
    "text": ["text", "document", "screenshot", "scan"],
    "screenshot": ["screenshot", "screen"],
    "screenshots": ["screenshot", "screen"],
    "screen": ["screenshot", "screen"],
    // Videos
    "vid": ["video"],
    "vids": ["video"],
    "videos": ["video"],
    // People
    "selfie": ["selfie", "portrait", "person"],
    "selfies": ["selfie", "portrait", "person"],
    "portrait": ["selfie", "portrait", "person"],
    "people": ["person", "people"],
    "person": ["person", "people"],
    "friend": ["person", "people"],
    "friends": ["person", "people"],
    "face": ["person", "portrait", "face"],
    "faces": ["person", "portrait", "face"],
    // Animals
    "animal": ["animal", "dog", "cat", "bird", "pet"],
    "animals": ["animal", "dog", "cat", "bird", "pet"],
    "pet": ["pet", "dog", "cat", "animal"],
    "pets": ["pet", "dog", "cat", "animal"],
    "dog": ["dog", "animal", "pet"],
    "dogs": ["dog", "animal", "pet"],
    "cat": ["cat", "animal", "pet"],
    "cats": ["cat", "animal", "pet"],
    "bird": ["bird", "animal"],
    "birds": ["bird", "animal"],
    // Food & drink
    "food": ["food", "meal", "fruit", "vegetable", "restaurant"],
    "foods": ["food", "meal", "fruit", "vegetable"],
    "meal": ["food", "meal"],
    "meals": ["food", "meal"],
    "restaurant": ["food", "meal", "restaurant"],
    "coffee": ["coffee", "drink", "food"],
    "drink": ["drink", "coffee", "food"],
    "drinks": ["drink", "coffee", "food"],
    "breakfast": ["food", "meal"],
    "lunch": ["food", "meal"],
    "dinner": ["food", "meal"],
    "fruit": ["fruit", "food"],
    "pizza": ["pizza", "food"],
    "dessert": ["dessert", "cake", "food"],
    "cake": ["cake", "dessert", "food"],
    // Nature
    "nature": ["nature", "outdoor", "tree", "plant", "flower", "landscape"],
    "outdoor": ["outdoor", "nature", "location"],
    "outdoors": ["outdoor", "nature", "location"],
    "indoor": ["indoor", "flash"],
    "tree": ["tree", "nature", "outdoor", "forest"],
    "trees": ["tree", "nature", "outdoor", "forest"],
    "flower": ["flower", "nature", "outdoor"],
    "flowers": ["flower", "nature", "outdoor"],
    "plant": ["plant", "nature", "outdoor"],
    "plants": ["plant", "nature", "outdoor"],
    "sky": ["sky", "outdoor", "cloud"],
    "clouds": ["cloud", "sky", "outdoor"],
    "beach": ["beach", "outdoor", "water", "ocean"],
    "ocean": ["ocean", "water", "outdoor", "beach"],
    "sea": ["ocean", "water", "outdoor", "beach"],
    "water": ["water", "outdoor", "ocean", "river"],
    "mountain": ["mountain", "outdoor", "nature", "landscape"],
    "mountains": ["mountain", "outdoor", "nature", "landscape"],
    "forest": ["forest", "tree", "outdoor", "nature"],
    "snow": ["snow", "outdoor", "winter", "cold"],
    "winter": ["snow", "winter", "outdoor"],
    "sunset": ["sunset", "outdoor", "sky"],
    "sunrise": ["sunrise", "outdoor", "sky"],
    "landscape": ["landscape", "outdoor", "nature"],
    "grass": ["grass", "outdoor", "nature"],
    // Built environment
    "city": ["city", "urban", "building", "outdoor"],
    "building": ["building", "architecture", "city"],
    "buildings": ["building", "architecture", "city"],
    "architecture": ["architecture", "building"],
    "street": ["street", "city", "urban", "outdoor"],
    // Vehicles
    "car": ["car", "vehicle"],
    "cars": ["car", "vehicle"],
    "vehicle": ["car", "vehicle"],
    // Messaging & social
    "chat": ["message", "chat", "conversation"],
    "message": ["message", "chat", "conversation"],
    "conversation": ["message", "chat", "conversation"],
    // Other photo types
    "scan": ["scan", "document", "text"],
    "panorama": ["panorama", "landscape"],
    "pano": ["panorama", "landscape"],
    "slow motion": ["slow motion", "video"],
    "slow mo": ["slow motion", "video"],
    "night": ["night", "dark", "long exposure"],
    "qr": ["qr code", "barcode", "scan"],
    "barcode": ["qr code", "barcode", "scan"],
    "meme": ["meme", "text", "fun"],
    "art": ["art", "drawing", "handwritten"],
    "drawing": ["art", "drawing", "handwritten"],
    "map": ["map", "location"],
  },
  suggestions: [
    "screenshots", "selfies", "videos", "documents", "receipts",
    "food", "nature", "animals", "people", "sunset",
    "beach", "mountains", "city", "night", "ID",
    "scans", "panoramas", "slow motion",
  ],
};

// ─── In-memory singleton config ───────────────────────────────────────────────

let _config: ModelConfig = FALLBACK_CONFIG;
let _configLoaded = false;

export async function getModelConfig(): Promise<ModelConfig> {
  if (_configLoaded) return _config;

  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY_MODEL_CONFIG);
    if (cached) {
      _config = JSON.parse(cached);
    }
  } catch {
    // Use fallback
  }

  _configLoaded = true;
  return _config;
}

export function getCurrentModelVersion(): string {
  return _config.version;
}

/**
 * Check the server for a model update.
 * Only downloads the config JSON — no photos are sent.
 * Returns true if a new version was downloaded.
 */
export async function checkForModelUpdate(signal?: AbortSignal): Promise<{ updated: boolean; version: string }> {
  if (Platform.OS === "web") return { updated: false, version: _config.version };

  try {
    const response = await fetch(MODEL_CONFIG_URL, { signal });
    if (!response.ok) return { updated: false, version: _config.version };

    const serverConfig: ModelConfig = await response.json();

    if (serverConfig.version !== _config.version) {
      _config = serverConfig;
      _configLoaded = true;
      await AsyncStorage.setItem(STORAGE_KEY_MODEL_CONFIG, JSON.stringify(serverConfig));
      await AsyncStorage.setItem(STORAGE_KEY_MODEL_VERSION, serverConfig.version);
      return { updated: true, version: serverConfig.version };
    }

    return { updated: false, version: _config.version };
  } catch {
    return { updated: false, version: _config.version };
  }
}

// ─── Optional ML Kit modules (dev/production builds only) ────────────────────

interface ImageLabel {
  text: string;
  confidence: number;
}

interface TextRecognitionResult {
  text: string;
  blocks?: Array<{ text: string }>;
}

interface MlKitLabeling {
  label(imagePath: string, options?: { confidenceThreshold?: number }): Promise<ImageLabel[]>;
}

interface MlKitTextRecognition {
  recognize(imagePath: string): Promise<TextRecognitionResult>;
}

let _mlkitLabeling: MlKitLabeling | null = null;
let _mlkitText: MlKitTextRecognition | null = null;
let _mlkitChecked = false;

function initMlKit() {
  if (_mlkitChecked) return;
  _mlkitChecked = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-ml-kit/image-labeling");
    _mlkitLabeling = mod.default ?? mod;
  } catch {
    // Not available in this build (Expo Go)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-ml-kit/text-recognition");
    _mlkitText = mod.default ?? mod;
  } catch {
    // Not available in this build (Expo Go)
  }
}

/** Returns true when ML Kit is linked (dev/production build), false in Expo Go. */
export function isMlKitAvailable(): boolean {
  initMlKit();
  return _mlkitLabeling !== null || _mlkitText !== null;
}

// ─── ML Kit label → app tag mapping ──────────────────────────────────────────

const LABEL_TAG_MAP: Record<string, string[]> = {
  // People
  person: ["person", "people"],
  human: ["person", "people"],
  face: ["person", "portrait", "face"],
  smile: ["person", "portrait"],
  man: ["person", "people"],
  woman: ["person", "people"],
  child: ["person", "people", "child"],
  baby: ["person", "baby", "child"],
  crowd: ["person", "people", "crowd"],
  // Animals
  animal: ["animal"],
  mammal: ["animal"],
  dog: ["dog", "animal", "pet"],
  cat: ["cat", "animal", "pet"],
  bird: ["bird", "animal"],
  horse: ["horse", "animal"],
  fish: ["fish", "animal"],
  rabbit: ["rabbit", "animal", "pet"],
  wildlife: ["animal", "wildlife", "outdoor"],
  // Food & drink
  food: ["food"],
  fruit: ["fruit", "food"],
  vegetable: ["vegetable", "food"],
  pizza: ["pizza", "food"],
  cake: ["cake", "dessert", "food"],
  bread: ["bread", "food"],
  coffee: ["coffee", "drink"],
  drink: ["drink"],
  beverage: ["drink"],
  meal: ["food", "meal"],
  restaurant: ["restaurant", "food"],
  plate: ["food", "meal"],
  // Nature
  tree: ["tree", "nature", "outdoor"],
  plant: ["plant", "nature", "outdoor"],
  flower: ["flower", "nature", "outdoor"],
  grass: ["grass", "outdoor", "nature"],
  sky: ["sky", "outdoor"],
  cloud: ["cloud", "sky", "outdoor"],
  water: ["water", "outdoor"],
  ocean: ["ocean", "water", "outdoor", "beach"],
  sea: ["ocean", "water", "outdoor", "beach"],
  river: ["river", "water", "outdoor"],
  lake: ["lake", "water", "outdoor"],
  beach: ["beach", "outdoor", "water"],
  sand: ["beach", "outdoor", "sand"],
  mountain: ["mountain", "outdoor", "nature", "landscape"],
  forest: ["forest", "outdoor", "nature", "tree"],
  snow: ["snow", "outdoor", "winter"],
  ice: ["ice", "outdoor", "winter"],
  sunset: ["sunset", "outdoor", "sky"],
  sunrise: ["sunrise", "outdoor", "sky"],
  nature: ["nature", "outdoor"],
  landscape: ["landscape", "outdoor"],
  // Built environment
  building: ["building", "architecture"],
  architecture: ["architecture", "building"],
  house: ["house", "building"],
  room: ["room", "indoor"],
  kitchen: ["kitchen", "indoor", "food"],
  street: ["street", "city", "outdoor"],
  city: ["city", "urban", "outdoor"],
  road: ["road", "outdoor", "vehicle"],
  bridge: ["bridge", "architecture", "outdoor"],
  // Vehicles
  car: ["car", "vehicle"],
  vehicle: ["vehicle"],
  truck: ["truck", "vehicle"],
  bicycle: ["bicycle", "vehicle"],
  motorcycle: ["motorcycle", "vehicle"],
  airplane: ["airplane", "vehicle", "travel"],
  boat: ["boat", "vehicle", "water"],
  // Text & documents
  text: ["text", "document"],
  document: ["document", "text"],
  book: ["book", "text"],
  sign: ["sign", "text", "outdoor"],
  label: ["text"],
  // Art & media
  art: ["art", "drawing"],
  painting: ["art", "painting"],
  illustration: ["art", "drawing", "illustration"],
  // Other
  sport: ["sport", "activity"],
  fitness: ["fitness", "sport", "activity"],
  music: ["music"],
  party: ["party", "people", "celebration"],
  travel: ["travel", "outdoor"],
  map: ["map", "location"],
  phone: ["phone", "technology"],
  computer: ["computer", "technology"],
  indoor: ["indoor"],
  outdoor: ["outdoor"],
  night: ["night", "dark"],
  dark: ["night", "dark"],
};

// ─── OCR text analysis ────────────────────────────────────────────────────────

function analyzeOcrText(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();

  if (text.trim().length > 10) {
    tags.push("text");
  }

  // Receipt / invoice patterns
  if (/total|subtotal|receipt|invoice|payment|paid|amount|tax|vat|cash|card/i.test(lower)) {
    tags.push("receipt", "document");
  }

  // Menu
  if (/menu|appetizer|entrée|entree|dessert|beverage|\$/i.test(lower)) {
    tags.push("menu", "food", "document");
  }

  // Phone number
  if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) {
    tags.push("contact");
  }

  // URL / link
  if (/https?:\/\/|www\./i.test(lower)) {
    tags.push("link");
  }

  // Email
  if (/\S+@\S+\.\S+/.test(text)) {
    tags.push("email", "contact");
  }

  // Address
  if (/\b(street|st\.|avenue|ave\.|road|rd\.|boulevard|blvd\.)\b/i.test(lower)) {
    tags.push("address");
  }

  // Whiteboard / handwritten
  if (text.length > 50 && !/[0-9]/.test(text.slice(0, 20))) {
    tags.push("handwritten");
  }

  return tags;
}

// ─── EXIF analysis ────────────────────────────────────────────────────────────

interface ExifData {
  GPSLatitude?: number;
  GPSLongitude?: number;
  Flash?: number;
  ISOSpeedRatings?: number;
  ISO?: number;
  FocalLength?: number;
  FocalLengthIn35mmFilm?: number;
  ExposureTime?: number;
  LensMake?: string;
  LensModel?: string;
  Software?: string;
  UserComment?: string;
  Make?: string;
  Model?: string;
  [key: string]: unknown;
}

function applyFilenameRules(filename: string, rules: FilenameRule[]): Array<{ tags: string[]; weight: number }> {
  const lower = filename.toLowerCase();
  return rules
    .filter((rule) => {
      try {
        return new RegExp(rule.pattern, "i").test(lower);
      } catch {
        return false;
      }
    })
    .map((rule) => ({ tags: rule.tags, weight: rule.weight }));
}

function applyExifRules(exif: ExifData, rules: ExifRule[]): Array<{ tags: string[]; weight: number }> {
  const matches: Array<{ tags: string[]; weight: number }> = [];

  for (const rule of rules) {
    switch (rule.field) {
      case "has_gps":
        if (rule.value === true && (exif.GPSLatitude != null || exif.GPSLongitude != null)) {
          matches.push({ tags: rule.tags, weight: rule.weight });
        }
        break;
      case "flash_fired":
        if (rule.value === true && exif.Flash != null && (exif.Flash & 1) === 1) {
          matches.push({ tags: rule.tags, weight: rule.weight });
        }
        break;
      case "iso_high": {
        const iso = exif.ISOSpeedRatings ?? exif.ISO;
        if (rule.threshold != null && iso != null && iso >= rule.threshold) {
          matches.push({ tags: rule.tags, weight: rule.weight });
        }
        break;
      }
      case "focal_length_wide": {
        const fl = exif.FocalLengthIn35mmFilm ?? exif.FocalLength;
        if (rule.threshold != null && fl != null && fl <= rule.threshold) {
          matches.push({ tags: rule.tags, weight: rule.weight });
        }
        break;
      }
      case "focal_length_tele": {
        const fl = exif.FocalLengthIn35mmFilm ?? exif.FocalLength;
        if (rule.threshold != null && fl != null && fl >= rule.threshold) {
          matches.push({ tags: rule.tags, weight: rule.weight });
        }
        break;
      }
      case "long_exposure": {
        const exp = exif.ExposureTime;
        if (rule.threshold != null && exp != null && exp >= rule.threshold) {
          matches.push({ tags: rule.tags, weight: rule.weight });
        }
        break;
      }
      case "lens_front_camera": {
        const lens = (exif.LensModel ?? exif.LensMake ?? "").toLowerCase();
        if (rule.value === true && lens.includes("front")) {
          matches.push({ tags: rule.tags, weight: rule.weight });
        }
        break;
      }
    }
  }

  return matches;
}

function applyDimensionRules(
  width: number,
  height: number,
  rules: DimensionRule[],
  screenResolutions: [number, number][]
): Array<{ tags: string[]; weight: number }> {
  const matches: Array<{ tags: string[]; weight: number }> = [];
  const ratio = width > 0 && height > 0 ? width / height : 1;

  const isScreenshot = screenResolutions.some(
    ([sw, sh]) =>
      (width === sw && height === sh) ||
      (width === sh && height === sw)
  );
  if (isScreenshot) {
    matches.push({ tags: ["screenshot", "screen", "text"], weight: 12 });
    return matches;
  }

  for (const rule of rules) {
    if (rule.type === "aspect_ratio_range") {
      if (ratio >= rule.min && ratio <= rule.max) {
        if (rule.tags) {
          matches.push({ tags: rule.tags, weight: rule.weight });
        }
      }
    }
  }

  return matches;
}

function extractExifSignals(exif: ExifData): string[] {
  const tags: string[] = [];
  const software = (exif.Software ?? "").toLowerCase();
  const userComment = (exif.UserComment ?? "").toLowerCase();

  if (software.includes("scan") || software.includes("document") || software.includes("adobe scan")) {
    tags.push("scan", "document", "text");
  }
  if (software.includes("notes") || software.includes("notability") || software.includes("procreate")) {
    tags.push("drawing", "art", "handwritten");
  }
  if (software.includes("lightroom") || software.includes("vsco") || software.includes("snapseed")) {
    tags.push("edited", "photo");
  }
  if (software.includes("instagram") || software.includes("tiktok") || software.includes("snapchat")) {
    tags.push("social media", "photo");
  }
  if (userComment && userComment.length > 3 && !userComment.includes("ascii")) {
    tags.push("text");
  }

  return tags;
}

// ─── ML Kit visual analysis ───────────────────────────────────────────────────

async function runMlKitAnalysis(
  assetUri: string,
  existingTagKeys: Set<string>,
  signal?: AbortSignal
): Promise<Array<{ tags: string[]; weight: number; source: string }>> {
  if (Platform.OS === "web" || signal?.aborted) return [];

  initMlKit();
  if (!_mlkitLabeling && !_mlkitText) return [];

  const results: Array<{ tags: string[]; weight: number; source: string }> = [];

  try {
    // Resize to 640px wide — faster ML processing, still good accuracy
    const resized = await ImageManipulator.manipulateAsync(
      assetUri,
      [{ resize: { width: 640 } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.82 }
    );

    if (signal?.aborted) return results;

    // ── Image labeling ─────────────────────────────────────────────────────
    if (_mlkitLabeling) {
      try {
        const labels = await _mlkitLabeling.label(resized.uri, { confidenceThreshold: 0.55 });

        for (const label of labels) {
          const key = label.text.toLowerCase();
          const mapped = LABEL_TAG_MAP[key];
          const weight = Math.max(1, Math.round(label.confidence * 9));

          if (mapped) {
            results.push({ tags: mapped, weight, source: "mlkit-label" });
          } else {
            // Add the raw label as a tag so users can still search it
            results.push({ tags: [key], weight: Math.max(1, weight - 2), source: "mlkit-label" });
          }
        }
      } catch {
        // ML Kit not linked in this build — silently ignore
      }
    }

    if (signal?.aborted) return results;

    // ── OCR / Text recognition ────────────────────────────────────────────
    // Run OCR if: (a) existing tags suggest text content, OR
    //             (b) image labeling found a text-related label
    const textRelatedTags = ["screenshot", "document", "receipt", "scan", "text", "id", "id card", "sign", "book", "whiteboard"];
    const shouldRunOcr =
      textRelatedTags.some((t) => existingTagKeys.has(t)) ||
      results.some((r) => r.tags.some((t) => textRelatedTags.includes(t)));

    if (_mlkitText && shouldRunOcr) {
      try {
        const ocrResult = await _mlkitText.recognize(resized.uri);
        if (ocrResult.text && ocrResult.text.trim().length > 5) {
          const ocrTags = analyzeOcrText(ocrResult.text);
          if (ocrTags.length > 0) {
            results.push({ tags: ocrTags, weight: 7, source: "mlkit-ocr" });
          }
        }
      } catch {
        // OCR not linked in this build — silently ignore
      }
    }
  } catch {
    // Image resize failed or ML Kit threw — fall through to metadata results
  }

  return results;
}

// ─── Main public API ──────────────────────────────────────────────────────────

/**
 * Analyse a single photo fully on-device.
 * Combines EXIF + filename + dimensions + ML Kit visual analysis (when available).
 * No photos are ever sent anywhere.
 */
export async function analyzePhotoOffline(
  asset: MediaLibrary.Asset,
  signal?: AbortSignal
): Promise<OfflineAnalysisResult> {
  const config = await getModelConfig();

  const tagScores = new Map<string, number>();

  const addTags = (tags: string[], weight: number) => {
    for (const tag of tags) {
      tagScores.set(tag, (tagScores.get(tag) ?? 0) + weight);
    }
  };

  // 1. Media type
  if (asset.mediaType === "video") {
    addTags(["video"], 10);
  } else {
    addTags(["photo"], 1);
  }

  // 2. Filename rules
  const filenameMatches = applyFilenameRules(asset.filename || "", config.filename_rules);
  for (const m of filenameMatches) addTags(m.tags, m.weight);

  // 3. Dimension rules
  const dimMatches = applyDimensionRules(
    asset.width,
    asset.height,
    config.dimension_rules,
    config.screen_resolutions
  );
  for (const m of dimMatches) addTags(m.tags, m.weight);

  // 4. EXIF data (on-device disk read)
  if (!signal?.aborted && Platform.OS !== "web") {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
      const exif = (info.exif as ExifData) ?? {};

      const exifMatches = applyExifRules(exif, config.exif_rules);
      for (const m of exifMatches) addTags(m.tags, m.weight);

      const exifSignals = extractExifSignals(exif);
      addTags(exifSignals, 5);
    } catch {
      // EXIF unavailable — continue with what we have
    }
  }

  // 5. ML Kit visual analysis (image labeling + OCR)
  //    Only runs in dev/production builds. Gracefully skipped in Expo Go.
  let usedMlKit = false;
  if (!signal?.aborted && asset.mediaType !== "video") {
    const existingTagKeys = new Set(tagScores.keys());
    const mlResults = await runMlKitAnalysis(asset.uri, existingTagKeys, signal);

    if (mlResults.length > 0) {
      usedMlKit = true;
      for (const m of mlResults) addTags(m.tags, m.weight);
    }
  }

  // 6. Build final tag list sorted by score
  const sortedTags = [...tagScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  const maxScore = Math.max(...tagScores.values(), 0);
  const confidence = Math.min(maxScore / 10, 1);

  return {
    tags: sortedTags,
    confidence,
    source: "offline-ai",
    mlkit: usedMlKit,
  };
}

/**
 * Expand search query words using the model's alias map.
 * Runs fully offline using cached config.
 */
export async function expandSearchQuery(words: string[]): Promise<string[]> {
  const config = await getModelConfig();
  const expanded = new Set<string>(words);

  const fullQuery = words.join(" ");
  const fullAliases = config.search_aliases[fullQuery];
  if (fullAliases) fullAliases.forEach((t) => expanded.add(t));

  for (const word of words) {
    const aliases = config.search_aliases[word];
    if (aliases) aliases.forEach((t) => expanded.add(t));
  }

  return [...expanded];
}

/**
 * Get suggestion chips from the model config.
 */
export async function getSearchSuggestions(): Promise<string[]> {
  const config = await getModelConfig();
  return config.suggestions;
}

/**
 * Offline AI Photo Classifier
 *
 * All analysis runs 100% on-device using:
 *   - EXIF metadata (GPS, flash, ISO, focal length, etc.)
 *   - Image dimensions & aspect ratio
 *   - Filename pattern matching
 *
 * The classifier "model" is a rules config downloaded from the server (just JSON,
 * never photos). The app caches it locally so it works fully offline, and can
 * self-update by downloading a newer config version when available.
 *
 * Photos NEVER leave the device.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
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
  ],
  search_aliases: {
    "id": ["id", "id card", "document", "identity", "passport", "license"],
    "ids": ["id", "id card", "document", "identity"],
    "id card": ["id", "id card", "document", "identity"],
    "passport": ["id", "id card", "document", "passport"],
    "license": ["id", "document", "license"],
    "doc": ["document", "text", "scan"],
    "docs": ["document", "text", "scan"],
    "document": ["document", "text", "scan", "receipt"],
    "receipt": ["receipt", "document", "text"],
    "text": ["text", "document", "screenshot", "scan"],
    "screenshot": ["screenshot", "screen"],
    "screenshots": ["screenshot", "screen"],
    "screen": ["screenshot", "screen"],
    "vid": ["video"],
    "vids": ["video"],
    "videos": ["video"],
    "selfie": ["selfie", "portrait", "person"],
    "selfies": ["selfie", "portrait", "person"],
    "portrait": ["selfie", "portrait", "person"],
    "chat": ["message", "chat", "conversation"],
    "message": ["message", "chat", "conversation"],
    "scan": ["scan", "document", "text"],
    "panorama": ["panorama", "landscape"],
    "pano": ["panorama", "landscape"],
    "slow motion": ["slow motion", "video"],
    "slow mo": ["slow motion", "video"],
    "night": ["night", "dark", "long exposure"],
    "outdoor": ["outdoor", "location", "nature"],
    "outdoors": ["outdoor", "location", "nature"],
    "indoor": ["indoor", "flash"],
    "qr": ["qr code", "barcode", "scan"],
    "barcode": ["qr code", "barcode", "scan"],
  },
  suggestions: [
    "screenshots", "selfies", "videos", "documents", "ID",
    "receipts", "scans", "panoramas", "night", "outdoor", "slow motion",
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

// ─── Offline Photo Analyzer ───────────────────────────────────────────────────

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
        // Flash EXIF bit 0 = flash fired
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

  // Check if exact screen resolution (high confidence screenshot)
  const isScreenshot = screenResolutions.some(
    ([sw, sh]) =>
      (width === sw && height === sh) ||
      (width === sh && height === sw) // rotated
  );
  if (isScreenshot) {
    matches.push({ tags: ["screenshot", "screen", "text"], weight: 12 });
    return matches; // No need to check further
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

  // Scanner / document apps
  if (software.includes("scan") || software.includes("document") || software.includes("adobe scan")) {
    tags.push("scan", "document", "text");
  }
  // Note-taking / drawing apps
  if (software.includes("notes") || software.includes("notability") || software.includes("procreate")) {
    tags.push("drawing", "art", "handwritten");
  }
  // Photo editors
  if (software.includes("lightroom") || software.includes("vsco") || software.includes("snapseed")) {
    tags.push("edited", "photo");
  }
  // Social media saves
  if (software.includes("instagram") || software.includes("tiktok") || software.includes("snapchat")) {
    tags.push("social media", "photo");
  }

  // User comment might contain meaningful data
  if (userComment && userComment.length > 3 && !userComment.includes("ascii")) {
    tags.push("text");
  }

  return tags;
}

/**
 * Analyze a single photo on-device using EXIF + filename + dimensions.
 * This is the main entry point — no photos are sent anywhere.
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

  // 2. Filename rules (fast, no network/disk I/O)
  const filenameMatches = applyFilenameRules(asset.filename || "", config.filename_rules);
  for (const m of filenameMatches) addTags(m.tags, m.weight);

  // 3. Dimension rules (fast)
  const dimMatches = applyDimensionRules(
    asset.width,
    asset.height,
    config.dimension_rules,
    config.screen_resolutions
  );
  for (const m of dimMatches) addTags(m.tags, m.weight);

  // 4. EXIF data (requires disk read, but stays on device)
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

  // 5. Build final tag list sorted by score
  const sortedTags = [...tagScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // Confidence: rough estimate based on max score achieved
  const maxScore = Math.max(...tagScores.values(), 0);
  const confidence = Math.min(maxScore / 10, 1);

  return {
    tags: sortedTags,
    confidence,
    source: "offline-ai",
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

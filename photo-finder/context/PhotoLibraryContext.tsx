import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, Linking, Platform } from "react-native";
import {
  analyzePhotoOffline,
  checkForModelUpdate,
  generatePhotoDescription,
  getModelConfig,
  getCurrentModelVersion,
} from "@/services/offlineAIService";

export type PhotoAsset = {
  id: string;
  uri: string;
  filename: string;
  mediaType: MediaLibrary.MediaTypeValue;
  width: number;
  height: number;
  creationTime: number;
  modificationTime: number;
  duration?: number;
  localUri?: string;
  albumId?: string;
  tags?: string[];
  description?: string;
  isIndexed?: boolean;
};

export type IndexStatus = {
  total: number;
  indexed: number;
  isIndexing: boolean;
  lastIndexed: number | null;
};

export type AIAnalysisProgress = {
  total: number;
  analyzed: number;
  isAnalyzing: boolean;
  lastAnalyzed: number | null;
  error: string | null;
};

export type PermissionStatus = "undetermined" | "granted" | "limited" | "denied";

type PhotoLibraryContextType = {
  permission: PermissionStatus;
  requestPermission: () => Promise<void>;
  photos: PhotoAsset[];
  recentPhotos: PhotoAsset[];
  loadPhotos: () => Promise<void>;
  loadMorePhotos: () => Promise<void>;
  isLoading: boolean;
  hasMore: boolean;
  indexStatus: IndexStatus;
  indexPhotos: () => Promise<void>;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteSelected: () => Promise<boolean>;
  deleteIds: (ids: string[]) => Promise<boolean>;
  getPhotoById: (id: string) => PhotoAsset | undefined;
  searchResults: PhotoAsset[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSearching: boolean;
  recentSearches: string[];
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
  sortOrder: "match" | "newest" | "oldest";
  setSortOrder: (o: "match" | "newest" | "oldest") => void;
  cloudEnabled: boolean;
  setCloudEnabled: (v: boolean) => void;
  reviewBeforeDelete: boolean;
  setReviewBeforeDelete: (v: boolean) => void;
  aiProgress: AIAnalysisProgress;
  analyzeAllWithAI: () => Promise<void>;
  modelVersion: string;
  checkForModelUpdate: () => Promise<{ updated: boolean; version: string }>;
  cancelAIAnalysis: () => void;
};

const PhotoLibraryContext = createContext<PhotoLibraryContextType | null>(null);

const PAGE_SIZE = 80;
const RECENT_SIZE = 30;
const STORAGE_KEY_SEARCHES = "photo_finder_recent_searches";
const STORAGE_KEY_SETTINGS = "photo_finder_settings";
const STORAGE_KEY_AI_TAGS = "photo_finder_ai_tags";
const AI_BATCH_SIZE = 3; // concurrent photos to analyze at once

// iPhone screen widths (logical points) and physical pixel widths for screenshot detection
const IOS_SCREEN_WIDTHS = new Set([
  // Logical points (used by media library on some iOS versions)
  430, 428, 414, 393, 390, 375, 320,
  // Physical pixels (most common - media library returns these)
  1320, 1290, 1284, 1242, 1206, 1179, 1170, 1125, 1080, 750, 640,
]);
const IOS_SCREEN_HEIGHTS = new Set([
  // Logical points
  932, 926, 896, 852, 844, 812, 736, 667, 568,
  // Physical pixels
  2868, 2796, 2778, 2732, 2688, 2622, 2556, 2532, 2436, 2208, 1624, 1334, 1136,
]);

/**
 * Quick synchronous tag assignment using filename, mediaType, and dimensions.
 * Used for photos loaded into the grid before full offline AI analysis runs.
 * The offline AI service provides richer tags (including EXIF) after analysis.
 */
function quickTagsFromFilename(asset: MediaLibrary.Asset): string[] {
  const tags: string[] = [];
  const filename = (asset.filename || "").toLowerCase();
  const ext = filename.split(".").pop() || "";

  if (asset.mediaType === "video") tags.push("video");

  // ── Dimension-based detection (reliable, no filename needed) ──────────────

  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  const ratio = w > 0 && h > 0 ? w / h : 1;

  // Exact screen resolution → screenshot (most reliable method on iOS)
  const isScreenshot =
    (IOS_SCREEN_WIDTHS.has(w) && IOS_SCREEN_HEIGHTS.has(h)) ||
    (IOS_SCREEN_WIDTHS.has(h) && IOS_SCREEN_HEIGHTS.has(w));

  if (isScreenshot) {
    tags.push("screenshot", "screen", "text");
  }

  // Panorama: very wide aspect ratio
  if (!isScreenshot && ratio >= 2.5) {
    tags.push("panorama", "landscape");
  }

  // Square: social media / food photo
  if (ratio >= 0.97 && ratio <= 1.03 && w < 1000) {
    tags.push("square");
  }

  // ── Filename pattern checks ───────────────────────────────────────────────

  const checks: [RegExp, string[]][] = [
    [/screenshot|screen.shot|screen_shot/i, ["screenshot", "screen", "text"]],
    [/screen.rec|recording/i, ["screen recording", "video", "screen"]],
    [/whatsapp|telegram|signal/i, ["message", "chat", "conversation"]],
    [/scan|scanned/i, ["scan", "document", "text"]],
    [/receipt|invoice|bill/i, ["receipt", "document", "text"]],
    [/\bid[\s_\-]|id_card|idcard|identity|passport|license|licence/i, ["id", "document", "text", "id card"]],
    [/selfie/i, ["selfie", "portrait", "person"]],
    [/front.cam|front_cam/i, ["selfie", "portrait", "person"]],
    [/burst/i, ["burst", "action"]],
    [/panorama|pano/i, ["panorama", "landscape"]],
    [/video|vid_|mov_/i, ["video"]],
    [/slow.mo|slowmo|slo.mo/i, ["slow motion", "video"]],
    [/timelapse|time.lapse/i, ["timelapse", "video"]],
    [/document|doc\b/i, ["document", "text"]],
    [/live.photo|livp/i, ["live photo"]],
    [/portrait.mode|depth/i, ["portrait", "depth"]],
    [/qr|barcode/i, ["qr code", "barcode"]],
    [/meme/i, ["meme", "text"]],
  ];

  let fileMatched = false;
  for (const [pattern, patTags] of checks) {
    if (pattern.test(filename)) {
      tags.push(...patTags);
      fileMatched = true;
    }
  }

  // Generic photo tag if no specific pattern matched and not a screenshot/video
  if (!fileMatched && !isScreenshot && asset.mediaType !== "video") {
    tags.push("photo");
  }

  // Ensure photo images get the "photo" tag if not already tagged
  if (["jpg", "jpeg", "heic", "png"].includes(ext) && !tags.includes("photo") && !isScreenshot && !tags.includes("screenshot")) {
    tags.push("photo");
  }

  return [...new Set(tags)];
}

// In-memory search aliases cache — populated from offline AI config on load
let _searchAliasesCache: Record<string, string[]> = {
  // ── People ──────────────────────────────────────────────────────────────────
  "girl":       ["person", "woman", "girl", "child", "female", "people", "face", "portrait"],
  "girls":      ["person", "woman", "girl", "child", "female", "people", "face", "portrait"],
  "boy":        ["person", "man", "boy", "child", "male", "people", "face", "portrait"],
  "boys":       ["person", "man", "boy", "child", "male", "people", "face", "portrait"],
  "woman":      ["person", "woman", "female", "people", "face", "portrait"],
  "women":      ["person", "woman", "female", "people", "face", "portrait"],
  "man":        ["person", "man", "male", "people", "face", "portrait"],
  "men":        ["person", "man", "male", "people", "face", "portrait"],
  "baby":       ["baby", "child", "person", "people", "toddler"],
  "babies":     ["baby", "child", "person", "people", "toddler"],
  "infant":     ["baby", "child", "person", "people"],
  "toddler":    ["baby", "child", "person", "people"],
  "toddlers":   ["baby", "child", "person", "people"],
  "kid":        ["child", "person", "people", "boy", "girl"],
  "kids":       ["child", "person", "people", "boy", "girl"],
  "child":      ["child", "person", "people", "boy", "girl", "baby"],
  "children":   ["child", "person", "people", "boy", "girl"],
  "teen":       ["person", "people", "face", "portrait"],
  "teenager":   ["person", "people", "face", "portrait"],
  "elderly":    ["person", "people", "face", "portrait"],
  "senior":     ["person", "people", "face", "portrait"],
  "couple":     ["couple", "person", "people", "portrait", "face"],
  "couples":    ["couple", "person", "people", "portrait"],
  "family":     ["family", "person", "people", "group", "portrait", "child"],
  "families":   ["family", "person", "people", "group", "child"],
  "group":      ["group", "person", "people", "crowd"],
  "groups":     ["group", "person", "people", "crowd"],
  "crowd":      ["crowd", "person", "people", "group"],
  "people":     ["person", "people", "crowd", "group"],
  "person":     ["person", "people", "face"],
  "friend":     ["person", "people", "portrait", "selfie"],
  "friends":    ["person", "people", "portrait", "selfie"],
  "face":       ["person", "portrait", "face", "selfie"],
  "faces":      ["person", "portrait", "face"],
  "selfie":     ["selfie", "portrait", "person", "face"],
  "selfies":    ["selfie", "portrait", "person"],
  "portrait":   ["selfie", "portrait", "person", "face"],
  // ── Documents & IDs ─────────────────────────────────────────────────────────
  "id":         ["id", "id card", "document", "identity", "passport", "license"],
  "ids":        ["id", "id card", "document", "identity"],
  "id card":    ["id", "id card", "document", "identity"],
  "passport":   ["id", "id card", "document", "passport"],
  "license":    ["id", "document", "license"],
  "doc":        ["document", "text", "scan"],
  "document":   ["document", "text", "scan", "receipt"],
  "receipt":    ["receipt", "document", "text"],
  "screenshot": ["screenshot", "screen"],
  "screenshots":["screenshot", "screen"],
  "screen":     ["screenshot", "screen"],
  "scan":       ["scan", "document", "text"],
  // ── Videos ───────────────────────────────────────────────────────────────────
  "vid":        ["video"],
  "vids":       ["video"],
  "videos":     ["video"],
  // ── Messaging ────────────────────────────────────────────────────────────────
  "chat":       ["message", "chat", "conversation"],
  "message":    ["message", "chat", "conversation"],
  // ── Places ───────────────────────────────────────────────────────────────────
  "panorama":   ["panorama", "landscape"],
  "pano":       ["panorama", "landscape"],
  "night":      ["night", "dark", "long exposure"],
  "outdoor":    ["outdoor", "location", "nature"],
  "outdoors":   ["outdoor", "location", "nature"],
  "indoor":     ["indoor", "flash"],
  "beach":      ["beach", "outdoor", "water", "ocean", "sand"],
  "ocean":      ["ocean", "water", "outdoor", "beach"],
  "sea":        ["ocean", "water", "outdoor", "beach"],
  "water":      ["water", "outdoor", "ocean", "river"],
  "mountain":   ["mountain", "outdoor", "nature", "landscape"],
  "mountains":  ["mountain", "outdoor", "nature", "landscape"],
  "forest":     ["forest", "tree", "outdoor", "nature"],
  "nature":     ["nature", "outdoor", "tree", "plant", "flower", "landscape"],
  "sky":        ["sky", "outdoor", "cloud"],
  "clouds":     ["cloud", "sky", "outdoor"],
  "sunset":     ["sunset", "outdoor", "sky"],
  "sunrise":    ["sunrise", "outdoor", "sky"],
  "snow":       ["snow", "outdoor", "winter"],
  "winter":     ["snow", "winter", "outdoor"],
  "city":       ["city", "urban", "building", "outdoor", "street"],
  "street":     ["street", "city", "urban", "outdoor"],
  // ── Activities & events ──────────────────────────────────────────────────────
  "vacation":   ["outdoor", "travel", "beach", "landscape", "nature"],
  "holiday":    ["outdoor", "travel", "celebration", "nature"],
  "travel":     ["travel", "outdoor", "landscape", "building", "city"],
  "birthday":   ["celebration", "cake", "food", "person", "party"],
  "wedding":    ["wedding", "celebration", "couple", "person", "outdoor", "portrait"],
  "party":      ["party", "people", "celebration", "person", "group"],
  "celebration":["celebration", "party", "person", "people"],
  "graduation": ["celebration", "person", "group", "portrait"],
  "workout":    ["fitness", "sport", "activity", "outdoor"],
  "exercise":   ["fitness", "sport", "activity"],
  "gym":        ["fitness", "sport", "indoor"],
  "sport":      ["sport", "fitness", "activity", "outdoor"],
  "sports":     ["sport", "fitness", "activity", "outdoor"],
  "running":    ["fitness", "sport", "outdoor", "activity"],
  "swimming":   ["fitness", "sport", "water", "outdoor"],
  // ── Food ─────────────────────────────────────────────────────────────────────
  "food":       ["food", "meal", "fruit", "vegetable", "restaurant"],
  "meal":       ["food", "meal"],
  "restaurant": ["food", "meal", "restaurant"],
  "coffee":     ["coffee", "drink", "food"],
  "drink":      ["drink", "coffee", "food"],
  "fruit":      ["fruit", "food"],
  "cake":       ["cake", "dessert", "food"],
  "dessert":    ["dessert", "cake", "food"],
  // ── Animals ───────────────────────────────────────────────────────────────────
  "animal":     ["animal", "dog", "cat", "bird", "pet"],
  "animals":    ["animal", "dog", "cat", "bird", "pet"],
  "pet":        ["pet", "dog", "cat", "animal"],
  "pets":       ["pet", "dog", "cat", "animal"],
  "dog":        ["dog", "animal", "pet"],
  "dogs":       ["dog", "animal", "pet"],
  "cat":        ["cat", "animal", "pet"],
  "cats":       ["cat", "animal", "pet"],
};

/**
 * Basic English depluralization so "dogs" matches the "dog" tag,
 * "beaches" matches "beach", "cities" matches "city", etc.
 */
function depluralize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (/ches$|shes$|xes$|zes$|sses$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function syncExpandQuery(words: string[]): string[] {
  const expanded = new Set<string>(words);

  // Add singular/stem forms of each word
  for (const word of words) {
    const stem = depluralize(word);
    if (stem !== word) expanded.add(stem);
  }

  // Alias expansion (covers both original and stem forms)
  const allWords = [...expanded];
  const fullQuery = words.join(" ");
  const fullAliases = _searchAliasesCache[fullQuery];
  if (fullAliases) fullAliases.forEach((t) => expanded.add(t));
  for (const word of allWords) {
    const aliases = _searchAliasesCache[word];
    if (aliases) aliases.forEach((t) => expanded.add(t));
  }

  return [...expanded];
}

function searchPhotos(photos: PhotoAsset[], query: string): PhotoAsset[] {
  if (!query.trim()) return [];
  const rawWords = query.toLowerCase().trim().split(/\s+/);
  const searchTerms = syncExpandQuery(rawWords);

  const scored = photos
    .map((photo) => {
      const tags = photo.tags || [];
      const filename = (photo.filename || "").toLowerCase();
      const description = (photo.description || "").toLowerCase();
      const fileWords = filename.split(/[\s_\-./]+/).filter(Boolean);
      const descWords = description.split(/\s+/).filter(Boolean);
      let score = 0;

      for (const term of searchTerms) {
        // ── Tag matches (highest confidence — AI/metadata assigned) ───────────
        if (tags.includes(term)) { score += 15; continue; }
        if (term.length >= 3 && tags.some((t) => t.startsWith(term))) { score += 8; continue; }
        if (term.length >= 4 && tags.some((t) => t.includes(term))) score += 4;

        // ── Description matches (visual AI words — good confidence) ───────────
        if (descWords.includes(term)) { score += 10; continue; }
        if (term.length >= 4 && descWords.some((w) => w.startsWith(term))) score += 6;
        if (term.length >= 4 && description.includes(term)) score += 3;

        // ── Filename matches ──────────────────────────────────────────────────
        if (fileWords.includes(term)) score += 12;
        else if (term.length >= 3 && filename.includes(term)) score += 5;
      }

      return { photo, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((x) => x.photo);
}

export function PhotoLibraryProvider({ children }: { children: React.ReactNode }) {
  const [permission, setPermission] = useState<PermissionStatus>("undetermined");
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<PhotoAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({
    total: 0,
    indexed: 0,
    isIndexing: false,
    lastIndexed: null,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQueryState] = useState("");
  const [searchResults, setSearchResults] = useState<PhotoAsset[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<"match" | "newest" | "oldest">("match");
  const [cloudEnabled, setCloudEnabledState] = useState(false);
  const [reviewBeforeDelete, setReviewBeforeDeleteState] = useState(true);
  const [modelVersion, setModelVersion] = useState<string>(getCurrentModelVersion());

  const [aiProgress, setAIProgress] = useState<AIAnalysisProgress>({
    total: 0,
    analyzed: 0,
    isAnalyzing: false,
    lastAnalyzed: null,
    error: null,
  });

  const indexedPhotosRef = useRef<Map<string, string[]>>(new Map());
  const aiTagsRef = useRef<Map<string, string[]>>(new Map());
  const aiAbortRef = useRef<AbortController | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadPhotosRef = useRef<() => Promise<void>>(async () => {});

  // Load settings and AI tags from AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const searches = await AsyncStorage.getItem(STORAGE_KEY_SEARCHES);
        if (searches) setRecentSearches(JSON.parse(searches));
        const settings = await AsyncStorage.getItem(STORAGE_KEY_SETTINGS);
        if (settings) {
          const s = JSON.parse(settings);
          if (typeof s.cloudEnabled === "boolean") setCloudEnabledState(s.cloudEnabled);
          if (typeof s.reviewBeforeDelete === "boolean") setReviewBeforeDeleteState(s.reviewBeforeDelete);
        }
        // Load previously AI-analyzed tags so search works immediately on reopen
        const aiTagsRaw = await AsyncStorage.getItem(STORAGE_KEY_AI_TAGS);
        if (aiTagsRaw) {
          const parsed: Record<string, { tags: string[]; ts: number }> = JSON.parse(aiTagsRaw);
          for (const [id, { tags }] of Object.entries(parsed)) {
            aiTagsRef.current.set(id, tags);
          }
          setAIProgress((prev) => ({
            ...prev,
            analyzed: Object.keys(parsed).length,
            lastAnalyzed: Math.max(...Object.values(parsed).map((v) => v.ts), 0) || null,
          }));
        }
      } catch (_) {}
    })();
  }, []);

  const setCloudEnabled = useCallback(async (v: boolean) => {
    setCloudEnabledState(v);
    const settings = await AsyncStorage.getItem(STORAGE_KEY_SETTINGS).catch(() => "{}");
    const parsed = JSON.parse(settings || "{}");
    await AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({ ...parsed, cloudEnabled: v })).catch(() => {});
  }, []);

  const setReviewBeforeDelete = useCallback(async (v: boolean) => {
    setReviewBeforeDeleteState(v);
    const settings = await AsyncStorage.getItem(STORAGE_KEY_SETTINGS).catch(() => "{}");
    const parsed = JSON.parse(settings || "{}");
    await AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({ ...parsed, reviewBeforeDelete: v })).catch(() => {});
  }, []);

  // Check permission on mount
  useEffect(() => {
    (async () => {
      const { status, accessPrivileges } = await MediaLibrary.getPermissionsAsync();
      if (status === "granted") {
        setPermission(accessPrivileges === "limited" ? "limited" : "granted");
      } else {
        setPermission(status as PermissionStatus);
      }
    })();
  }, []);

  // Load offline AI model config on mount (updates search aliases cache)
  useEffect(() => {
    (async () => {
      const config = await getModelConfig();
      if (config.search_aliases) {
        _searchAliasesCache = { ..._searchAliasesCache, ...config.search_aliases };
      }
      setModelVersion(config.version);

      // Try to fetch a newer config in background — only downloads JSON, no photos
      try {
        const result = await checkForModelUpdate();
        if (result.updated) {
          const updated = await getModelConfig();
          if (updated.search_aliases) {
            _searchAliasesCache = { ..._searchAliasesCache, ...updated.search_aliases };
          }
          setModelVersion(result.version);
        }
      } catch {
        // Network unavailable — use cached config
      }
    })();
  }, []);

  const handleCheckForModelUpdate = useCallback(async (): Promise<{ updated: boolean; version: string }> => {
    const result = await checkForModelUpdate();
    if (result.updated) {
      const config = await getModelConfig();
      if (config.search_aliases) {
        _searchAliasesCache = { ..._searchAliasesCache, ...config.search_aliases };
      }
      setModelVersion(result.version);
    }
    return result;
  }, []);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not supported", "Photo library access is only available on a real iOS or Android device.");
      return;
    }

    // If already limited on iOS, open the native photo picker to let the user select more photos
    if (permission === "limited" && Platform.OS === "ios") {
      try {
        await MediaLibrary.presentPermissionsPickerAsync();
        // Re-check permission after the picker closes
        const { status, accessPrivileges } = await MediaLibrary.getPermissionsAsync();
        if (status === "granted") {
          const next = accessPrivileges === "limited" ? "limited" : "granted";
          setPermission(next);
          // Reload photos to pick up any newly added ones
          if (next !== "denied") loadPhotosRef.current();
        }
      } catch (_) {
        // presentPermissionsPickerAsync not available on this OS version — fall back
        Linking.openSettings();
      }
      return;
    }

    // If denied, the only way is to open system Settings
    if (permission === "denied") {
      Alert.alert(
        "Permission Required",
        "Photo Finder AI needs access to your photo library. Please enable it in your device Settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    // First-time or undetermined: request normally
    const { status, accessPrivileges } = await MediaLibrary.requestPermissionsAsync();
    if (status === "granted") {
      setPermission(accessPrivileges === "limited" ? "limited" : "granted");
    } else {
      setPermission(status as PermissionStatus);
    }
  }, [permission]);

  // Build merged tags: AI tags (precise) + quick filename tags (always available)
  const buildTags = useCallback((a: MediaLibrary.Asset): string[] => {
    const aiTags = aiTagsRef.current.get(a.id);
    const filenameTags = quickTagsFromFilename(a);
    if (aiTags && aiTags.length > 0) {
      return [...new Set([...aiTags, ...filenameTags])];
    }
    return filenameTags;
  }, []);

  const loadPhotos = useCallback(async () => {
    if (permission === "denied" || permission === "undetermined") return;
    setIsLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: ["photo", "video"],
        sortBy: [MediaLibrary.SortBy.creationTime],
        first: PAGE_SIZE,
      });

      const assets: PhotoAsset[] = result.assets.map((a) => {
        const tags = buildTags(a);
        return {
          id: a.id,
          uri: a.uri,
          filename: a.filename,
          mediaType: a.mediaType,
          width: a.width,
          height: a.height,
          creationTime: a.creationTime,
          modificationTime: a.modificationTime,
          duration: a.duration,
          tags,
          description: generatePhotoDescription(tags, a.mediaType),
          isIndexed: aiTagsRef.current.has(a.id),
        };
      });

      setPhotos(assets);
      setRecentPhotos(assets.slice(0, RECENT_SIZE));
      setCursor(result.endCursor);
      setHasMore(result.hasNextPage);

      setIndexStatus((prev) => ({
        ...prev,
        total: result.totalCount,
        indexed: assets.length,
      }));
    } catch (e) {
      console.warn("loadPhotos error", e);
    } finally {
      setIsLoading(false);
    }
  }, [permission]);

  // Keep the ref in sync so requestPermission can call loadPhotos without a circular dep
  useEffect(() => {
    loadPhotosRef.current = loadPhotos;
  }, [loadPhotos]);

  const loadMorePhotos = useCallback(async () => {
    if (!hasMore || isLoading || permission === "denied") return;
    setIsLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: ["photo", "video"],
        sortBy: [MediaLibrary.SortBy.creationTime],
        first: PAGE_SIZE,
        after: cursor,
      });

      const newAssets: PhotoAsset[] = result.assets.map((a) => {
        const tags = buildTags(a);
        return {
          id: a.id,
          uri: a.uri,
          filename: a.filename,
          mediaType: a.mediaType,
          width: a.width,
          height: a.height,
          creationTime: a.creationTime,
          modificationTime: a.modificationTime,
          duration: a.duration,
          tags,
          description: generatePhotoDescription(tags, a.mediaType),
          isIndexed: aiTagsRef.current.has(a.id),
        };
      });

      setPhotos((prev) => [...prev, ...newAssets]);
      setCursor(result.endCursor);
      setHasMore(result.hasNextPage);
      setIndexStatus((prev) => ({
        ...prev,
        total: result.totalCount,
        indexed: prev.indexed + newAssets.length,
      }));
    } catch (e) {
      console.warn("loadMorePhotos error", e);
    } finally {
      setIsLoading(false);
    }
  }, [hasMore, isLoading, cursor, permission]);

  // Auto-load when permission granted
  useEffect(() => {
    if (permission === "granted" || permission === "limited") {
      loadPhotos();
    }
  }, [permission]);

  // Auto-start AI analysis in background once photos load for the first time
  const hasAutoAnalyzedRef = useRef(false);
  useEffect(() => {
    if (
      photos.length > 0 &&
      !hasAutoAnalyzedRef.current &&
      !aiProgress.isAnalyzing &&
      (permission === "granted" || permission === "limited")
    ) {
      hasAutoAnalyzedRef.current = true;
      const timer = setTimeout(() => {
        analyzeAllWithAI();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [photos.length > 0]);

  // Keep indexPhotos as a lightweight pass (just filename tags) for backward compat
  const indexPhotos = useCallback(async () => {
    if (permission === "denied" || indexStatus.isIndexing) return;
    setIndexStatus((prev) => ({ ...prev, isIndexing: true }));
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: ["photo", "video"],
        sortBy: [MediaLibrary.SortBy.creationTime],
        first: 500,
      });
      setPhotos((prev) => prev.map((p) => ({ ...p, isIndexed: aiTagsRef.current.has(p.id) })));
      setIndexStatus({ total: result.totalCount, indexed: result.assets.length, isIndexing: false, lastIndexed: Date.now() });
    } catch (e) {
      console.warn("indexPhotos error", e);
      setIndexStatus((prev) => ({ ...prev, isIndexing: false }));
    }
  }, [permission, indexStatus.isIndexing]);

  const cancelAIAnalysis = useCallback(() => {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }
    setAIProgress((prev) => ({ ...prev, isAnalyzing: false }));
  }, []);

  const analyzeAllWithAI = useCallback(async () => {
    if (permission === "denied" || permission === "undetermined") {
      Alert.alert("Permission needed", "Grant photo library access first.");
      return;
    }
    if (aiProgress.isAnalyzing) return;

    const abort = new AbortController();
    aiAbortRef.current = abort;

    try {
      // Gather all assets (all pages)
      let allAssets: MediaLibrary.Asset[] = [];
      let after: string | undefined = undefined;
      let hasNextPage = true;
      while (hasNextPage) {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: ["photo", "video"],
          sortBy: [MediaLibrary.SortBy.creationTime],
          first: 200,
          after,
        });
        allAssets = [...allAssets, ...page.assets];
        after = page.endCursor;
        hasNextPage = page.hasNextPage;
        if (abort.signal.aborted) return;
      }

      const total = allAssets.length;
      let analyzed = aiTagsRef.current.size;

      setAIProgress({ total, analyzed, isAnalyzing: true, lastAnalyzed: null, error: null });

      // Load existing AI tags from storage (in case the ref is stale)
      const existingRaw = await AsyncStorage.getItem(STORAGE_KEY_AI_TAGS).catch(() => "{}");
      const existingMap: Record<string, { tags: string[]; ts: number }> = JSON.parse(existingRaw || "{}");

      // Only analyze photos that don't already have AI tags
      const toAnalyze = allAssets.filter((a) => !existingMap[a.id]);

      if (toAnalyze.length === 0) {
        setAIProgress({ total, analyzed: total, isAnalyzing: false, lastAnalyzed: Date.now(), error: null });
        return;
      }

      // Process photos one at a time (offline analysis reads EXIF per photo)
      for (let i = 0; i < toAnalyze.length; i += AI_BATCH_SIZE) {
        if (abort.signal.aborted) break;

        const batch = toAnalyze.slice(i, i + AI_BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async (asset) => {
            if (abort.signal.aborted) return;
            try {
              // All analysis is on-device — no photos are sent anywhere
              const result = await analyzePhotoOffline(asset, abort.signal);
              if (result.tags.length > 0) {
                const normalized = result.tags.map((t) => t.toLowerCase().trim());
                aiTagsRef.current.set(asset.id, normalized);
                existingMap[asset.id] = { tags: normalized, ts: Date.now() };
              }
            } catch (err) {
              if ((err as Error)?.name !== "AbortError") {
                console.warn(`Offline AI analysis failed for ${asset.filename}:`, err);
              }
            }
          })
        );

        analyzed = aiTagsRef.current.size;
        setAIProgress((prev) => ({ ...prev, analyzed, total }));

        // Persist every batch so progress survives app restarts
        await AsyncStorage.setItem(STORAGE_KEY_AI_TAGS, JSON.stringify(existingMap)).catch(() => {});

        // Small delay to avoid hammering the API
        await new Promise((r) => setTimeout(r, 300));
      }

      if (!abort.signal.aborted) {
        // Update in-memory photos with AI tags + regenerate description
        setPhotos((prev) =>
          prev.map((p) => {
            const aiTags = aiTagsRef.current.get(p.id);
            if (!aiTags) return p;
            const mergedTags = [...new Set([...aiTags, ...quickTagsFromFilename({ id: p.id, uri: p.uri, filename: p.filename, mediaType: p.mediaType } as MediaLibrary.Asset)])];
            return {
              ...p,
              tags: mergedTags,
              description: generatePhotoDescription(mergedTags, p.mediaType),
              isIndexed: true,
            };
          })
        );
        setAIProgress({ total, analyzed: aiTagsRef.current.size, isAnalyzing: false, lastAnalyzed: Date.now(), error: null });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI analysis failed";
      setAIProgress((prev) => ({ ...prev, isAnalyzing: false, error: msg }));
    } finally {
      aiAbortRef.current = null;
    }
  }, [permission, aiProgress.isAnalyzing]);

  const toggleSelect = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedIds(new Set(photos.map((p) => p.id)));
  }, [photos]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const deleteIds = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (Platform.OS === "web") {
        Alert.alert("Not supported", "Photo deletion is only available on a real device.");
        return false;
      }
      try {
        await MediaLibrary.deleteAssetsAsync(ids);
        setPhotos((prev) => prev.filter((p) => !ids.includes(p.id)));
        setRecentPhotos((prev) => prev.filter((p) => !ids.includes(p.id)));
        setSearchResults((prev) => prev.filter((p) => !ids.includes(p.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return true;
      } catch (e) {
        console.warn("deleteIds error", e);
        Alert.alert("Delete failed", "Unable to delete the selected photos. Please try again.");
        return false;
      }
    },
    []
  );

  const deleteSelected = useCallback(async (): Promise<boolean> => {
    const ids = [...selectedIds];
    const success = await deleteIds(ids);
    return success;
  }, [selectedIds, deleteIds]);

  const getPhotoById = useCallback(
    (id: string): PhotoAsset | undefined => {
      return photos.find((p) => p.id === id) || searchResults.find((p) => p.id === id);
    },
    [photos, searchResults]
  );

  const setSearchQuery = useCallback(
    (q: string) => {
      setSearchQueryState(q);
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
      if (!q.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      searchDebounce.current = setTimeout(() => {
        const results = searchPhotos(photos, q);
        let sorted = results;
        if (sortOrder === "newest") sorted = [...results].sort((a, b) => b.creationTime - a.creationTime);
        else if (sortOrder === "oldest") sorted = [...results].sort((a, b) => a.creationTime - b.creationTime);
        setSearchResults(sorted);
        setIsSearching(false);
      }, 350);
    },
    [photos, sortOrder]
  );

  useEffect(() => {
    if (searchQuery.trim()) {
      const results = searchPhotos(photos, searchQuery);
      let sorted = results;
      if (sortOrder === "newest") sorted = [...results].sort((a, b) => b.creationTime - a.creationTime);
      else if (sortOrder === "oldest") sorted = [...results].sort((a, b) => a.creationTime - b.creationTime);
      setSearchResults(sorted);
    }
  }, [sortOrder]);

  const addRecentSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== q);
      const next = [q, ...filtered].slice(0, 10);
      AsyncStorage.setItem(STORAGE_KEY_SEARCHES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(STORAGE_KEY_SEARCHES).catch(() => {});
  }, []);

  const value: PhotoLibraryContextType = {
    permission,
    requestPermission,
    photos,
    recentPhotos,
    loadPhotos,
    loadMorePhotos,
    isLoading,
    hasMore,
    indexStatus,
    indexPhotos,
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    deleteSelected,
    deleteIds,
    getPhotoById,
    searchResults,
    searchQuery,
    setSearchQuery,
    isSearching,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    sortOrder,
    setSortOrder,
    cloudEnabled,
    setCloudEnabled,
    reviewBeforeDelete,
    setReviewBeforeDelete,
    aiProgress,
    analyzeAllWithAI,
    cancelAIAnalysis,
    modelVersion,
    checkForModelUpdate: handleCheckForModelUpdate,
  };

  return (
    <PhotoLibraryContext.Provider value={value}>
      {children}
    </PhotoLibraryContext.Provider>
  );
}

export function usePhotoLibrary(): PhotoLibraryContextType {
  const ctx = useContext(PhotoLibraryContext);
  if (!ctx) throw new Error("usePhotoLibrary must be used inside PhotoLibraryProvider");
  return ctx;
}

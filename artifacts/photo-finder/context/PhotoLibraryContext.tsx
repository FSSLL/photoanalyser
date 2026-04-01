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
import { analyzePhoto } from "@/services/aiService";

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
  cancelAIAnalysis: () => void;
};

const PhotoLibraryContext = createContext<PhotoLibraryContextType | null>(null);

const PAGE_SIZE = 80;
const RECENT_SIZE = 30;
const STORAGE_KEY_SEARCHES = "photo_finder_recent_searches";
const STORAGE_KEY_SETTINGS = "photo_finder_settings";
const STORAGE_KEY_AI_TAGS = "photo_finder_ai_tags";
const AI_BATCH_SIZE = 3; // concurrent photos to analyze at once

// Phase 1: Filename-pattern tag assignment.
// Only uses real metadata (filename, mediaType) — no random/hash-based guessing.
// Swap assignMockTags() for a real Vision/Core ML embedder in Phase 2.

// Map common filename patterns to descriptive tags
const FILENAME_RULES: Array<{ pattern: RegExp; tags: string[] }> = [
  { pattern: /screenshot|screen.shot|screen_shot/i, tags: ["screenshot", "screen", "text"] },
  { pattern: /screen.rec|recording/i, tags: ["screen recording", "video", "screen"] },
  { pattern: /whatsapp|telegram|signal|imessage/i, tags: ["message", "chat", "conversation"] },
  { pattern: /scan|scanned|scanning/i, tags: ["scan", "document", "text"] },
  { pattern: /receipt|invoice|bill/i, tags: ["receipt", "document", "text"] },
  { pattern: /document|doc\b/i, tags: ["document", "text"] },
  { pattern: /\bid[\s_-]|id_card|idcard|identity|passport|license|licence/i, tags: ["id", "document", "text", "id card"] },
  { pattern: /selfie/i, tags: ["selfie", "portrait"] },
  { pattern: /front.cam|front_cam/i, tags: ["selfie", "portrait"] },
  { pattern: /burst/i, tags: ["burst", "action"] },
  { pattern: /panorama|pano/i, tags: ["panorama", "landscape"] },
  { pattern: /raw\b|\.raw|\.dng/i, tags: ["raw", "photo"] },
  { pattern: /video|vid_|mov_|movie/i, tags: ["video"] },
  { pattern: /live.photo|livp/i, tags: ["live photo", "photo"] },
  { pattern: /portrait.mode|depth/i, tags: ["portrait", "depth"] },
  { pattern: /slow.mo|slowmo|slo-mo/i, tags: ["slow motion", "video"] },
  { pattern: /timelapse|time.lapse/i, tags: ["timelapse", "video"] },
];

// Search query aliases: expand common user search terms to better-matched tags
const SEARCH_ALIASES: Record<string, string[]> = {
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
  "movie": ["video"],
  "selfie": ["selfie", "portrait"],
  "selfies": ["selfie", "portrait"],
  "portrait": ["selfie", "portrait"],
  "chat": ["message", "chat", "conversation"],
  "message": ["message", "chat", "conversation"],
  "whatsapp": ["message", "chat", "whatsapp"],
  "scan": ["scan", "document", "text"],
  "slow motion": ["slow motion", "video"],
  "slow mo": ["slow motion", "video"],
  "live photo": ["live photo", "photo"],
  "panorama": ["panorama", "landscape"],
  "pano": ["panorama", "landscape"],
};

function assignMockTags(asset: MediaLibrary.Asset): string[] {
  const tags: string[] = [];
  const filename = (asset.filename || "").toLowerCase();
  const ext = filename.split(".").pop() || "";

  // Video mediaType is reliable
  if (asset.mediaType === "video") {
    tags.push("video");
  }

  // Apply filename pattern rules
  let matched = false;
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(filename)) {
      tags.push(...rule.tags);
      matched = true;
    }
  }

  // Generic photo tag if no specific pattern matched
  if (!matched && asset.mediaType !== "video") {
    tags.push("photo");
  }

  // Extension-based hints
  if (["jpg", "jpeg", "heic", "png"].includes(ext) && !tags.includes("photo")) {
    tags.push("photo");
  }

  return [...new Set(tags)];
}

function expandQuery(words: string[]): string[] {
  const expanded = new Set<string>(words);
  // Also check multi-word combos (e.g., "id card")
  const fullQuery = words.join(" ");
  if (SEARCH_ALIASES[fullQuery]) {
    SEARCH_ALIASES[fullQuery].forEach((t) => expanded.add(t));
  }
  for (const word of words) {
    const aliases = SEARCH_ALIASES[word];
    if (aliases) aliases.forEach((t) => expanded.add(t));
  }
  return [...expanded];
}

function searchPhotos(photos: PhotoAsset[], query: string): PhotoAsset[] {
  if (!query.trim()) return [];
  const rawWords = query.toLowerCase().trim().split(/\s+/);
  const searchTerms = expandQuery(rawWords);

  const scored = photos
    .map((photo) => {
      const tags = photo.tags || [];
      const filename = (photo.filename || "").toLowerCase();
      // Split filename into words for accurate matching
      const fileWords = filename.split(/[\s_\-./]+/).filter(Boolean);
      let score = 0;

      for (const term of searchTerms) {
        // Exact tag match — highest confidence
        if (tags.includes(term)) {
          score += 15;
          continue;
        }
        // Tag starts with search term (minimum 3 chars to avoid noise)
        if (term.length >= 3 && tags.some((t) => t.startsWith(term))) {
          score += 8;
        }
        // Exact word in filename
        if (fileWords.includes(term)) {
          score += 12;
        }
        // Filename contains term as substring (only if term is 3+ chars)
        if (term.length >= 3 && filename.includes(term)) {
          score += 5;
        }
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

  // Build merged tags: AI tags (precise) + filename tags (always available)
  const buildTags = useCallback((a: MediaLibrary.Asset): string[] => {
    const aiTags = aiTagsRef.current.get(a.id);
    const filenameTags = assignMockTags(a);
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

      const assets: PhotoAsset[] = result.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        filename: a.filename,
        mediaType: a.mediaType,
        width: a.width,
        height: a.height,
        creationTime: a.creationTime,
        modificationTime: a.modificationTime,
        duration: a.duration,
        tags: buildTags(a),
        isIndexed: aiTagsRef.current.has(a.id),
      }));

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

      const newAssets: PhotoAsset[] = result.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        filename: a.filename,
        mediaType: a.mediaType,
        width: a.width,
        height: a.height,
        creationTime: a.creationTime,
        modificationTime: a.modificationTime,
        duration: a.duration,
        tags: buildTags(a),
        isIndexed: aiTagsRef.current.has(a.id),
      }));

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

      // Process in batches of AI_BATCH_SIZE
      for (let i = 0; i < toAnalyze.length; i += AI_BATCH_SIZE) {
        if (abort.signal.aborted) break;

        const batch = toAnalyze.slice(i, i + AI_BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async (asset) => {
            if (abort.signal.aborted) return;
            try {
              // Get asset info with localUri for actual image data
              const info = await MediaLibrary.getAssetInfoAsync(asset.id);
              const uri = info.localUri ?? info.uri;
              const result = await analyzePhoto(uri, abort.signal);
              if (result.tags.length > 0) {
                const normalized = result.tags.map((t) => t.toLowerCase().trim());
                aiTagsRef.current.set(asset.id, normalized);
                existingMap[asset.id] = { tags: normalized, ts: Date.now() };
              }
            } catch (err) {
              if ((err as Error)?.name !== "AbortError") {
                console.warn(`AI analysis failed for ${asset.filename}:`, err);
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
        // Update in-memory photos with AI tags
        setPhotos((prev) =>
          prev.map((p) => {
            const aiTags = aiTagsRef.current.get(p.id);
            if (!aiTags) return p;
            return {
              ...p,
              tags: [...new Set([...aiTags, ...assignMockTags({ id: p.id, uri: p.uri, filename: p.filename, mediaType: p.mediaType } as MediaLibrary.Asset)])],
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

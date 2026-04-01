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
import { Alert, Platform } from "react-native";

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
};

const PhotoLibraryContext = createContext<PhotoLibraryContextType | null>(null);

const PAGE_SIZE = 80;
const RECENT_SIZE = 30;
const STORAGE_KEY_SEARCHES = "photo_finder_recent_searches";
const STORAGE_KEY_SETTINGS = "photo_finder_settings";

// Mock tags for semantic search (Phase 1) — swap for real embedding model in Phase 2
const MOCK_TAG_CATEGORIES: Record<string, string[]> = {
  nature: ["nature", "outdoor", "landscape", "sky", "tree", "forest", "mountain", "beach", "sunset", "sunrise", "ocean", "river", "lake", "grass", "flowers", "garden", "park"],
  people: ["person", "people", "selfie", "portrait", "face", "smile", "group", "family", "friends", "baby", "child", "man", "woman"],
  food: ["food", "meal", "coffee", "drink", "restaurant", "cooking", "kitchen", "breakfast", "lunch", "dinner", "dessert", "cake", "pizza"],
  animals: ["cat", "dog", "pet", "animal", "bird", "fish", "wildlife", "puppy", "kitten"],
  transportation: ["car", "vehicle", "road", "street", "travel", "airport", "plane", "train", "bus", "bike", "motorcycle"],
  architecture: ["building", "city", "urban", "architecture", "house", "room", "interior", "window", "door"],
  technology: ["phone", "computer", "screen", "technology", "device", "gadget"],
  text: ["document", "text", "sign", "screenshot", "receipt", "book", "paper", "note", "whiteboard"],
  events: ["party", "event", "celebration", "wedding", "birthday", "concert", "sport", "festival"],
  art: ["art", "painting", "drawing", "design", "creative", "abstract", "colorful"],
};

function assignMockTags(asset: MediaLibrary.Asset): string[] {
  const tags: string[] = [];
  const filename = (asset.filename || "").toLowerCase();

  if (filename.includes("img_") || filename.includes("photo")) tags.push("photo");
  if (filename.includes("screenshot")) {
    tags.push("screenshot", "text", "screen");
  }
  if (filename.includes("selfie") || filename.includes("front")) {
    tags.push("selfie", "portrait", "people");
  }
  if (filename.includes("video") || asset.mediaType === "video") {
    tags.push("video");
  }

  // Add some random-ish category tags based on the asset id for demo variety
  const hash = asset.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const categoryKeys = Object.keys(MOCK_TAG_CATEGORIES);
  const primaryCat = categoryKeys[hash % categoryKeys.length];
  const secondaryCat = categoryKeys[(hash * 3 + 7) % categoryKeys.length];
  tags.push(...(MOCK_TAG_CATEGORIES[primaryCat] || []).slice(0, 3));
  tags.push(...(MOCK_TAG_CATEGORIES[secondaryCat] || []).slice(0, 2));

  return [...new Set(tags)];
}

function searchPhotos(photos: PhotoAsset[], query: string): PhotoAsset[] {
  if (!query.trim()) return [];
  const words = query.toLowerCase().trim().split(/\s+/);

  const scored = photos
    .map((photo) => {
      const tags = photo.tags || [];
      const filename = (photo.filename || "").toLowerCase();
      let score = 0;
      for (const word of words) {
        if (tags.some((t) => t.includes(word))) score += 10;
        if (filename.includes(word)) score += 5;
        if (tags.some((t) => word.includes(t))) score += 3;
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

  const indexedPhotosRef = useRef<Map<string, string[]>>(new Map());
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings from AsyncStorage
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
    const { status, accessPrivileges } = await MediaLibrary.requestPermissionsAsync();
    if (status === "granted") {
      setPermission(accessPrivileges === "limited" ? "limited" : "granted");
    } else {
      setPermission(status as PermissionStatus);
    }
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
        tags: indexedPhotosRef.current.get(a.id) || assignMockTags(a),
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
        tags: indexedPhotosRef.current.get(a.id) || assignMockTags(a),
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

  const indexPhotos = useCallback(async () => {
    if (permission === "denied" || indexStatus.isIndexing) return;
    setIndexStatus((prev) => ({ ...prev, isIndexing: true }));

    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: ["photo", "video"],
        sortBy: [MediaLibrary.SortBy.creationTime],
        first: 500,
      });

      const total = result.totalCount;
      let indexed = 0;

      for (const asset of result.assets) {
        const tags = assignMockTags(asset);
        indexedPhotosRef.current.set(asset.id, tags);
        indexed++;
        if (indexed % 50 === 0) {
          setIndexStatus((prev) => ({ ...prev, total, indexed }));
          await new Promise((r) => setTimeout(r, 10));
        }
      }

      setPhotos((prev) =>
        prev.map((p) => ({
          ...p,
          tags: indexedPhotosRef.current.get(p.id) || p.tags || [],
          isIndexed: true,
        }))
      );

      setIndexStatus({
        total,
        indexed,
        isIndexing: false,
        lastIndexed: Date.now(),
      });
    } catch (e) {
      console.warn("indexPhotos error", e);
      setIndexStatus((prev) => ({ ...prev, isIndexing: false }));
    }
  }, [permission, indexStatus.isIndexing]);

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

import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DeleteConfirmSheet from "@/components/DeleteConfirmSheet";
import PhotoGrid from "@/components/PhotoGrid";
import { PhotoAsset, usePhotoLibrary } from "@/context/PhotoLibraryContext";
import { useColors } from "@/hooks/useColors";

const SUGGESTIONS = [
  "screenshots",
  "selfies",
  "videos",
  "documents",
  "ID",
  "receipts",
  "scans",
  "WhatsApp",
  "panoramas",
  "slow motion",
  "live photos",
];

const SORT_OPTIONS: { key: "match" | "newest" | "oldest"; label: string }[] = [
  { key: "match", label: "Best Match" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
];

export default function SearchScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    sortOrder,
    setSortOrder,
    permission,
    requestPermission,
    deleteIds,
    reviewBeforeDelete,
  } = usePhotoLibrary();

  // Local selection state — independent from the library tab's selection
  const [isSelectMode, setSelectMode] = useState(false);
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const tabBarHeight =
    Platform.OS === "web" ? 84 : Platform.OS === "android" ? 56 + insets.bottom : 49 + insets.bottom;

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    // Exit select mode when query changes
    if (isSelectMode) exitSelectMode();
  };

  const handleSubmit = () => {
    if (searchQuery.trim()) addRecentSearch(searchQuery.trim());
  };

  const handleSuggestionTap = (q: string) => {
    setSearchQuery(q);
    addRecentSearch(q);
  };

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setLocalSelected(new Set());
  }, []);

  const toggleItem = useCallback((id: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePhotoPress = useCallback(
    (photo: PhotoAsset) => {
      if (isSelectMode) {
        toggleItem(photo.id);
      } else {
        router.push({ pathname: "/photo/[id]", params: { id: photo.id, from: "search" } });
      }
    },
    [isSelectMode, toggleItem, router]
  );

  const handleLongPress = useCallback(
    (photo: PhotoAsset) => {
      if (!isSelectMode) {
        setSelectMode(true);
        setLocalSelected(new Set([photo.id]));
      }
    },
    [isSelectMode]
  );

  const selectAll = useCallback(() => {
    setLocalSelected(new Set(searchResults.map((p) => p.id)));
  }, [searchResults]);

  const handleDeletePress = () => {
    if (localSelected.size === 0) return;
    if (reviewBeforeDelete) {
      setShowDeleteConfirm(true);
    } else {
      confirmDelete();
    }
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    const ids = [...localSelected];
    const success = await deleteIds(ids);
    setIsDeleting(false);
    if (success) exitSelectMode();
  };

  const selectedPhotos = searchResults.filter((p) => localSelected.has(p.id));
  const hasResults = searchQuery.trim().length > 0;
  const allSelected = searchResults.length > 0 && localSelected.size === searchResults.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Search</Text>

          {hasResults && (
            isSelectMode ? (
              <View style={styles.headerActions}>
                <Pressable onPress={allSelected ? exitSelectMode : selectAll} style={styles.headerBtn}>
                  <Text style={[styles.headerBtnText, { color: colors.primary }]}>
                    {allSelected ? "None" : "All"}
                  </Text>
                </Pressable>
                <Pressable onPress={exitSelectMode} style={styles.headerBtn}>
                  <Text style={[styles.headerBtnText, { color: colors.primary }]}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setSelectMode(true)} style={styles.headerBtn}>
                <Feather name="check-square" size={22} color={colors.primary} />
              </Pressable>
            )
          )}
        </View>

        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            placeholder='Try "sunset" or "coffee"...'
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={handleSearch}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== "ios" && (
            <Pressable onPress={() => setSearchQuery("")} style={styles.clearBtn}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {hasResults ? (
        <>
          {/* Sort + result count */}
          <View style={styles.resultMeta}>
            <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
              {isSearching
                ? "Searching..."
                : isSelectMode
                ? `${localSelected.size} selected`
                : `${searchResults.length} results`}
            </Text>
            {!isSelectMode && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
                {SORT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setSortOrder(opt.key)}
                    style={[
                      styles.sortChip,
                      {
                        backgroundColor: sortOrder === opt.key ? colors.primary : colors.muted,
                        borderColor: sortOrder === opt.key ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sortChipText,
                        { color: sortOrder === opt.key ? colors.primaryForeground : colors.mutedForeground },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          {isSearching ? (
            <View style={styles.searchingState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.searchingText, { color: colors.mutedForeground }]}>Searching photos...</Text>
            </View>
          ) : (
            <PhotoGrid
              photos={searchResults}
              selectedIds={localSelected}
              isSelectMode={isSelectMode}
              onPress={handlePhotoPress}
              onLongPress={handleLongPress}
              extraBottomPad={isSelectMode ? 80 : 0}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="search" size={40} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No results</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                    Try a different search like "sunset" or "food"
                  </Text>
                </View>
              }
            />
          )}

          {/* Floating delete bar */}
          {isSelectMode && localSelected.size > 0 && (
            <View
              style={[
                styles.deleteBar,
                {
                  backgroundColor: colors.background,
                  borderTopColor: colors.border,
                  bottom: tabBarHeight,
                },
              ]}
            >
              <Pressable
                onPress={handleDeletePress}
                disabled={isDeleting}
                style={[styles.deleteBtn, { backgroundColor: "#EF4444" }]}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="trash-2" size={18} color="#fff" />
                    <Text style={styles.deleteBtnText}>
                      Delete {localSelected.size} photo{localSelected.size !== 1 ? "s" : ""}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent</Text>
                <Pressable onPress={clearRecentSearches}>
                  <Text style={[styles.sectionAction, { color: colors.primary }]}>Clear</Text>
                </Pressable>
              </View>
              {recentSearches.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => handleSuggestionTap(s)}
                  style={[styles.recentItem, { borderBottomColor: colors.border }]}
                >
                  <Feather name="clock" size={15} color={colors.mutedForeground} />
                  <Text style={[styles.recentText, { color: colors.foreground }]}>{s}</Text>
                  <Feather name="arrow-up-left" size={15} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Suggestions */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Try searching for</Text>
            <View style={styles.suggestionsWrap}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => handleSuggestionTap(s)}
                  style={[styles.suggestionChip, { backgroundColor: colors.accent, borderColor: colors.border }]}
                >
                  <Feather name="search" size={12} color={colors.primary} />
                  <Text style={[styles.suggestionText, { color: colors.accentForeground }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Phase note */}
          <View style={[styles.phaseNote, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="cpu" size={14} color={colors.mutedForeground} />
            <Text style={[styles.phaseText, { color: colors.mutedForeground }]}>
              Phase 1: Tag-based search. Semantic AI search coming in Phase 2.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Delete confirmation sheet */}
      <DeleteConfirmSheet
        visible={showDeleteConfirm}
        photos={selectedPhotos}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  headerBtnText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  clearBtn: { padding: 4 },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 12,
  },
  resultCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sortRow: { gap: 8, paddingRight: 16 },
  sortChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  sortChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  searchingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 60,
  },
  searchingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 100,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionAction: { fontSize: 14, fontFamily: "Inter_500Medium" },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  suggestionsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  suggestionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  phaseNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  phaseText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  deleteBar: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  deleteBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});

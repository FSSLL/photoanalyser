import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  } = usePhotoLibrary();

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  // Only update the live query — do NOT save to recents on every keystroke
  const handleSearch = (q: string) => {
    setSearchQuery(q);
  };

  // Save to recents only when the user explicitly submits (presses Return/Search)
  const handleSubmit = () => {
    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim());
    }
  };

  // Tap a suggestion or a recent item → set query AND save to recents
  const handleSuggestionTap = (q: string) => {
    setSearchQuery(q);
    addRecentSearch(q);
  };

  const handlePhotoPress = (photo: PhotoAsset) => {
    router.push({ pathname: "/photo/[id]", params: { id: photo.id, from: "search" } });
  };

  const hasResults = searchQuery.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Search</Text>
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
              {isSearching ? "Searching..." : `${searchResults.length} results`}
            </Text>
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
          </View>

          {isSearching ? (
            <View style={styles.searchingState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.searchingText, { color: colors.mutedForeground }]}>Searching photos...</Text>
            </View>
          ) : (
            <PhotoGrid
              photos={searchResults}
              selectedIds={new Set()}
              onPress={handlePhotoPress}
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
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
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
});

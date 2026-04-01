import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DeleteConfirmSheet from "@/components/DeleteConfirmSheet";
import PermissionGate from "@/components/PermissionGate";
import PhotoGrid from "@/components/PhotoGrid";
import { PhotoAsset, usePhotoLibrary } from "@/context/PhotoLibraryContext";
import { useColors } from "@/hooks/useColors";

const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "video", label: "Videos" },
  { key: "screenshot", label: "Screenshots" },
  { key: "selfie", label: "Selfies" },
];

type Filter = "all" | "video" | "screenshot" | "selfie";

export default function LibraryScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    permission,
    requestPermission,
    photos,
    recentPhotos,
    isLoading,
    hasMore,
    loadMorePhotos,
    selectedIds,
    toggleSelect,
    clearSelection,
    deleteSelected,
    getPhotoById,
    reviewBeforeDelete,
  } = usePhotoLibrary();

  const [filter, setFilter] = useState<Filter>("all");
  const [isSelectMode, setSelectMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (permission === "undetermined" || permission === "denied") {
    return <PermissionGate onRequest={requestPermission} />;
  }
  if (permission === "limited") {
    // Show limited but still allow searching the permitted assets
  }

  const filteredPhotos = photos.filter((p) => {
    if (filter === "all") return true;
    if (filter === "video") return p.mediaType === "video";
    if (filter === "screenshot") return (p.tags || []).includes("screenshot");
    if (filter === "selfie") return (p.tags || []).includes("selfie");
    return true;
  });

  const selectedPhotos = [...selectedIds]
    .map((id) => getPhotoById(id))
    .filter(Boolean) as PhotoAsset[];

  const handlePress = (photo: PhotoAsset) => {
    if (isSelectMode) {
      toggleSelect(photo.id);
    } else {
      router.push({ pathname: "/photo/[id]", params: { id: photo.id, from: "library" } });
    }
  };

  const handleLongPress = (photo: PhotoAsset) => {
    if (!isSelectMode) {
      setSelectMode(true);
      toggleSelect(photo.id);
    }
  };

  const handleDeletePress = () => {
    if (selectedIds.size === 0) return;
    if (reviewBeforeDelete) {
      setShowDeleteConfirm(true);
    } else {
      confirmDelete();
    }
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    const success = await deleteSelected();
    setIsDeleting(false);
    if (success) {
      setSelectMode(false);
      clearSelection();
    }
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  // Tab bar is position:absolute so we must lift action bars above it
  const tabBarHeight = Platform.OS === "web" ? 84 : Platform.OS === "android" ? 56 + insets.bottom : 49 + insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Library</Text>
        {permission === "limited" && (
          <View style={[styles.limitedBadge, { backgroundColor: colors.warning + "22" }]}>
            <Text style={[styles.limitedText, { color: colors.warning }]}>Limited</Text>
          </View>
        )}
        {isSelectMode ? (
          <View style={styles.headerActions}>
            <Pressable onPress={() => { setSelectMode(false); clearSelection(); }} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: colors.primary }]}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setSelectMode(true)} style={styles.headerBtn}>
            <Feather name="check-square" size={22} color={colors.primary} />
          </Pressable>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setFilter(opt.key as Filter)}
            style={[
              styles.chip,
              {
                backgroundColor: filter === opt.key ? colors.primary : colors.muted,
                borderColor: filter === opt.key ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: filter === opt.key ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <PhotoGrid
        photos={filteredPhotos}
        selectedIds={selectedIds}
        onPress={handlePress}
        onLongPress={handleLongPress}
        isSelectMode={isSelectMode}
        onEndReached={hasMore ? loadMorePhotos : undefined}
        extraBottomPad={isSelectMode ? 82 : 0}
        ListFooterComponent={
          isLoading ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Feather name="image" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {filter === "all" ? "No photos found" : `No ${filter}s found`}
              </Text>
            </View>
          ) : undefined
        }
      />

      {/* Select mode bottom bar */}
      {isSelectMode && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[
            styles.selectBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              bottom: tabBarHeight,
              paddingBottom: 10,
            },
          ]}
        >
          <Text style={[styles.selectCount, { color: colors.mutedForeground }]}>
            {selectedIds.size} selected
          </Text>
          <Pressable
            onPress={handleDeletePress}
            disabled={selectedIds.size === 0 || isDeleting}
            style={[
              styles.deleteBtn,
              {
                backgroundColor: selectedIds.size > 0 ? colors.destructive : colors.muted,
                opacity: isDeleting ? 0.7 : 1,
              },
            ]}
          >
            {isDeleting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="trash-2" size={16} color={selectedIds.size > 0 ? colors.destructiveForeground : colors.mutedForeground} />
                <Text style={[styles.deleteBtnText, { color: selectedIds.size > 0 ? colors.destructiveForeground : colors.mutedForeground }]}>
                  Delete
                </Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      )}

      <DeleteConfirmSheet
        visible={showDeleteConfirm}
        photos={selectedPhotos}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        isDeleting={isDeleting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  limitedBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 8,
  },
  limitedText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loadingFooter: { padding: 20, alignItems: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, marginTop: 100 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  selectBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  selectCount: { fontSize: 15, fontFamily: "Inter_500Medium" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

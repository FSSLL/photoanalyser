import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DeleteConfirmSheet from "@/components/DeleteConfirmSheet";
import { PhotoAsset, usePhotoLibrary } from "@/context/PhotoLibraryContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const THUMB = (SCREEN_WIDTH - 16 * 2 - 10 * 2) / 3;

export default function ReviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    selectedIds,
    toggleSelect,
    clearSelection,
    deleteSelected,
    deleteIds,
    getPhotoById,
    photos,
    reviewBeforeDelete,
  } = usePhotoLibrary();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedPhotos = [...selectedIds]
    .map((id) => getPhotoById(id))
    .filter(Boolean) as PhotoAsset[];

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

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
    await deleteSelected();
    setIsDeleting(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Review</Text>
        {selectedIds.size > 0 && (
          <Pressable onPress={clearSelection} style={styles.clearBtn}>
            <Text style={[styles.clearBtnText, { color: colors.primary }]}>Clear All</Text>
          </Pressable>
        )}
      </View>

      {selectedIds.size === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
            <Feather name="check-square" size={36} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing selected</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            Long-press photos in the Library or Search tabs to select them for review and deletion.
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/library")}
            style={[styles.goBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="image" size={16} color={colors.primaryForeground} />
            <Text style={[styles.goBtnText, { color: colors.primaryForeground }]}>Go to Library</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={[styles.countText, { color: colors.mutedForeground }]}>
            {selectedIds.size} photo{selectedIds.size !== 1 ? "s" : ""} selected for deletion
          </Text>

          <FlatList
            data={selectedPhotos}
            numColumns={3}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.grid, { paddingBottom: bottomPad + 120 }]}
            columnWrapperStyle={styles.row}
            renderItem={({ item }) => (
              <Animated.View entering={FadeIn.duration(200)} style={styles.cellWrap}>
                <Pressable
                  onPress={() => router.push({ pathname: "/photo/[id]", params: { id: item.id, from: "review" } })}
                  style={styles.cell}
                >
                  <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
                  <Pressable
                    onPress={() => toggleSelect(item.id)}
                    style={[styles.removeBtn, { backgroundColor: colors.destructive }]}
                  >
                    <Feather name="x" size={12} color="#fff" />
                  </Pressable>
                </Pressable>
              </Animated.View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="check-square" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                  No photos selected
                </Text>
              </View>
            }
          />

          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                paddingBottom: bottomPad + 10,
              },
            ]}
          >
            <Pressable
              onPress={clearSelection}
              style={[styles.clearBarBtn, { backgroundColor: colors.muted }]}
            >
              <Text style={[styles.clearBarText, { color: colors.foreground }]}>Clear</Text>
            </Pressable>
            <Pressable
              onPress={handleDeletePress}
              disabled={isDeleting}
              style={[styles.deleteBtn, { backgroundColor: colors.destructive, opacity: isDeleting ? 0.7 : 1 }]}
            >
              {isDeleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="trash-2" size={18} color={colors.destructiveForeground} />
                  <Text style={[styles.deleteBtnText, { color: colors.destructiveForeground }]}>
                    Delete {selectedIds.size} Photo{selectedIds.size !== 1 ? "s" : ""}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </>
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
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  clearBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  countText: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 16, marginBottom: 12 },
  grid: { paddingHorizontal: 16 },
  row: { gap: 10, marginBottom: 10 },
  cellWrap: { position: "relative" },
  cell: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: "hidden",
  },
  thumb: { width: "100%", height: "100%" },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
    marginTop: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  goBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  goBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  clearBarBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  clearBarText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

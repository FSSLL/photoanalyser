import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DeleteConfirmSheet from "@/components/DeleteConfirmSheet";
import { usePhotoLibrary } from "@/context/PhotoLibraryContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function PhotoDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { getPhotoById, deleteIds, toggleSelect, selectedIds, reviewBeforeDelete } = usePhotoLibrary();

  const photo = getPhotoById(id);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isSelected = selectedIds.has(id);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  if (!photo) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Photo not found</Text>
        </View>
      </View>
    );
  }

  const handleDelete = () => {
    if (reviewBeforeDelete) {
      setShowDeleteConfirm(true);
    } else {
      confirmDelete();
    }
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    const success = await deleteIds([photo.id]);
    setIsDeleting(false);
    if (success) router.back();
  };

  const handleAddToReview = () => {
    toggleSelect(photo.id);
    router.push("/(tabs)/review");
  };

  const createdDate = new Date(photo.creationTime).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const imageAspect = photo.width && photo.height ? photo.width / photo.height : 1;
  const imageHeight = Math.min(SCREEN_WIDTH / imageAspect, 500);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {from === "search" ? "Search Result" : from === "review" ? "Review" : "Photo"}
        </Text>
        <Pressable
          onPress={handleAddToReview}
          style={[styles.reviewBtn, { backgroundColor: isSelected ? colors.accent : colors.muted }]}
        >
          <Feather name={isSelected ? "check-square" : "square"} size={18} color={isSelected ? colors.primary : colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
      >
        {/* Photo */}
        <Image
          source={{ uri: photo.uri }}
          style={[styles.photo, { height: imageHeight }]}
          contentFit="contain"
          transition={200}
        />

        {/* Tags */}
        {(photo.tags || []).length > 0 && (
          <View style={styles.tagsSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tags</Text>
            <View style={styles.tagsWrap}>
              {(photo.tags || []).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.tagText, { color: colors.accentForeground }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Metadata */}
        <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Details</Text>
          {[
            ["Filename", photo.filename],
            ["Taken", createdDate],
            ["Dimensions", photo.width && photo.height ? `${photo.width} × ${photo.height}` : "Unknown"],
            ["Type", photo.mediaType === "video" ? "Video" : "Photo"],
            ...(photo.duration ? [["Duration", `${Math.round(photo.duration)}s`]] : []),
          ].map(([label, value]) => (
            <View key={label} style={[styles.metaRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <Text style={[styles.metaValue, { color: colors.foreground }]}>{value}</Text>
            </View>
          ))}
        </View>

        {from === "search" && (
          <View style={[styles.searchNote, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="cpu" size={14} color={colors.mutedForeground} />
            <Text style={[styles.searchNoteText, { color: colors.mutedForeground }]}>
              Matched by local tag analysis. Semantic AI matching coming in Phase 2.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom bar */}
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
          onPress={handleAddToReview}
          style={[styles.actionBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name={isSelected ? "minus-square" : "plus-square"} size={20} color={isSelected ? colors.primary : colors.foreground} />
          <Text style={[styles.actionBtnText, { color: isSelected ? colors.primary : colors.foreground }]}>
            {isSelected ? "Remove" : "Select"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleDelete}
          disabled={isDeleting}
          style={[styles.deleteBtn, { backgroundColor: colors.destructive, opacity: isDeleting ? 0.7 : 1 }]}
        >
          {isDeleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="trash-2" size={20} color={colors.destructiveForeground} />
              <Text style={[styles.deleteBtnText, { color: colors.destructiveForeground }]}>Delete</Text>
            </>
          )}
        </Pressable>
      </View>

      <DeleteConfirmSheet
        visible={showDeleteConfirm}
        photos={[photo]}
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold" },
  reviewBtn: { padding: 8, borderRadius: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16, fontFamily: "Inter_400Regular" },
  photo: {
    width: SCREEN_WIDTH,
    backgroundColor: "#000",
  },
  tagsSection: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  tag: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  metaCard: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  metaLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  metaValue: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1, textAlign: "right" },
  searchNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  searchNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
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
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
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

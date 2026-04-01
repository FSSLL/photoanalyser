import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { PhotoAsset } from "@/context/PhotoLibraryContext";

type Props = {
  visible: boolean;
  photos: PhotoAsset[];
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const THUMB = 60;

export default function DeleteConfirmSheet({ visible, photos, onConfirm, onCancel, isDeleting }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={[styles.iconRow, { backgroundColor: colors.destructive + "18" }]}>
            <Feather name="trash-2" size={28} color={colors.destructive} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>
            Delete {photos.length} {photos.length === 1 ? "Photo" : "Photos"}?
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            This will permanently delete {photos.length === 1 ? "this photo" : "these photos"} from your library. This action cannot be undone.
          </Text>

          {photos.length > 0 && photos.length <= 20 && (
            <FlatList
              data={photos.slice(0, 20)}
              horizontal
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRow}
              renderItem={({ item }) => (
                <Image
                  source={{ uri: item.uri }}
                  style={[styles.thumb, { borderColor: colors.border }]}
                  contentFit="cover"
                />
              )}
            />
          )}

          <Pressable
            onPress={onConfirm}
            disabled={isDeleting}
            style={[
              styles.deleteBtn,
              { backgroundColor: colors.destructive, opacity: isDeleting ? 0.7 : 1 },
            ]}
          >
            <Feather name="trash-2" size={18} color={colors.destructiveForeground} />
            <Text style={[styles.deleteBtnText, { color: colors.destructiveForeground }]}>
              {isDeleting ? "Deleting..." : `Delete ${photos.length === 1 ? "Photo" : `${photos.length} Photos`}`}
            </Text>
          </Pressable>

          <Pressable onPress={onCancel} style={[styles.cancelBtn, { backgroundColor: colors.muted }]}>
            <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  iconRow: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  thumbRow: {
    paddingHorizontal: 4,
    gap: 6,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    width: "100%",
  },
  deleteBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  cancelBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
});

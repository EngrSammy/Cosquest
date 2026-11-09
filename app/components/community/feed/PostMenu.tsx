import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { C } from "@/theme/tokens";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

type PostMenuProps = {
  visible: boolean;
  isMine: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Someone else's post (task 059): block its author. */
  onBlock?: () => void;
  authorName?: string;
  // Other people's posts: report it.
  onReport?: () => void;
};

/*
 * iOS drops a new Modal / Alert if it is opened while this
 * modal is still animating out. A short delay avoids that.
 */
const MODAL_CLOSE_DELAY = 300;

export function PostMenu({
  visible,
  isMine,
  onClose,
  onEdit,
  onDelete,
  onReport,
  onBlock,
  authorName,
}: PostMenuProps) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const later = (fn?: () => void) => () => {
    onClose();
    if (fn) setTimeout(fn, MODAL_CLOSE_DELAY);
  };
  const handleEdit = () => {
    onClose();
    setTimeout(onEdit, MODAL_CLOSE_DELAY);
  };

  const handleReport = () => {
    onClose();
    if (onReport) setTimeout(onReport, MODAL_CLOSE_DELAY);
  };

  const handleDelete = () => {
    onClose();
    setTimeout(onDelete, MODAL_CLOSE_DELAY);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={styles.overlay} onPress={onClose}>
        {/* Inner Pressable stops taps on the menu from closing it */}
        <Pressable accessibilityRole="button" accessibilityLabel="Edit post" style={styles.menu} onPress={() => {}}>
          {isMine ? (
            <>
              {/* EDIT */}
              <Pressable accessibilityRole="button" accessibilityLabel="Edit post" style={styles.item} onPress={handleEdit}>
                <Ionicons name="create-outline" size={21} color={ink.text("#191922")} />

                <Text style={styles.itemText}>Edit post</Text>
              </Pressable>

              {/* DELETE */}
              <Pressable accessibilityRole="button" accessibilityLabel="Delete post" style={styles.item} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={21} color={ink.text("#D9364F")} />

                <Text style={[styles.itemText, styles.deleteText]}>
                  Delete post
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {onBlock ? (
                <Pressable style={styles.item} onPress={later(onBlock)} accessibilityRole="button" accessibilityLabel={`Block ${authorName || "this person"}`}>
                  <Ionicons name="ban-outline" size={21} color={ink.text("#D9364F")} />
                  <Text style={[styles.itemText, styles.deleteText]}>Block {authorName || "this person"}</Text>
                </Pressable>
              ) : null}
            </>
          )}

          {/* REPORT (someone else's post) */}
          {!isMine && onReport ? (
            <Pressable style={styles.item} onPress={handleReport} accessibilityRole="button" accessibilityLabel="Report post">
              <Ionicons name="flag-outline" size={21} color={ink.text("#D9364F")} />

              <Text style={[styles.itemText, styles.deleteText]}>Report post</Text>
            </Pressable>
          ) : null}

          {/* CANCEL */}
          <Pressable
            style={[styles.cancel, !isMine && !onReport && !onBlock && styles.cancelOnly]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  menu: {
    width: "82%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    paddingVertical: 8,
  },

  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  itemText: {
    marginLeft: 14,
    fontSize: 16,
    fontWeight: "600",
    color: C.ink,
  },

  deleteText: {
    color: "#D9364F",
  },

  cancel: {
    borderTopWidth: 1,
    borderTopColor: "#EEEEF2",
    marginTop: 4,
    paddingVertical: 16,
    alignItems: "center",
  },

  cancelOnly: {
    borderTopWidth: 0,
    marginTop: 0,
  },

  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: C.grey5,
  },
});

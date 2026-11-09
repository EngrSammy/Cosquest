import React from "react";
import {
  Modal,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type MessageActionsSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  backdropStyle: StyleProp<ViewStyle>;
  onBackdropPress: () => void;
  children: React.ReactNode;
};

export default function MessageActionsSheet({
  visible,
  onRequestClose,
  backdropStyle,
  onBackdropPress,
  children,
}: MessageActionsSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <Pressable style={backdropStyle} onPress={onBackdropPress}>
        {children}
      </Pressable>
    </Modal>
  );
}

import { createElement as h, useRef, useState } from 'react';
import { Modal, Pressable, View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { pickAttachment } from './attachmentPicker.js';

const OPTIONS = [
  ['photo', 'Photo', '▧'], ['video', 'Video', '▷'], ['document', 'Document', '▤'],
  ['camera', 'Camera', '◎'], ['audio', 'Audio', '♫'], ['sticker', 'Sticker', '☺'],
];

// onSelected receives a local asset. Show a preview and a separate Send button.
export function AttachMenu({ visible, onClose, onSelected }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function choose(option) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const asset = await pickAttachment(option);
      if (asset) { onSelected(asset); onClose(); }
    } catch (error) { Alert.alert('Attachment unavailable', error.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return h(Modal, { visible, transparent: true, animationType: 'slide', onRequestClose: () => { if (!busy) onClose(); } },
    h(View, { style: styles.overlay },
      h(Pressable, { style: styles.backdrop, accessibilityLabel: 'Close attachments', disabled: busy, onPress: onClose }),
      h(View, { style: styles.sheet },
        h(Text, { style: styles.title }, 'Attach'),
        busy ? h(ActivityIndicator, { color: '#bd4399' }) : null,
        h(View, { style: styles.grid }, ...OPTIONS.map(([key, label, icon]) =>
          h(Pressable, { key, style: styles.option, disabled: busy, accessibilityRole: 'button', accessibilityLabel: label, onPress: () => choose(key) },
            h(Text, { style: styles.icon }, icon), h(Text, { style: styles.label }, label)
          )
        ))
      )
    )
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdrop: { flex: 1 },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  title: { fontSize: 23, fontWeight: '700', marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  option: { width: '25%', alignItems: 'center', marginBottom: 22 },
  icon: { color: '#bd4399', backgroundColor: '#faedf5', borderRadius: 20, overflow: 'hidden', textAlign: 'center', fontSize: 30, width: 60, height: 60, lineHeight: 60 },
  label: { marginTop: 8, color: '#56515a', fontSize: 13 },
});

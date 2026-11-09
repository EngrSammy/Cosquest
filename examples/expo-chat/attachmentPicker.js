import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const DOCUMENT_TYPES = [
  'application/pdf', 'text/plain', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', doc: DOCUMENT_TYPES[3], docx: DOCUMENT_TYPES[4],
  xls: DOCUMENT_TYPES[5], xlsx: DOCUMENT_TYPES[6], ppt: DOCUMENT_TYPES[7], pptx: DOCUMENT_TYPES[8],
};

function normalize(asset) {
  const name = asset.fileName || asset.name || asset.uri.split('/').pop();
  const extension = name?.split('.').pop()?.toLowerCase();
  return { uri: asset.uri, name, mimeType: asset.mimeType || MIME_BY_EXTENSION[extension] || null };
}

// Returns an asset for preview/confirmation. Picking never sends it automatically.
export async function pickAttachment(option) {
  if (['document', 'audio', 'sticker'].includes(option)) {
    const type = option === 'audio' ? ['audio/*'] : option === 'sticker' ? ['image/png', 'image/webp', 'image/gif'] : DOCUMENT_TYPES;
    const picked = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true, multiple: false });
    if (picked.canceled) return null;
    const asset = normalize(picked.assets[0]);
    // .webm selected from the Audio picker is audio even when the provider omits its MIME.
    if (option === 'audio' && asset.mimeType === 'video/webm') asset.mimeType = 'audio/webm';
    return { ...asset, kind: option === 'document' ? 'file' : option };
  }
  if (!['photo', 'video', 'camera'].includes(option)) throw new Error('Unknown attachment option.');
  let picked;
  if (option === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera permission is required. Enable it in device Settings if access was denied.');
    picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  } else {
    picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: option === 'video' ? ['videos'] : ['images'], quality: 1, allowsEditing: false });
  }
  if (picked.canceled) return null;
  let asset = normalize(picked.assets[0]);
  const kind = option === 'video' ? 'video' : 'image';
  if (kind === 'image' && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(asset.mimeType)) {
    // Normalize HEIC/HEIF and unknown photo formats from iOS to a supported JPEG.
    const context = ImageManipulator.manipulate(asset.uri);
    const rendered = await context.renderAsync();
    try {
      const converted = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
      asset = { uri: converted.uri, name: `photo-${Date.now()}.jpg`, mimeType: 'image/jpeg' };
    } finally {
      rendered.release();
      context.release();
    }
  }
  return { ...asset, kind };
}

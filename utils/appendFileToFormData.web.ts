// WEB - add a picked/recorded file to an upload form.
// In a browser, a recording or picked photo is a "blob:" address in the
// page's memory, so we read it as a Blob and attach it with a file name.
// The file name's ending is matched to the real type (browsers usually
// record voice notes as .webm, not .m4a like phones).
const EXTENSIONS: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

export async function appendFileToFormData(
  formData: FormData,
  field: string,
  file: { uri: string; name?: string; type?: string },
) {
  const response = await fetch(file.uri);
  const blob = await response.blob();

  const type = (blob.type || file.type || "application/octet-stream").split(";")[0];
  const baseName = (file.name || "upload").replace(/\.[^.]+$/, "");
  const originalExtension = file.name?.match(/\.[^.]+$/)?.[0] || "";
  const extension = EXTENSIONS[type] || originalExtension;

  formData.append(field, blob, `${baseName}${extension}`);
}

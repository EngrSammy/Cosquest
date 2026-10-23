// PHONES - add a picked/recorded file to an upload form.
// (The web version, appendFileToFormData.web.ts, does the same in a
// browser, where expo-file-system doesn't exist.)
import { File } from "expo-file-system";

export async function appendFileToFormData(
  formData: FormData,
  field: string,
  file: { uri: string; name?: string; type?: string },
) {
  formData.append(field, new File(file.uri) as any);
}

// ==========================================
// SPARKS SDK - WEBSITE VERSION (does nothing)
// ==========================================
// Subomi's SDK is native (iOS and Android only), so the website never loads
// it. Phones use services/sparksSdk.native.ts. The website still shows every
// Spark: they come from our backend, worked out by members' phones.
import type { DeviceCapabilities, ModelStatus } from "@cosquest/sparks-sdk";

export type { ModelStatus, DeviceCapabilities };

export const SPARKS_MODEL_MANIFEST = "";

export function sparksEnabled() {
  return false;
}

export function getSparksSdk() {
  return null;
}

export async function startSparks(_userId: string | null | undefined, _getToken?: () => string | null | undefined) {
  return null;
}

export async function stopSparks(_options: { wipe?: boolean } = {}) {}

export function toSparksMessage(_chatId: string, _message: any) {
  return null;
}

export async function feedMembers(_chatId: string, _people: any[]) {}

export async function feedMessages(_chatId: string, _messages: any[]) {}

export async function getCapabilities(): Promise<DeviceCapabilities | null> {
  return null;
}

export function modelStatus(): ModelStatus | null {
  return null;
}

export function onModelStatus(_listener: (status: ModelStatus) => void) {
  return () => {};
}

export async function downloadModel(_allowCellular = false): Promise<ModelStatus | null> {
  return null;
}

export function cancelModelDownload() {}

export async function deleteModel() {}

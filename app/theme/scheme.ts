// Light or dark, for both halves: the phone's setting, or the Appearance
// screen's choice when it is Light or Dark (constants/chatTheme.ts).
import { useChatScheme } from "@/constants/chatTheme";

import { ROLES, type Roles } from "./tokens";

export const useScheme = useChatScheme;

/** The semantic colours for the current scheme. */
export function useRoles(): Roles {
  return ROLES[useChatScheme()];
}

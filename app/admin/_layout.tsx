// ==========================================
// SUPER ADMIN DASHBOARD (/admin) - website only
// ==========================================
// Phones: not available (back to the app). Signed out of the dashboard: the
// sign-in page. Signed in: the admin frame (sidebar + top bar) around the
// page. The dashboard session is separate from the app's (services/admin.ts).
import { Redirect, Slot, usePathname } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import AdminShell from "@/components/admin/AdminShell";
import { checkAdminSession, useAdminSession } from "@/services/admin";

export default function AdminLayout() {
  const path = usePathname() || "/admin";
  const session = useAdminSession();

  // Is the saved session still good? (Signs out here when it isn't.)
  useEffect(() => {
    if (Platform.OS === "web") checkAdminSession();
  }, []);

  if (Platform.OS !== "web") return <Redirect href="/" />;

  if (path === "/admin/login") {
    return session ? <Redirect href={"/admin" as any} /> : <Slot />;
  }
  if (!session) return <Redirect href={"/admin/login" as any} />;

  return (
    <AdminShell>
      <Slot />
    </AdminShell>
  );
}

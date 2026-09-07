import { MOCK_USER, type ProfileUser } from "@/constants/mockUser";
import { createContext, useContext, useState } from "react";

// App-wide current user. Seeded from MOCK_USER for now; onboarding writes the
// picked photo into it on finish. Later, replace the seed by fetching
// GET /api/users/me and calling setUser with the response.
type UserContextValue = {
  user: ProfileUser;
  updateUser: (patch: Partial<ProfileUser>) => void;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ProfileUser>(MOCK_USER);

  const updateUser = (patch: Partial<ProfileUser>) =>
    setUser((prev) => ({ ...prev, ...patch }));

  return (
    <UserContext.Provider value={{ user, updateUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
}

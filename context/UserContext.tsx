import { MOCK_USER, type ProfileUser } from "@/constants/mockUser";
import { createContext, useContext, useState } from "react";

type UserContextValue = {
  user: ProfileUser;
  updateUser: (patch: Partial<ProfileUser>) => void;
  setUser: (user: ProfileUser) => void;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ProfileUser>(MOCK_USER);

  const updateUser = (patch: Partial<ProfileUser>) => {
    setUser((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  return (
    <UserContext.Provider
      value={{
        user,
        updateUser,
        setUser,
      }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);

  if (!ctx) {
    throw new Error("useUser must be used inside <UserProvider>");
  }

  return ctx;
}

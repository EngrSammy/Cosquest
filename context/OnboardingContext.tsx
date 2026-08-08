import { createContext, useContext, useState } from "react";

export type OnboardingData = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username: string;
  age: number | null;
  gender: string;
  avatar: string;
  interests: string[];
  faction: string;
  radiusMi: number;
  locationGranted: boolean;
  lat: number | null;
  lng: number | null;
  notificationsEnabled: boolean;
};

const EMPTY: OnboardingData = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  username: "",
  age: null,
  gender: "",
  avatar: "",
  interests: [],
  faction: "",
  radiusMi: 50,
  locationGranted: false,
  lat: null,
  lng: null,
  notificationsEnabled: false,
};

type OnboardingContextValue = {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
  reset: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState<OnboardingData>(EMPTY);

  const update = (patch: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  };
  const reset = () => {
    setData(EMPTY);
  };
  return (
    <OnboardingContext.Provider value={{ data, update, reset }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx)
    throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return ctx;
}

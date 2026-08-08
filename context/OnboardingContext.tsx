import { createContext, useContext, useState } from "react";

export type OnboardingData = {
  firstName: string;
  lastName: string;
  username: string;
  age: string;
  gender: string;
  avatar: string;
  interests: string[];
  faction: string;
  radiusMi: number;
  locationGranted: boolean;
};

const EMPTY: OnboardingData = {
  firstName: "",
  lastName: "",
  username: "",
  age: "",
  gender: "",
  avatar: "",
  interests: [],
  faction: "",
  radiusMi: 50,
  locationGranted: false,
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

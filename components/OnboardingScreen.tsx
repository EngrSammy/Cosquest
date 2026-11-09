// The frame every onboarding screen sits in (sign-up, sign-in, the profile
// steps): the background, room for the status bar and the home indicator /
// gesture bar, a scroll view that keeps the focused field above the keyboard,
// and an optional footer pinned above the bottom inset (a Continue button
// that should not scroll away). Screens keep their own padding and look in
// `contentStyle`; this only adds the safe-area room.
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBackground } from "@/components/AppBackground";
import { KeyboardAwareScrollView } from "@/components/ui/keyboard";

type Background = "plain" | "gradient" | "blueGradient" | "blueMap";

export function OnboardingScreen({
  children,
  background = "gradient",
  contentStyle,
  topGap = 35,
  insetTop = true,
  bottomGap = 0,
  centered = false,
  footer,
  footerStyle,
}: {
  children: ReactNode;
  background?: Background;
  /** The screen's own content style (side padding, gaps, its bottom padding). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Space under the status bar / notch. */
  topGap?: number;
  /** false when the content pads the top inset itself (OnboardingProgress does). */
  insetTop?: boolean;
  /** Space above the home indicator, on top of the inset and contentStyle. */
  bottomGap?: number;
  /** Centre the content when it is shorter than the screen (the welcome). */
  centered?: boolean;
  /** Pinned under the scrolling content, above the bottom inset. */
  footer?: ReactNode;
  footerStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <AppBackground variant={background}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: centered ? "center" : "flex-start",
          paddingTop: (insetTop ? insets.top : 0) + topGap,
          paddingBottom: (footer ? 0 : insets.bottom) + bottomGap,
        }}>
        <View style={[{ flexGrow: 1 }, centered && { flexGrow: 0 }, contentStyle]}>{children}</View>
      </KeyboardAwareScrollView>
      {footer ? <View style={[{ paddingHorizontal: 25, paddingTop: 8, paddingBottom: insets.bottom + 16 }, footerStyle]}>{footer}</View> : null}
    </AppBackground>
  );
}

/**
 * A hero picture's height that fits the phone: `max` on tall phones, smaller
 * on short ones (an iPhone SE is 667 points tall) so the headline, the picture
 * and the button fit without scrolling. `reserve` is the height everything
 * else on the screen needs.
 */
export function useHeroHeight(max: number, reserve: number, min = 140): number {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return Math.round(Math.max(min, Math.min(max, height - insets.top - insets.bottom - reserve)));
}

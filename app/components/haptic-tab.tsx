import { PlatformPressable } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { type ComponentProps, type ReactNode } from 'react';

export function HapticTab(
  props: Omit<ComponentProps<typeof PlatformPressable>, 'style'>
): ReactNode {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}

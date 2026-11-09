// TEST BUILDS ONLY (EXPO_PUBLIC_E2E=1): posts a local notification shaped like
// the backend's pushes (cosquest-backend src/utils/push.js), so the push tap
// journey can tap it in the shade and land where a real one would
// (components/PushBridge.tsx). cosquest://dev/push-test?type=message&conversationId=...
import * as Notifications from "expo-notifications";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

const E2E = process.env.EXPO_PUBLIC_E2E === "1";

export default function DevPushTest() {
  const params = useLocalSearchParams<Record<string, string>>();
  useEffect(() => {
    if (!E2E) return;
    const { title = "CosQuest", body = "Test notification", ...data } = params;
    void Notifications.requestPermissionsAsync()
      .then(() =>
        Notifications.scheduleNotificationAsync({
          content: { title, body, data },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
        }),
      )
      .catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!E2E) return <Redirect href="/" />;
  return null;
}

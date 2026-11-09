// The invite link of a scheduled call (https://cosquest.vercel.app/call/scheduled/<id>,
// from the backend's inviteUrl): opens its Call details.
import { Redirect, useLocalSearchParams } from "expo-router";

export default function ScheduledCallLink() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id) return <Redirect href="/" />;
  return <Redirect href={{ pathname: "/group/scheduled-call/[callId]", params: { callId: id } }} />;
}

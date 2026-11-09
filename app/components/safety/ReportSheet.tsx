// The Report sheet for users, posts, comments, messages and groups (task 059).
// Mounted once at the root; any screen opens it with openReport(). A reason,
// optional details, then Send; for people (and their messages) it offers to
// block them too. Shown only where the server takes reports
// (services/capabilities.ts): callers check `useCapabilities().reports`.
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { Button, Sheet } from "@/components/kit";
import { FONTS } from "@/constants/fonts";
import { useCapabilities } from "@/services/capabilities";
import { blockPerson, REPORT_REASONS, type ReportTarget, sendReport } from "@/services/safety";
import { useAppSelector } from "@/store/hooks";
import { radius, space, type, useRoles } from "@/theme";
import { haptic } from "@/utils/haptics";

export type ReportRequest = {
  targetType: ReportTarget;
  targetId: string;
  /** Shown in the title: "Report @ada", "Report this post". */
  name?: string;
  /** The person behind it (to offer Block). */
  person?: { username?: string | null; userId?: string | null } | null;
  snapshot?: string;
  conversationId?: string;
  onBlocked?: () => void;
};

let open: ((r: ReportRequest) => void) | null = null;

export function openReport(request: ReportRequest) {
  open?.(request);
}

const TITLE: Record<ReportTarget, string> = {
  user: "Report this person",
  post: "Report this post",
  comment: "Report this comment",
  message: "Report this message",
  group: "Report this group",
};

export default function ReportSheetHost() {
  const token = useAppSelector((state) => state.auth.token);
  const caps = useCapabilities();
  const r = useRoles();
  const [request, setRequest] = useState<ReportRequest | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    open = (req) => {
      setRequest(req);
      setReason(null);
      setDetails("");
      setAlsoBlock(false);
    };
    return () => {
      open = null;
    };
  }, []);

  const close = () => setRequest(null);

  const send = async () => {
    if (!request || !reason || !token) return;
    setSending(true);
    try {
      await sendReport(token, {
        targetType: request.targetType,
        targetId: request.targetId,
        reason,
        details: details.trim() || undefined,
        snapshot: request.snapshot,
        conversationId: request.conversationId,
      });
      let blocked = false;
      if (alsoBlock && request.person) {
        try {
          await blockPerson(token, request.person, caps.blockAnywhere);
          blocked = true;
        } catch {
          blocked = false;
        }
      }
      haptic.success();
      close();
      if (blocked) request.onBlocked?.();
      Alert.alert("Thanks for telling us", blocked ? "We'll look at it. You won't see them any more." : "We'll look at it. We don't tell them who reported.");
    } catch (error) {
      haptic.error();
      Alert.alert("Report", error instanceof Error ? error.message : "Couldn't send the report. Try again.");
    } finally {
      setSending(false);
    }
  };

  const reasons = REPORT_REASONS.filter((x) => !caps.reportReasons.length || caps.reportReasons.includes(x.key));
  const name = request?.name ? `Report ${request.name}` : request ? TITLE[request.targetType] : "";

  return (
    <Sheet
      visible={!!request}
      onClose={close}
      title={name}
      message={reason ? "Anything else we should know? (optional)" : "Why are you reporting this?"}
      testID="report-sheet"
      options={
        reason
          ? undefined
          : reasons.map((x) => ({
              key: x.key,
              label: x.label,
              onPress: () => setReason(x.key),
            }))
      }>
      {reason ? (
        <View style={styles.form}>
          <Text style={[styles.chosen, { color: r.textMuted }]}>{REPORT_REASONS.find((x) => x.key === reason)?.label}</Text>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Add details"
            placeholderTextColor={r.placeholder}
            multiline
            maxLength={1000}
            style={[styles.input, { color: r.text, borderColor: r.border, backgroundColor: r.surfaceAlt }]}
            accessibilityLabel="Details"
          />
          {request?.person && (request.person.username || (request.person.userId && caps.blockAnywhere)) ? (
            <View style={styles.blockRow}>
              <Text style={[styles.blockText, { color: r.text }]}>Also block {request.person.username ? `@${request.person.username}` : "them"}</Text>
              <Switch value={alsoBlock} onValueChange={setAlsoBlock} accessibilityLabel="Also block" />
            </View>
          ) : null}
          <Button label="Send report" onPress={send} loading={sending} testID="report-send" />
          <Button label="Back" variant="ghost" onPress={() => setReason(null)} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md, paddingTop: space.sm },
  chosen: { fontFamily: FONTS.medium, ...type.small, textAlign: "center" },
  input: { minHeight: 90, borderWidth: 1, borderRadius: radius.md, padding: space.md, fontFamily: FONTS.regular, ...type.body, textAlignVertical: "top" },
  blockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xs },
  blockText: { fontFamily: FONTS.medium, ...type.body },
});

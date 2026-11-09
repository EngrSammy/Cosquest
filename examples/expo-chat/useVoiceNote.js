import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { File } from 'expo-file-system';

function compactWaveform(samples, size = 64) {
  if (!samples.length) return undefined;
  return Array.from({ length: Math.min(size, samples.length) }, (_, index) => {
    const start = Math.floor(index * samples.length / Math.min(size, samples.length));
    const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / Math.min(size, samples.length)));
    return Math.max(...samples.slice(start, end));
  });
}

// Mount this hook in the chat composer. Stop first, preview if desired, then
// call send(). A failed upload retains the local draft so the user can retry.
export function useVoiceNote({ api, conversationId }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 150);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const lock = useRef(false);
  const active = useRef(false);
  const mounted = useRef(true);
  const samples = useRef([]);
  const recordingChat = useRef(conversationId);

  useEffect(() => {
    if (recorderState.isRecording && Number.isFinite(recorderState.metering)) {
      samples.current.push(Math.min(1, Math.max(0, Math.pow(10, recorderState.metering / 20))));
      // Bound memory while preserving the shape across a longer recording.
      if (samples.current.length > 4096) samples.current = compactWaveform(samples.current, 2048);
    }
  }, [recorderState.durationMillis, recorderState.isRecording, recorderState.metering]);

  async function guarded(action) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError(null);
    try { return await action(); }
    catch (failure) {
      if (mounted.current) setError(failure.message);
      throw failure;
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const start = () => guarded(async () => {
    if (active.current) throw new Error('A recording is already in progress.');
    if (draft) throw new Error('Send or discard the current voice note first.');
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) throw new Error('Microphone access is required to record a voice note.');
    samples.current = [];
    recordingChat.current = conversationId;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    try {
      await recorder.prepareToRecordAsync();
      if (!mounted.current || AppState.currentState !== 'active') throw new Error('Return to the chat to start recording.');
      recorder.record();
      active.current = true;
    } catch (failure) {
      await setAudioModeAsync({ allowsRecording: false });
      throw failure;
    }
  });

  const stop = () => guarded(async () => {
    if (!active.current) return draft;
    try {
      await recorder.stop();
      active.current = false;
      if (!recorder.uri) throw new Error('No recorded audio was produced.');
      const next = { uri: recorder.uri, name: `voice-${Date.now()}.m4a`, mimeType: 'audio/mp4', waveform: compactWaveform(samples.current), conversationId: recordingChat.current };
      if (mounted.current) setDraft(next);
      return next;
    } finally {
      await setAudioModeAsync({ allowsRecording: false });
    }
  });

  const discard = () => guarded(async () => {
    if (active.current) {
      await recorder.stop();
      active.current = false;
      await setAudioModeAsync({ allowsRecording: false });
    }
    const uri = draft?.uri || recorder.uri;
    if (uri) { const file = new File(uri); if (file.exists) file.delete(); }
    setDraft(null);
    samples.current = [];
  });

  const send = (replyTo) => guarded(async () => {
    if (active.current || !draft) throw new Error('Stop recording before sending.');
    if (draft.conversationId !== conversationId) throw new Error('This voice note was recorded in another chat. Return there or discard it.');
    const result = await api.sendVoiceNote(conversationId, draft, { waveform: draft.waveform, replyTo });
    // Server confirmation comes first; a network failure never discards the draft.
    setDraft(null);
    try { const file = new File(draft.uri); if (file.exists) file.delete(); } catch { /* Cache cleanup must not turn a sent message into an error. */ }
    return result;
  });

  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && active.current) stopRef.current().catch(() => {});
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      // useAudioRecorder releases its native recorder when the component unmounts.
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, []);

  return { start, stop, send, discard, draft, busy, error,
    isRecording: recorderState.isRecording, durationSeconds: recorderState.durationMillis / 1000 };
}

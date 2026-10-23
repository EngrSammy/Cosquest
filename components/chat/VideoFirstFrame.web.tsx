// WEB - shows a video's first frame by letting the browser load just the
// start of the video (preload="metadata") without playing it.
// The "#t=0.1" at the end makes Safari (iPhone) draw a frame too - by
// default it would stay blank until played.
export default function VideoFirstFrame({ uri }: { uri: string }) {
  const src =
    uri.startsWith("blob:") || uri.startsWith("data:") ? uri : `${uri}#t=0.1`;

  return (
    <video
      src={src}
      preload="metadata"
      muted
      playsInline
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        pointerEvents: "none",
        backgroundColor: "#25252D",
      }}
    />
  );
}

// Cloudinary can give the first frame of any video as a picture, just by
// changing its link:
//   .../video/upload/v123/cosquest/clip.mp4
//   .../video/upload/so_0,w_720,c_limit/v123/cosquest/clip.jpg
// (so_0 = frame at 0 seconds, w_720 = resized, .jpg = as an image)
// Instant and cached, on phones AND the website - no need to download
// the video first. Returns null for anything that isn't a Cloudinary video.
export function getCloudinaryVideoPoster(
  url?: string | null,
  width = 720,
): string | null {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) {
    return null;
  }

  const withoutQuery = url.split("?")[0];

  const withFrame = withoutQuery.replace(
    "/video/upload/",
    `/video/upload/so_0,w_${width},c_limit/`,
  );

  return withFrame.replace(/\.[a-z0-9]+$/i, ".jpg");
}

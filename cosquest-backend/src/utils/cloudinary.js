let cloudinary = null;

function getCloudinary() {
  if (cloudinary) return cloudinary;
  if (!process.env.CLOUDINARY_CLOUD_NAME) return null;

  // eslint-disable-next-line global-require
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return cloudinary;
}

function cloudinaryImageUrl(publicId, format = 'png') {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName || !publicId) return null;
  const encodedPublicId = publicId.split('/').map(encodeURIComponent).join('/');
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/${encodedPublicId}.${format}`;
}

module.exports = { getCloudinary, cloudinaryImageUrl };

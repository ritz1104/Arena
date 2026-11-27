import { createReadStream } from 'node:fs';
import ImageKit from 'imagekit';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

let client;

function getClient() {
  const { publicKey, privateKey, urlEndpoint } = config.imagekit;
  if (!publicKey || !privateKey || !urlEndpoint) {
    throw new AppError('ImageKit is not configured. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT.', 503);
  }
  if (!client) client = new ImageKit({ publicKey, privateKey, urlEndpoint });
  return client;
}

export function uploadImageKitFile(file, folder) {
  return getClient().upload({
    file: createReadStream(file.path),
    fileName: file.filename,
    folder,
    useUniqueFileName: false,
  });
}

export function listImageKitFiles(path) {
  return getClient().listFiles({ path, limit: 1000 });
}

export function deleteImageKitFile(fileId) {
  return getClient().deleteFile(fileId);
}

export function isImageKitUrl(value) {
  try {
    const url = new URL(value);
    const endpoint = new URL(config.imagekit.urlEndpoint);
    return url.protocol === 'https:' && url.origin === endpoint.origin;
  } catch {
    return false;
  }
}

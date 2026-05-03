import fs from "fs";
import path from "path";

export const GALLERY_IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export function isInsideDirectory(targetPath: string, parentDir: string): boolean {
  const relative = path.relative(parentDir, targetPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function extractGalleryImageRelativePath(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    const rawPath = `${url.hostname}${url.pathname}`.replace(/^\/+/, "");
    if (!rawPath) {
      return null;
    }
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
}

export function resolveGalleryImageFilePath(imagePath: string, imagesDir: string): string | null {
  const normalized = path.normalize(imagePath);

  if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) {
    return null;
  }

  const absolutePath = path.resolve(imagesDir, normalized);
  if (!isInsideDirectory(absolutePath, imagesDir)) {
    return null;
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }

  return absolutePath;
}

export function getGalleryImageContentType(filePath: string): string {
  return GALLERY_IMAGE_MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

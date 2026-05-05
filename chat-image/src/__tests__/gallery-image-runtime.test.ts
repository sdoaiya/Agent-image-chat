import { describe, expect, it } from "vitest";
import path from "path";
import { extractGalleryImageRelativePath, getGalleryImageContentType, isInsideDirectory, resolveGalleryImageFilePath } from "../../electron/gallery-image";

const galleryImagesDir = path.resolve(process.cwd(), "vendor", "awesome-gpt-image-2-main", "data", "images");

describe("gallery-image runtime helpers", () => {
  it("应解析 Electron gallery-image:// URL，包括 host 形式路径", () => {
    expect(extractGalleryImageRelativePath("gallery-image://case1.jpg")).toBe("case1.jpg");
    expect(extractGalleryImageRelativePath("gallery-image://folder/case1.jpg")).toBe("folder/case1.jpg");
    expect(extractGalleryImageRelativePath("gallery-image:///case1.jpg")).toBe("case1.jpg");
    expect(extractGalleryImageRelativePath("gallery-image://%E5%85%AC%E4%BC%97%E5%8F%B7.png")).toBe("公众号.png");
  });

  it("应拒绝空路径、绝对路径和目录穿越", () => {
    expect(extractGalleryImageRelativePath("gallery-image://")).toBeNull();
    expect(resolveGalleryImageFilePath("../case1.jpg", galleryImagesDir)).toBeNull();
    expect(resolveGalleryImageFilePath("..\\case1.jpg", galleryImagesDir)).toBeNull();
    expect(resolveGalleryImageFilePath("/etc/passwd", galleryImagesDir)).toBeNull();
    expect(resolveGalleryImageFilePath("C:\\temp\\case1.jpg", galleryImagesDir)).toBeNull();
  });

  it("应解析已存在图片并给出正确 content-type", () => {
    const jpgPath = resolveGalleryImageFilePath("case1.jpg", galleryImagesDir);
    const pngPath = resolveGalleryImageFilePath("case129.png", galleryImagesDir);
    const svgPath = resolveGalleryImageFilePath("banner.svg", galleryImagesDir);

    expect(jpgPath).toContain(path.join("data", "images", "case1.jpg"));
    expect(getGalleryImageContentType(jpgPath!)).toBe("image/jpeg");
    expect(getGalleryImageContentType(pngPath!)).toBe("image/png");
    expect(getGalleryImageContentType(svgPath!)).toBe("image/svg+xml");
  });

  it("应对不存在文件返回 null", () => {
    expect(resolveGalleryImageFilePath("missing-file.jpg", galleryImagesDir)).toBeNull();
  });

  it("应仅允许命中给定目录内的文件", () => {
    const inside = path.resolve(galleryImagesDir, "case1.jpg");
    const outside = path.resolve(process.cwd(), "package.json");

    expect(isInsideDirectory(inside, galleryImagesDir)).toBe(true);
    expect(isInsideDirectory(outside, galleryImagesDir)).toBe(false);
  });
});

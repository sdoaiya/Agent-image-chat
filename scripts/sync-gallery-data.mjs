import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DOC_FILES = [
  "vendor/awesome-gpt-image-2-main/docs/gallery-part-1.md",
  "vendor/awesome-gpt-image-2-main/docs/gallery-part-2.md",
];
const OUTPUT_FILE = "src/data/gallery.generated.ts";
const UPSTREAM_DOC_BASE = "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs";

function escapeString(value) {
  return JSON.stringify(value);
}

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function truncate(value, max) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function detectLanguage(prompt) {
  if (prompt.includes("[中文]") && prompt.includes("[English]")) {
    return "multilingual";
  }
  if (/[ぁ-んァ-ヴ]/.test(prompt)) {
    return /[\u4e00-\u9fff]/.test(prompt) ? "multilingual" : "ja";
  }
  if (/[\u4e00-\u9fff]/.test(prompt)) {
    return /[A-Za-z]{12,}/.test(prompt) ? "multilingual" : "zh";
  }
  return "en";
}

function collectTags(title, prompt, category, language) {
  const source = `${title}\n${prompt}`.toLowerCase();
  const dictionary = [
    ["信息图", ["信息图", "infographic", "百科", "图鉴", "图谱", "流程图", "地图"]],
    ["海报", ["海报", "poster", "campaign", "主视觉", "kv"]],
    ["UI", [" ui", "ui ", "界面", "dashboard", "app", "截图", "slide", "幻灯片"]],
    ["角色", ["角色", "character", "key visual", "动画", "机甲", "圣斗士"]],
    ["人像", ["人像", "portrait", "写真", "少女", "模特", "coser", "自拍"]],
    ["教程", ["教程", "教学", "guide", "workflow", "diagram"]],
    ["城市", ["城市", "city", "beijing", "台州", "urban"]],
    ["品牌", ["品牌", "brand", "chronicle", "campaign"]],
    ["电影感", ["电影", "cinematic", "史诗"]],
  ];

  const tags = [category, language];
  for (const [tag, keywords] of dictionary) {
    if (keywords.some((keyword) => source.includes(keyword))) {
      tags.push(tag);
    }
    if (tags.length >= 6) {
      break;
    }
  }
  return Array.from(new Set(tags));
}

function classifyCategory(title, prompt) {
  const text = `${title}\n${prompt}`.toLowerCase();

  const has = (...keywords) => keywords.some((keyword) => text.includes(keyword));

  if (has("信息图", "infographic", "百科", "图鉴", "图谱", "流程图", "结构图", "地图", "atlas", "cutaway", "试卷")) {
    return "infographic";
  }
  if (has(" ui", "ui ", "界面", "dashboard", "截图", "app", "幻灯片", "presentation", "chronicle", "x 的内容截图", "手机截图")) {
    return "ui";
  }
  if (has("角色", "character", "key visual", "动画", "机甲", "圣斗士", "桃太郎", "异形")) {
    return "character";
  }
  if (has("人像", "portrait", "写真", "少女", "模特", "coser", "自拍", "ruqun", "idol")) {
    return "portrait";
  }
  if (has("海报", "poster", "campaign", "主视觉", "封面", "宣传画", "版式", "kv", "电影")) {
    return "poster";
  }
  return "community";
}

function buildSummary(title, prompt, category) {
  const normalized = prompt.replace(/\[中文\]|\[English\]/g, "").replace(/\s+/g, " ").trim();
  const firstSentence = normalized.split(/(?<=[。！？.!?])\s+/)[0] || normalized;
  return truncate(`${title}：${firstSentence || category}`, 88);
}

function parseSource(sourceLine, fallbackUrl) {
  const trimmed = sourceLine.trim();
  const linkMatch = trimmed.match(/^\[(.+?)\]\((https?:\/\/[^)]+)\)$/);
  if (linkMatch) {
    return {
      sourceLabel: linkMatch[1].replace(/\\_/g, "_"),
      sourceUrl: linkMatch[2],
      sourceType: "linked",
    };
  }

  if (trimmed === "未提供") {
    return {
      sourceLabel: "未提供",
      sourceUrl: fallbackUrl,
      sourceType: "missing",
    };
  }

  return {
    sourceLabel: trimmed.replace(/\\_/g, "_"),
    sourceUrl: fallbackUrl,
    sourceType: "text",
  };
}

function getImageSize(filePath) {
  const buffer = readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".png") {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (ext === ".gif") {
    return {
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  if (ext === ".webp") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 ") {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const b0 = buffer[21];
      const b1 = buffer[22];
      const b2 = buffer[23];
      const b3 = buffer[24];
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + length;
    }
  }

  throw new Error(`Unsupported image type or unreadable dimensions: ${filePath}`);
}

function parseDocument(filePath) {
  const absolutePath = path.join(ROOT, filePath);
  const text = readFileSync(absolutePath, "utf8");
  const blocks = text.split(/(?=^### 例 \d+：)/m).filter((block) => block.startsWith("### 例 "));
  const docName = path.basename(filePath);

  return blocks.map((rawBlock) => {
    const block = rawBlock.replace(/\r\n/g, "\n");
    const headerMatch = block.match(/^### 例 (\d+)：(.+)$/m);
    const imageMatch = block.match(/!\[([\s\S]*?)\]\((.*?)\)/);
    const sourceMatch = block.match(/\*\*来源：\*\* (.+)/);
    const promptMatch = block.match(/\*\*提示词：\*\*[\s\S]*?```text\n([\s\S]*?)\n```/);

    if (!headerMatch || !imageMatch || !sourceMatch || !promptMatch) {
      throw new Error(`Failed to parse case block in ${filePath}: ${block.slice(0, 160)}`);
    }

    const caseNumber = Number.parseInt(headerMatch[1], 10);
    const title = headerMatch[2].trim();
    const imageAlt = imageMatch[1].trim() || title;
    const imageRelativePath = imageMatch[2].replace(/^\.\.\/data\/images\//, "");
    const prompt = promptMatch[1].trim();
    const fallbackSourceUrl = `${UPSTREAM_DOC_BASE}/${docName}#case-${caseNumber}`;
    const { sourceLabel, sourceUrl, sourceType } = parseSource(sourceMatch[1], fallbackSourceUrl);
    const category = classifyCategory(title, prompt);
    const language = detectLanguage(prompt);
    const tags = collectTags(title, prompt, category, language);
    const summary = buildSummary(title, prompt, category);
    const imageFilePath = path.join(ROOT, "vendor/awesome-gpt-image-2-main/data/images", imageRelativePath);
    const { width, height } = getImageSize(imageFilePath);
    const createdAt = new Date(Date.UTC(2026, 3, 1, 0, caseNumber, 0)).toISOString();

    return {
      id: `gallery-case-${String(caseNumber).padStart(3, "0")}-${slugifyTitle(title) || "item"}`,
      caseNumber,
      title,
      imageAlt,
      imageRelativePath,
      sourceLabel,
      sourceUrl,
      sourceType,
      prompt,
      summary,
      category,
      language,
      tags,
      width,
      height,
      createdAt,
      upstreamDoc: docName,
    };
  });
}

const parsedCases = DOC_FILES.flatMap(parseDocument).sort((a, b) => a.caseNumber - b.caseNumber);
const presentNumbers = new Set(parsedCases.map((item) => item.caseNumber));
const minCaseNumber = parsedCases[0]?.caseNumber ?? 0;
const maxCaseNumber = parsedCases[parsedCases.length - 1]?.caseNumber ?? 0;
const missingCaseNumbers = [];
for (let index = minCaseNumber; index <= maxCaseNumber; index += 1) {
  if (!presentNumbers.has(index)) {
    missingCaseNumbers.push(index);
  }
}

const categoryCounts = Object.fromEntries(
  ["portrait", "poster", "ui", "character", "infographic", "community"].map((category) => [
    category,
    parsedCases.filter((item) => item.category === category).length,
  ]),
);

const output = `/* eslint-disable */
// 此文件由 scripts/sync-gallery-data.mjs 自动生成，请勿手工修改。

export type GalleryCategory = "portrait" | "poster" | "ui" | "character" | "infographic" | "community";
export type GallerySourceType = "linked" | "text" | "missing";

export interface ParsedGalleryExampleSeed {
  id: string;
  caseNumber: number;
  title: string;
  imageAlt: string;
  imageRelativePath: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceType: GallerySourceType;
  prompt: string;
  summary: string;
  category: GalleryCategory;
  language: string;
  tags: string[];
  width: number;
  height: number;
  createdAt: string;
  upstreamDoc: string;
}

export interface GalleryDatasetStats {
  parsedCaseCount: number;
  declaredRangeEnd: number;
  missingCaseNumbers: number[];
  legacyExpectedCount: number;
  categoryCounts: Record<GalleryCategory, number>;
}

export const galleryDatasetStats: GalleryDatasetStats = ${JSON.stringify(
    {
      parsedCaseCount: parsedCases.length,
      declaredRangeEnd: maxCaseNumber,
      missingCaseNumbers,
      legacyExpectedCount: 346,
      categoryCounts,
    },
    null,
    2,
  )} as const;

export const parsedGalleryExampleSeeds: ParsedGalleryExampleSeed[] = [
${parsedCases
  .map(
    (item) => `  {
    id: ${escapeString(item.id)},
    caseNumber: ${item.caseNumber},
    title: ${escapeString(item.title)},
    imageAlt: ${escapeString(item.imageAlt)},
    imageRelativePath: ${escapeString(item.imageRelativePath)},
    sourceLabel: ${escapeString(item.sourceLabel)},
    sourceUrl: ${escapeString(item.sourceUrl)},
    sourceType: ${escapeString(item.sourceType)},
    prompt: ${escapeString(item.prompt)},
    summary: ${escapeString(item.summary)},
    category: ${escapeString(item.category)},
    language: ${escapeString(item.language)},
    tags: ${JSON.stringify(item.tags)},
    width: ${item.width},
    height: ${item.height},
    createdAt: ${escapeString(item.createdAt)},
    upstreamDoc: ${escapeString(item.upstreamDoc)},
  }`,
  )
  .join(",\n")}
];
`;

writeFileSync(path.join(ROOT, OUTPUT_FILE), output, "utf8");
console.log(`Generated ${OUTPUT_FILE} with ${parsedCases.length} cases. Missing case numbers: ${missingCaseNumbers.join(", ") || "none"}`);

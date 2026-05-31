import type { ExamplePromptItem } from "@/data/example-prompts";

export const YOUMIND_PROMPTS_PAGE_URL = "https://youmind.com/zh-CN/gpt-image-2-prompts";
export const YOUMIND_PROMPTS_README_URL = "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_zh.md";
export const YOUMIND_PROMPT_MODEL = "gpt-image-2";
export const YOUMIND_PROMPT_LOCALE = "zh-CN";
export const YOUMIND_PROMPT_PAGE_LIMIT = 100;

export interface YouMindPromptCategory {
  id?: number;
  title?: string;
  slug?: string;
  parentId?: number;
  parentSlug?: string;
}

export interface YouMindPromptApiItem {
  id: number;
  title: string;
  description?: string | null;
  slug: string;
  sourceLink?: string | null;
  sourcePublishedAt?: string | null;
  author?: {
    name?: string | null;
    link?: string | null;
  } | null;
  content: string;
  media?: string[];
  mediaThumbnails?: string[];
  language?: string | null;
  translatedContent?: string | null;
  sourcePlatform?: string | null;
  likes?: number | null;
  comments?: number | null;
  reposts?: number | null;
  views?: number | null;
  bookmarks?: number | null;
  resultsCount?: number | null;
  needReferenceImages?: boolean | null;
  promptCategories?: YouMindPromptCategory[];
}

export interface YouMindPromptsRequest {
  model?: string;
  page: number;
  limit?: number;
  locale?: string;
  q?: string;
  categories?: string;
  campaign?: string;
  filterMode?: string;
  searchMode?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface YouMindPromptsResponse {
  prompts: YouMindPromptApiItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface YouMindPromptReadmeDataset {
  prompts: YouMindPromptApiItem[];
  total: number;
  updatedAt: string | null;
}

const CATEGORY_SLUG_MAP: Record<string, ExamplePromptItem["category"]> = {
  "profile-avatar": "portrait",
  "social-media-post": "poster",
  "infographic-edu-visual": "infographic",
  "youtube-thumbnail": "poster",
  "comic-storyboard": "character",
  "poster-flyer": "poster",
  "app-web-design": "ui",
};

const INFOGRAPHIC_KEYWORDS = [
  "infographic",
  "diagram",
  "atlas",
  "timeline",
  "\u4fe1\u606f\u56fe",
  "\u6d41\u7a0b\u56fe",
  "\u56fe\u8868",
  "\u56fe\u9274",
];

const UI_KEYWORDS = [
  "app",
  "web",
  "ui",
  "ux",
  "dashboard",
  "homepage",
  "mockup",
  "wireframe",
  "\u754c\u9762",
  "\u7f51\u9875",
  "\u622a\u56fe",
];

const CHARACTER_KEYWORDS = [
  "comic",
  "storyboard",
  "character",
  "chibi",
  "mascot",
  "creature",
  "\u89d2\u8272",
  "\u52a8\u6f2b",
  "\u6f2b\u753b",
];

const PORTRAIT_KEYWORDS = [
  "portrait",
  "profile",
  "avatar",
  "headshot",
  "selfie",
  "fashion",
  "\u4eba\u50cf",
  "\u5934\u50cf",
  "\u5199\u771f",
  "\u6a21\u7279",
];

const POSTER_KEYWORDS = [
  "poster",
  "flyer",
  "thumbnail",
  "campaign",
  "cover",
  "\u6d77\u62a5",
  "\u4f20\u5355",
  "\u5c01\u9762",
  "\u5ba3\u4f20",
];

const README_SECTION_HEADER = /^### No\.\s+(\d+):\s+(.+)$/gm;
const README_TOTAL_REGEX = /\|\s*.*\u63d0\u793a\u8bcd\u603b\u6570\s*\|\s*\*\*([\d,]+)\*\*\s*\|/;
const README_UPDATED_AT_REGEX = /\u6700\u540e\u66f4\u65b0[:\uff1a]\s*([0-9T:.\-Z]+)/;
const README_DESCRIPTION_SECTION_REGEX = /#### [^\n]*\u63cf\u8ff0\s*\n+([\s\S]*?)\n+#### [^\n]*\u63d0\u793a\u8bcd/m;
const README_PROMPT_SECTION_REGEX = /#### [^\n]*\u63d0\u793a\u8bcd\s*\n+```(?:[\w-]+)?\n?([\s\S]*?)\n```/m;
const README_TRY_NOW_REGEX = /\*\*\[[^\]]+\]\((https?:\/\/[^)\s]+?[?&]id=(\d+)[^)\s]*)\)\*\*/;
const README_IMAGE_REGEX = /<img\s+src="([^"]+)"/g;

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function classifyYouMindCategory(prompt: YouMindPromptApiItem): ExamplePromptItem["category"] {
  for (const category of prompt.promptCategories ?? []) {
    const mappedCategory = category.slug ? CATEGORY_SLUG_MAP[category.slug] : undefined;
    if (mappedCategory) {
      return mappedCategory;
    }
  }

  const text = `${prompt.title}\n${prompt.description ?? ""}\n${prompt.content}`.toLowerCase();

  if (hasAny(text, INFOGRAPHIC_KEYWORDS)) {
    return "infographic";
  }
  if (hasAny(text, UI_KEYWORDS)) {
    return "ui";
  }
  if (hasAny(text, CHARACTER_KEYWORDS)) {
    return "character";
  }
  if (hasAny(text, PORTRAIT_KEYWORDS)) {
    return "portrait";
  }
  if (hasAny(text, POSTER_KEYWORDS)) {
    return "poster";
  }

  return "community";
}

function normalizeAuthorName(prompt: YouMindPromptApiItem): string {
  const name = prompt.author?.name?.trim();
  if (!name) {
    return "YouMind";
  }

  return name.startsWith("@") ? name : `@${name}`;
}

function buildYouMindPromptUrl(prompt: Pick<YouMindPromptApiItem, "id" | "slug">): string {
  return `https://youmind.com/zh-CN/prompts/${prompt.slug}-${prompt.id}`;
}

function getBestImageUrl(prompt: YouMindPromptApiItem): string {
  return prompt.mediaThumbnails?.[0] ?? prompt.media?.[0] ?? "";
}

function getBestReferenceImageUrl(prompt: YouMindPromptApiItem): string {
  return prompt.media?.[0] ?? getBestImageUrl(prompt);
}

function getImagePathFromUrl(imageUrl: string, id: number): string {
  try {
    const pathname = new URL(imageUrl).pathname;
    const filename = pathname.split("/").filter(Boolean).pop();
    return filename || `youmind-${id}.jpg`;
  } catch {
    return `youmind-${id}.jpg`;
  }
}

function getDimensionsFromImageUrl(imageUrl: string): { width: number; height: number } {
  const match = imageUrl.match(/-(\d{2,5})x(\d{2,5})(?=\.[a-zA-Z0-9]+(?:$|\?))/);
  if (match) {
    const [, widthValue, heightValue] = match;
    if (!widthValue || !heightValue) {
      return { width: 1024, height: 1024 };
    }

    return {
      width: Number.parseInt(widthValue, 10),
      height: Number.parseInt(heightValue, 10),
    };
  }

  return {
    width: 1024,
    height: 1024,
  };
}

function truncate(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(max - 3, 1)).trimEnd()}...`;
}

function buildSummary(prompt: YouMindPromptApiItem, category: ExamplePromptItem["category"]): string {
  const source = prompt.description?.trim() || prompt.translatedContent?.trim() || prompt.content;
  return truncate(`${prompt.title}: ${source || category}`, 96);
}

function buildTags(prompt: YouMindPromptApiItem, category: ExamplePromptItem["category"]): string[] {
  const tags = ["YouMind", category];
  if (prompt.language) {
    tags.push(prompt.language);
  }
  if (prompt.sourcePlatform) {
    tags.push(prompt.sourcePlatform);
  }
  if (prompt.needReferenceImages) {
    tags.push("\u53c2\u8003\u56fe");
  }
  for (const categoryItem of prompt.promptCategories ?? []) {
    if (categoryItem.title) {
      tags.push(categoryItem.title);
    }
  }
  return Array.from(new Set(tags));
}

function extractMarkdownField(section: string, label: string): string | null {
  const regex = new RegExp(`- \\*\\*${label}:\\*\\*\\s*([^\\n]+)`);
  return section.match(regex)?.[1]?.trim() ?? null;
}

function parseMarkdownLink(value: string | null): { text: string | null; url: string | null } {
  if (!value) {
    return { text: null, url: null };
  }

  const linkMatch = value.match(/^\[(.+?)\]\((https?:\/\/[^)]+)\)$/);
  if (linkMatch) {
    const [, text, url] = linkMatch;
    return {
      text: text?.trim() ?? null,
      url: url?.trim() ?? null,
    };
  }

  return {
    text: value.trim(),
    url: null,
  };
}

function parseChineseDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/);
  if (!match) {
    return null;
  }

  const [, yearValue, monthValue, dayValue] = match;
  if (!yearValue || !monthValue || !dayValue) {
    return null;
  }

  const year = Number.parseInt(yearValue, 10);
  const month = Number.parseInt(monthValue, 10);
  const day = Number.parseInt(dayValue, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function slugifyPromptTitle(title: string, id: number): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    return `prompt-${id}`;
  }

  if (slug.length < 5 && /[^\x00-\x7f]/.test(title)) {
    return `prompt-${id}`;
  }

  return slug;
}

function inferSourcePlatform(sourceLink: string | null): string | null {
  if (!sourceLink) {
    return null;
  }

  try {
    const hostname = new URL(sourceLink).hostname.toLowerCase();
    if (hostname === "x.com" || hostname.endsWith(".x.com") || hostname === "twitter.com" || hostname.endsWith(".twitter.com")) {
      return "twitter";
    }
    if (hostname === "github.com" || hostname.endsWith(".github.com")) {
      return "github";
    }
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
      return "instagram";
    }
    if (hostname === "youtube.com" || hostname === "youtu.be" || hostname.endsWith(".youtube.com")) {
      return "youtube";
    }

    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractReadmePromptSections(markdown: string): Array<{ sectionNumber: number; title: string; body: string }> {
  const matches = Array.from(markdown.matchAll(README_SECTION_HEADER));
  return matches.map((match, index) => {
    const nextMatch = matches[index + 1];
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = nextMatch?.index ?? markdown.length;
    const sectionNumber = Number.parseInt(match[1] ?? "0", 10);

    return {
      sectionNumber: Number.isFinite(sectionNumber) ? sectionNumber : index + 1,
      title: (match[2] ?? "").trim(),
      body: markdown.slice(bodyStart, bodyEnd),
    };
  });
}

function parseReadmePromptSection(section: { sectionNumber: number; title: string; body: string }): YouMindPromptApiItem | null {
  const description = section.body.match(README_DESCRIPTION_SECTION_REGEX)?.[1]?.trim() ?? null;
  const content = section.body.match(README_PROMPT_SECTION_REGEX)?.[1]?.trim() ?? "";
  const tryNowMatch = section.body.match(README_TRY_NOW_REGEX);
  const id = Number.parseInt(tryNowMatch?.[2] ?? "", 10);
  const promptId = Number.isFinite(id) ? id : 500000 + section.sectionNumber;
  const imageUrls = dedupeStrings(Array.from(section.body.matchAll(README_IMAGE_REGEX), (match) => match[1] ?? ""));
  const authorField = extractMarkdownField(section.body, "\u4f5c\u8005");
  const sourceField = extractMarkdownField(section.body, "\u6765\u6e90");
  const language = extractMarkdownField(section.body, "\u591a\u8bed\u8a00");
  const publishedAt = parseChineseDate(extractMarkdownField(section.body, "\u53d1\u5e03\u65f6\u95f4"));
  const author = parseMarkdownLink(authorField);
  const source = parseMarkdownLink(sourceField);

  if (!section.title || !content || imageUrls.length === 0) {
    return null;
  }

  return {
    id: promptId,
    title: section.title,
    description,
    slug: slugifyPromptTitle(section.title, promptId),
    sourceLink: source.url ?? tryNowMatch?.[1] ?? null,
    sourcePublishedAt: publishedAt,
    author: author.text
      ? {
          name: author.text,
          link: author.url,
        }
      : null,
    content,
    media: imageUrls,
    mediaThumbnails: imageUrls,
    language: language?.trim() || "unknown",
    translatedContent: description,
    sourcePlatform: inferSourcePlatform(source.url),
    needReferenceImages: /REFERENCE_\d+|\u53c2\u8003\u56fe|\u9644\u4ef6\u56fe\u7247/.test(content),
    promptCategories: [],
  };
}

export function getYouMindPromptReadmeUrl(locale = YOUMIND_PROMPT_LOCALE): string {
  switch (locale) {
    case "en-US":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README.md";
    case "zh-TW":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_zh-TW.md";
    case "ja-JP":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_ja-JP.md";
    case "ko-KR":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_ko-KR.md";
    case "th-TH":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_th-TH.md";
    case "vi-VN":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_vi-VN.md";
    case "hi-IN":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_hi-IN.md";
    case "es-ES":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_es-ES.md";
    case "es-419":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_es-419.md";
    case "de-DE":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_de-DE.md";
    case "fr-FR":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_fr-FR.md";
    case "it-IT":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_it-IT.md";
    case "pt-BR":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_pt-BR.md";
    case "pt-PT":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_pt-PT.md";
    case "tr-TR":
      return "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_tr-TR.md";
    case "zh-CN":
    default:
      return YOUMIND_PROMPTS_README_URL;
  }
}

export function parseYouMindPromptReadme(markdown: string): YouMindPromptReadmeDataset {
  const prompts = extractReadmePromptSections(markdown)
    .map(parseReadmePromptSection)
    .filter((prompt): prompt is YouMindPromptApiItem => Boolean(prompt));
  const totalMatch = markdown.match(README_TOTAL_REGEX);
  const totalValue = totalMatch?.[1]?.replace(/,/g, "");
  const total = totalValue ? Number.parseInt(totalValue, 10) : prompts.length;
  const updatedAt = markdown.match(README_UPDATED_AT_REGEX)?.[1] ?? null;

  return {
    prompts,
    total: Number.isFinite(total) ? total : prompts.length,
    updatedAt,
  };
}

export function mapYouMindPromptToExamplePromptItem(prompt: YouMindPromptApiItem): ExamplePromptItem {
  const category = classifyYouMindCategory(prompt);
  const imageUrl = getBestImageUrl(prompt);
  const referenceImageUrl = getBestReferenceImageUrl(prompt);
  const { width, height } = getDimensionsFromImageUrl(imageUrl);
  const upstreamPromptUrl = buildYouMindPromptUrl(prompt);

  return {
    id: `youmind-${prompt.id}`,
    title: prompt.title,
    category,
    author: normalizeAuthorName(prompt),
    language: prompt.language ?? "unknown",
    createdAt: prompt.sourcePublishedAt ?? new Date(0).toISOString(),
    sourceUrl: prompt.sourceLink ?? upstreamPromptUrl,
    imageUrl,
    referenceImageUrl,
    width,
    height,
    prompt: prompt.content,
    summary: buildSummary(prompt, category),
    tags: buildTags(prompt, category),
    caseNumber: 100000 + prompt.id,
    imageAlt: prompt.title,
    imagePath: getImagePathFromUrl(imageUrl, prompt.id),
    sourceType: prompt.sourceLink ? "linked" : "text",
    upstreamDoc: "youmind:gpt-image-2-prompts",
    sourceOrigin: "youmind",
    upstreamId: prompt.id,
    upstreamPromptUrl,
    engagement: {
      likes: prompt.likes ?? 0,
      comments: prompt.comments ?? 0,
      reposts: prompt.reposts ?? 0,
      views: prompt.views ?? 0,
      bookmarks: prompt.bookmarks ?? 0,
      resultsCount: prompt.resultsCount ?? 0,
    },
  };
}

export function mapYouMindPromptsToExamplePromptItems(prompts: YouMindPromptApiItem[]): ExamplePromptItem[] {
  return prompts
    .filter((prompt) => Boolean(getBestImageUrl(prompt)) && Boolean(prompt.content?.trim()))
    .map(mapYouMindPromptToExamplePromptItem);
}

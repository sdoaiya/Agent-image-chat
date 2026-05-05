import type { ExamplePromptItem } from "@/data/example-prompts";

export const YOUMIND_PROMPTS_PAGE_URL = "https://youmind.com/zh-CN/gpt-image-2-prompts";
export const YOUMIND_PROMPTS_ENDPOINT = "https://youmind.com/youhome-api/prompts";
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

const CATEGORY_SLUG_MAP: Record<string, ExamplePromptItem["category"]> = {
  "profile-avatar": "portrait",
  "social-media-post": "poster",
  "infographic-edu-visual": "infographic",
  "youtube-thumbnail": "poster",
  "comic-storyboard": "character",
  "poster-flyer": "poster",
  "app-web-design": "ui",
};

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

  if (hasAny(text, ["信息图", "infographic", "教育视觉", "图鉴", "图谱", "流程图", "diagram", "atlas", "timeline"])) {
    return "infographic";
  }
  if (hasAny(text, ["app", "web", "ui", "ux", "dashboard", "homepage", "界面", "网页", "截图", "mockup", "wireframe"])) {
    return "ui";
  }
  if (hasAny(text, ["comic", "storyboard", "character", "角色", "动漫", "chibi", "mascot", "creature"])) {
    return "character";
  }
  if (hasAny(text, ["portrait", "profile", "avatar", "headshot", "selfie", "fashion", "人像", "头像", "写真", "模特"])) {
    return "portrait";
  }
  if (hasAny(text, ["poster", "flyer", "thumbnail", "campaign", "cover", "海报", "传单", "封面", "宣传"])) {
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
      return {
        width: 1024,
        height: 1024,
      };
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
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

function buildSummary(prompt: YouMindPromptApiItem, category: ExamplePromptItem["category"]): string {
  const source = prompt.description?.trim() || prompt.translatedContent?.trim() || prompt.content;
  return truncate(`${prompt.title}：${source || category}`, 96);
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
    tags.push("参考图");
  }
  for (const categoryItem of prompt.promptCategories ?? []) {
    if (categoryItem.title) {
      tags.push(categoryItem.title);
    }
  }
  return Array.from(new Set(tags));
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
  return prompts.filter((prompt) => Boolean(getBestImageUrl(prompt)) && Boolean(prompt.content?.trim())).map(mapYouMindPromptToExamplePromptItem);
}

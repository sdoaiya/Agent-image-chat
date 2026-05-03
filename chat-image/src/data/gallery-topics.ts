import {
  examplePromptDatasetSummary,
  examplePromptLibrary,
  examplePromptLibraryStats,
  type ExamplePromptItem,
} from "@/data/example-prompts";

export interface GalleryTopicItem {
  id: string;
  title: string;
  category: ExamplePromptItem["category"];
  summary: string;
  sourceUrl: string;
  coverImageUrl: string;
  coverWidth: number;
  coverHeight: number;
  curator: string;
  createdAt: string;
  tags?: string[];
  totalEntries: number;
  featured?: boolean;
  entries: ExamplePromptItem[];
  caseNumberRange?: [number, number];
}

export interface GalleryTopicCoverageSummary {
  totalTopicCount: number;
  featuredTopicCount: number;
  deduplicatedCoveredCaseCount: number;
  uncoveredCaseCount: number;
  uncoveredCaseNumbers: number[];
  topicEntryCount: number;
  datasetCaseCount: number;
  coverageRatio: number;
}

export interface GalleryTopicDatasetSummary {
  dataset: {
    structuredCaseCount: number;
    declaredCaseRangeEnd: number;
    missingCaseNumbers: number[];
  };
  topics: {
    totalTopicCount: number;
    featuredTopicCount: number;
  };
  coverage: GalleryTopicCoverageSummary;
}

function getCategoryExamples(category: ExamplePromptItem["category"]) {
  return examplePromptLibrary.filter((item) => item.category === category);
}

function makeTopic(config: {
  id: string;
  title: string;
  category: ExamplePromptItem["category"];
  summary: string;
  sourceUrl: string;
  curator: string;
  createdAt: string;
  tags?: string[];
  featured?: boolean;
  take?: number;
  caseNumberRange?: [number, number];
}): GalleryTopicItem {
  const scoped = getCategoryExamples(config.category)
    .filter((item) => (config.caseNumberRange ? item.caseNumber >= config.caseNumberRange[0] && item.caseNumber <= config.caseNumberRange[1] : true))
    .slice(0, config.take ?? Number.MAX_SAFE_INTEGER);

  if (!scoped.length) {
    throw new Error(`Missing gallery topic entries: ${config.id}`);
  }

  const cover = scoped[0]!;

  return {
    id: config.id,
    title: config.title,
    category: config.category,
    summary: config.summary,
    sourceUrl: config.sourceUrl,
    coverImageUrl: cover.imageUrl,
    coverWidth: cover.width,
    coverHeight: cover.height,
    curator: config.curator,
    createdAt: config.createdAt,
    tags: config.tags,
    totalEntries: scoped.length,
    featured: config.featured,
    entries: scoped,
    caseNumberRange: config.caseNumberRange,
  };
}

export const galleryTopicLibrary: GalleryTopicItem[] = [
  makeTopic({
    id: "topic-ui-social-and-product-shots",
    title: "UI / 社媒截图与产品展示",
    category: "ui",
    summary: "覆盖社媒截图、手机界面、演示封面和产品感强的 UI 视觉案例。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-24T10:00:00Z",
    tags: ["UI", "Screenshot", "Product"],
    featured: true,
    take: 12,
  }),
  makeTopic({
    id: "topic-infographic-atlas-and-diagram",
    title: "图鉴 / Atlas 与复杂信息图",
    category: "infographic",
    summary: "适合复杂结构、百科、流程和知识整理的高密度信息图案例。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-24T10:05:00Z",
    tags: ["Infographic", "Atlas", "Diagram"],
    featured: true,
    take: 12,
  }),
  makeTopic({
    id: "topic-character-key-visual-and-cards",
    title: "角色 / Key Visual 与卡面设定",
    category: "character",
    summary: "覆盖角色主视觉、二创卡面、动画世界观和设定展示。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-2.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-24T10:10:00Z",
    tags: ["Character", "Key Visual", "Cards"],
    featured: true,
    take: 12,
  }),
  makeTopic({
    id: "topic-poster-editorial-and-campaign",
    title: "海报 / Editorial 与 Campaign",
    category: "poster",
    summary: "覆盖电影感海报、城市主视觉、封面排版与品牌 campaign 方向。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-2.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-24T10:15:00Z",
    tags: ["Poster", "Editorial", "Campaign"],
    featured: true,
    take: 12,
  }),
  makeTopic({
    id: "topic-portrait-fashion-and-photo",
    title: "人像 / 时尚写真与服饰镜头",
    category: "portrait",
    summary: "聚合真人写真、服饰特写、自拍构图和强镜头感人像案例。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-2.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-24T10:20:00Z",
    tags: ["Portrait", "Fashion", "Photo"],
    featured: true,
    take: 12,
  }),
  makeTopic({
    id: "topic-community-misc-creative-prompts",
    title: "社区 / 创意杂项与知识表达",
    category: "community",
    summary: "汇总难归类但可复用的社区创意案例与知识表达样本。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-2.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-24T10:25:00Z",
    tags: ["Community", "Creative", "Knowledge"],
    featured: true,
    take: 12,
  }),
  makeTopic({
    id: "topic-ui-cases-1-120",
    title: "UI / 早期案例段",
    category: "ui",
    summary: "聚焦前 120 号中的界面、截图、演示与产品展示型案例。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-23T09:30:00Z",
    tags: ["UI", "Part 1"],
    caseNumberRange: [1, 120],
  }),
  makeTopic({
    id: "topic-infographic-cases-1-180",
    title: "图鉴 / 前中段知识长图",
    category: "infographic",
    summary: "用于浏览前中段图鉴、地图、流程和知识卡片案例。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-23T09:40:00Z",
    tags: ["Infographic", "Part 1"],
    caseNumberRange: [1, 180],
  }),
  makeTopic({
    id: "topic-character-cases-160-351",
    title: "角色 / 后半段视觉设定",
    category: "character",
    summary: "重点覆盖后半段更集中的角色、动画与视觉设定类案例。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-2.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-23T09:50:00Z",
    tags: ["Character", "Part 2"],
    caseNumberRange: [160, 351],
  }),
  makeTopic({
    id: "topic-poster-cases-1-351",
    title: "海报 / 全量海报索引",
    category: "poster",
    summary: "按海报、封面、campaign 主视觉维度索引完整 poster 类案例。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-23T10:00:00Z",
    tags: ["Poster", "Index"],
  }),
  makeTopic({
    id: "topic-portrait-cases-1-351",
    title: "人像 / 完整写真索引",
    category: "portrait",
    summary: "浏览全部 portrait 人像、服饰与镜头导向案例。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-23T10:10:00Z",
    tags: ["Portrait", "Index"],
  }),
  makeTopic({
    id: "topic-community-cases-1-351",
    title: "社区 / 兜底分类索引",
    category: "community",
    summary: "承接暂不属于核心视觉类型、但仍可作为灵感参考的案例。",
    sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery.md",
    curator: "awesome-gpt-image-2",
    createdAt: "2026-04-23T10:20:00Z",
    tags: ["Community", "Index"],
  }),
];

export const galleryTopicSeeds = galleryTopicLibrary.filter((topic) => topic.featured);

const coveredCaseNumbers = Array.from(new Set(galleryTopicLibrary.flatMap((topic) => topic.entries.map((entry) => entry.caseNumber)))).sort((a, b) => a - b);
const coveredCaseNumberSet = new Set(coveredCaseNumbers);
const uncoveredCaseNumbers = examplePromptLibrary
  .map((item) => item.caseNumber)
  .filter((caseNumber) => !coveredCaseNumberSet.has(caseNumber));
const topicEntryCount = galleryTopicLibrary.reduce((sum, topic) => sum + topic.totalEntries, 0);

export const galleryTopicDatasetSummary: GalleryTopicDatasetSummary = {
  dataset: {
    structuredCaseCount: examplePromptDatasetSummary.structuredCaseCount,
    declaredCaseRangeEnd: examplePromptDatasetSummary.declaredCaseRangeEnd,
    missingCaseNumbers: examplePromptDatasetSummary.missingCaseNumbers,
  },
  topics: {
    totalTopicCount: galleryTopicLibrary.length,
    featuredTopicCount: galleryTopicSeeds.length,
  },
  coverage: {
    totalTopicCount: galleryTopicLibrary.length,
    featuredTopicCount: galleryTopicSeeds.length,
    deduplicatedCoveredCaseCount: coveredCaseNumbers.length,
    uncoveredCaseCount: uncoveredCaseNumbers.length,
    uncoveredCaseNumbers,
    topicEntryCount,
    datasetCaseCount: examplePromptLibraryStats.totalCases,
    coverageRatio: examplePromptLibraryStats.totalCases === 0 ? 0 : coveredCaseNumbers.length / examplePromptLibraryStats.totalCases,
  },
};

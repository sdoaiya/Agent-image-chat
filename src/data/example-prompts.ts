import {
  galleryDatasetStats,
  parsedGalleryExampleSeeds,
  type GalleryCategory,
  type GallerySourceType,
  type ParsedGalleryExampleSeed,
} from "@/data/gallery.generated";

export interface ExamplePromptItem {
  id: string;
  title: string;
  category: GalleryCategory;
  author: string;
  language: string;
  createdAt: string;
  sourceUrl: string;
  imageUrl: string;
  width: number;
  height: number;
  prompt: string;
  summary: string;
  tags?: string[];
  caseNumber: number;
  imageAlt: string;
  imagePath: string;
  sourceType: GallerySourceType;
  upstreamDoc: string;
}

export interface ExamplePromptDatasetSummary {
  structuredCaseCount: number;
  declaredCaseRangeEnd: number;
  missingCaseNumbers: number[];
  missingCaseCount: number;
  legacyExpectedCount: number;
  categoryCounts: Record<GalleryCategory, number>;
}

export interface ExamplePromptLibraryStats {
  totalCases: number;
  legacyExpectedCount: number;
  canonicalRangeEnd: number;
  missingCaseNumbers: number[];
  categoryCounts: Record<GalleryCategory, number>;
  visibleCaseCount: number;
  skippedIndexCount: number;
}

function resolveGalleryImageUrl(imageRelativePath: string) {
  if (typeof window !== "undefined" && window.electronAPI) {
    return `gallery-image://${encodeURIComponent(imageRelativePath)}`;
  }

  return new URL(`../../vendor/awesome-gpt-image-2-main/data/images/${imageRelativePath}`, import.meta.url).href;
}

function toExamplePromptItem(seed: ParsedGalleryExampleSeed): ExamplePromptItem {
  return {
    id: seed.id,
    title: seed.title,
    category: seed.category,
    author: seed.sourceLabel,
    language: seed.language,
    createdAt: seed.createdAt,
    sourceUrl: seed.sourceUrl,
    imageUrl: resolveGalleryImageUrl(seed.imageRelativePath),
    width: seed.width,
    height: seed.height,
    prompt: seed.prompt,
    summary: seed.summary,
    tags: seed.tags,
    caseNumber: seed.caseNumber,
    imageAlt: seed.imageAlt,
    imagePath: seed.imageRelativePath,
    sourceType: seed.sourceType,
    upstreamDoc: seed.upstreamDoc,
  };
}

export const examplePromptLibrary: ExamplePromptItem[] = parsedGalleryExampleSeeds.map(toExamplePromptItem);

export const examplePromptDatasetSummary: ExamplePromptDatasetSummary = {
  structuredCaseCount: galleryDatasetStats.parsedCaseCount,
  declaredCaseRangeEnd: galleryDatasetStats.declaredRangeEnd,
  missingCaseNumbers: galleryDatasetStats.missingCaseNumbers,
  missingCaseCount: galleryDatasetStats.missingCaseNumbers.length,
  legacyExpectedCount: galleryDatasetStats.legacyExpectedCount,
  categoryCounts: galleryDatasetStats.categoryCounts,
};

export const examplePromptLibraryStats: ExamplePromptLibraryStats = {
  totalCases: examplePromptDatasetSummary.structuredCaseCount,
  legacyExpectedCount: examplePromptDatasetSummary.legacyExpectedCount,
  canonicalRangeEnd: examplePromptDatasetSummary.declaredCaseRangeEnd,
  missingCaseNumbers: examplePromptDatasetSummary.missingCaseNumbers,
  categoryCounts: examplePromptDatasetSummary.categoryCounts,
  visibleCaseCount: examplePromptDatasetSummary.structuredCaseCount,
  skippedIndexCount: examplePromptDatasetSummary.missingCaseCount,
};

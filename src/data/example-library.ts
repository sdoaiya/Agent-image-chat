import type { ExamplePromptItem } from "@/data/example-prompts";

export type ExampleSourceFilter = "all" | "local" | "youmind";
export type ExampleSortField = "time" | "likes" | "title";
export type ExampleSortOrder = "asc" | "desc";

export interface ExamplePromptLibraryQuery {
  category: ExamplePromptItem["category"] | "all";
  source: ExampleSourceFilter;
  query: string;
  sortField: ExampleSortField;
  sortOrder: ExampleSortOrder;
}

const EMPTY_QUERY: ExamplePromptLibraryQuery = {
  category: "all",
  source: "all",
  query: "",
  sortField: "time",
  sortOrder: "desc",
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim();
}

function normalizeSourceUrl(value: string): string {
  return value.toLowerCase().replace(/#.*$/, "").replace(/[/?]+$/, "");
}

function getPromptDedupeKey(item: ExamplePromptItem): string | null {
  const normalizedPrompt = normalizeText(item.prompt);
  return normalizedPrompt.length >= 32 ? `prompt:${normalizedPrompt}` : null;
}

function getSourceDedupeKey(item: ExamplePromptItem): string | null {
  if (!item.sourceUrl || item.sourceUrl.includes("github.com/")) {
    return null;
  }

  return `source:${normalizeSourceUrl(item.sourceUrl)}`;
}

function getTitleAuthorDedupeKey(item: ExamplePromptItem): string {
  return `title-author:${normalizeText(item.title)}:${normalizeText(item.author)}`;
}

function collectDedupeKeys(item: ExamplePromptItem): string[] {
  return [getPromptDedupeKey(item), getSourceDedupeKey(item), getTitleAuthorDedupeKey(item)].filter((key): key is string => Boolean(key));
}

export function mergeExamplePromptLibraries(localItems: ExamplePromptItem[], upstreamItems: ExamplePromptItem[]): ExamplePromptItem[] {
  const seen = new Set<string>();
  const merged: ExamplePromptItem[] = [...localItems];

  for (const item of localItems) {
    collectDedupeKeys(item).forEach((key) => seen.add(key));
  }

  for (const item of upstreamItems) {
    const keys = collectDedupeKeys(item);
    if (keys.some((key) => seen.has(key))) {
      continue;
    }
    merged.push(item);
    keys.forEach((key) => seen.add(key));
  }

  return merged;
}

function getItemSource(item: ExamplePromptItem): ExampleSourceFilter {
  return item.sourceOrigin === "youmind" ? "youmind" : "local";
}

function matchesQuery(item: ExamplePromptItem, rawQuery: string): boolean {
  const query = normalizeText(rawQuery);
  if (!query) {
    return true;
  }

  const searchable = normalizeText([item.title, item.summary, item.prompt, item.author, item.language, ...(item.tags ?? [])].join("\n"));
  return searchable.includes(query);
}

function getSortValue(item: ExamplePromptItem, sortField: ExampleSortField): number | string {
  switch (sortField) {
    case "likes":
      return item.engagement?.likes ?? 0;
    case "title":
      return item.title;
    case "time":
    default:
      return new Date(item.createdAt).getTime() || 0;
  }
}

function compareExamples(a: ExamplePromptItem, b: ExamplePromptItem, sortField: ExampleSortField, sortOrder: ExampleSortOrder): number {
  const left = getSortValue(a, sortField);
  const right = getSortValue(b, sortField);
  const direction = sortOrder === "asc" ? 1 : -1;

  if (typeof left === "string" || typeof right === "string") {
    return String(left).localeCompare(String(right), "zh-CN", { numeric: true, sensitivity: "base" }) * direction;
  }

  if (left === right) {
    return a.title.localeCompare(b.title, "zh-CN", { numeric: true, sensitivity: "base" });
  }

  return (left - right) * direction;
}

export function filterAndSortExamplePrompts(
  items: ExamplePromptItem[],
  query: Partial<ExamplePromptLibraryQuery> = {},
): ExamplePromptItem[] {
  const normalizedQuery: ExamplePromptLibraryQuery = { ...EMPTY_QUERY, ...query };

  return items
    .filter((item) => normalizedQuery.category === "all" || item.category === normalizedQuery.category)
    .filter((item) => normalizedQuery.source === "all" || getItemSource(item) === normalizedQuery.source)
    .filter((item) => matchesQuery(item, normalizedQuery.query))
    .sort((a, b) => compareExamples(a, b, normalizedQuery.sortField, normalizedQuery.sortOrder));
}

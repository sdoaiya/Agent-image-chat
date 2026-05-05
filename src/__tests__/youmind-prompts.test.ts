import { describe, expect, it } from "vitest";
import type { ExamplePromptItem } from "@/data/example-prompts";
import { filterAndSortExamplePrompts, mergeExamplePromptLibraries } from "@/data/example-library";
import { mapYouMindPromptToExamplePromptItem, type YouMindPromptApiItem } from "@/data/youmind-prompts";

function makeLocalExample(overrides: Partial<ExamplePromptItem> = {}): ExamplePromptItem {
  return {
    id: "gallery-case-001-local",
    title: "本地图鉴示例",
    category: "infographic",
    author: "local curator",
    language: "zh",
    createdAt: "2026-04-01T00:00:00.000Z",
    sourceUrl: "https://example.com/source",
    imageUrl: "gallery-image://case1.jpg",
    width: 1000,
    height: 1500,
    prompt: "A clean infographic prompt with stable local assets.",
    summary: "本地示例摘要",
    tags: ["infographic", "zh"],
    caseNumber: 1,
    imageAlt: "本地图鉴示例",
    imagePath: "case1.jpg",
    sourceType: "text",
    upstreamDoc: "gallery-part-1.md",
    sourceOrigin: "local",
    ...overrides,
  };
}

function makeYouMindPrompt(overrides: Partial<YouMindPromptApiItem> = {}): YouMindPromptApiItem {
  return {
    id: 18126,
    title: "Gothic Necromancer Queen",
    description: "Generates a cinematic dark fantasy portrait.",
    slug: "gothic-necromancer-queen",
    sourceLink: "https://x.com/TGBA2023/status/2051214728551113037#reversed-0",
    sourcePublishedAt: "2026-05-04T08:17:55.000Z",
    author: {
      name: "Tugba",
      link: "https://x.com/TGBA2023",
    },
    content: "Create a dark fantasy full-body portrait of a gothic necromancer queen in a burned forest.",
    media: ["https://cms-assets.youmind.com/media/original.jpg"],
    mediaThumbnails: ["https://cms-assets.youmind.com/media/original-300x450.jpg"],
    language: "en",
    translatedContent: "创建一张哥特死灵女王的黑暗幻想全身肖像。",
    sourcePlatform: "twitter",
    likes: 42,
    resultsCount: 2,
    needReferenceImages: false,
    promptCategories: [],
    ...overrides,
  };
}

describe("YouMind prompt mapping and example merging", () => {
  it("maps an upstream prompt into the local example item shape", () => {
    const item = mapYouMindPromptToExamplePromptItem(makeYouMindPrompt());

    expect(item).toMatchObject({
      id: "youmind-18126",
      title: "Gothic Necromancer Queen",
      category: "portrait",
      author: "@Tugba",
      language: "en",
      imageUrl: "https://cms-assets.youmind.com/media/original-300x450.jpg",
      referenceImageUrl: "https://cms-assets.youmind.com/media/original.jpg",
      width: 300,
      height: 450,
      sourceOrigin: "youmind",
      upstreamDoc: "youmind:gpt-image-2-prompts",
      upstreamId: 18126,
      upstreamPromptUrl: "https://youmind.com/zh-CN/prompts/gothic-necromancer-queen-18126",
      engagement: {
        likes: 42,
        resultsCount: 2,
      },
    });
    expect(item.prompt).toContain("necromancer queen");
    expect(item.tags).toContain("YouMind");
  });

  it("deduplicates upstream prompts against local examples by normalized prompt content", () => {
    const local = makeLocalExample({
      id: "gallery-case-001-local",
      prompt: "Create a dark fantasy full-body portrait of a gothic necromancer queen in a burned forest.",
      imageUrl: "gallery-image://case1.jpg",
    });
    const duplicateRemote = mapYouMindPromptToExamplePromptItem(makeYouMindPrompt());
    const freshRemote = mapYouMindPromptToExamplePromptItem(
      makeYouMindPrompt({
        id: 18127,
        title: "Minimal Blueprint Portfolio",
        slug: "blueprint-portfolio",
        content: "Design a minimal blueprint portfolio homepage with grid annotations.",
        mediaThumbnails: ["https://cms-assets.youmind.com/media/portfolio-300x200.jpg"],
      }),
    );

    const merged = mergeExamplePromptLibraries([local], [duplicateRemote, freshRemote]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(local);
    expect(merged.map((item) => item.id)).toEqual(["gallery-case-001-local", "youmind-18127"]);
  });

  it("filters by category/source/query and sorts with upstream engagement fields", () => {
    const local = makeLocalExample({ id: "local-old", title: "Old Atlas", createdAt: "2026-04-01T00:00:00.000Z" });
    const popularRemote = mapYouMindPromptToExamplePromptItem(makeYouMindPrompt());
    const quietRemote = mapYouMindPromptToExamplePromptItem(
      makeYouMindPrompt({
        id: 18127,
        title: "Quiet Poster",
        slug: "quiet-poster",
        content: "Create a quiet editorial poster.",
        mediaThumbnails: ["https://cms-assets.youmind.com/media/poster-300x450.jpg"],
        likes: 2,
      }),
    );

    const filtered = filterAndSortExamplePrompts([local, popularRemote, quietRemote], {
      category: "all",
      source: "youmind",
      query: "queen",
      sortField: "likes",
      sortOrder: "desc",
    });

    expect(filtered.map((item) => item.id)).toEqual(["youmind-18126"]);
  });
});

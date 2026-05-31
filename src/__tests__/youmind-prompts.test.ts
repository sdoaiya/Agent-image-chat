import { describe, expect, it } from "vitest";
import type { ExamplePromptItem } from "@/data/example-prompts";
import { filterAndSortExamplePrompts, mergeExamplePromptLibraries } from "@/data/example-library";
import {
  mapYouMindPromptToExamplePromptItem,
  parseYouMindPromptReadme,
  type YouMindPromptApiItem,
} from "@/data/youmind-prompts";

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
  it("parses the public README fallback into upstream prompt records", () => {
    const markdown = `
| \u6307\u6807 | \u6570\u91cf |
|--------|-------|
| \ud83d\udcdd \u63d0\u793a\u8bcd\u603b\u6570 | **8273** |

### No. 1: VR \u5934\u663e\u7206\u70b8\u89c6\u56fe\u6d77\u62a5

![Language-EN](https://img.shields.io/badge/Language-EN-blue)
![Featured](https://img.shields.io/badge/%E2%AD%90-Featured-gold)

#### \ud83d\udcd6 \u63cf\u8ff0

\u751f\u6210\u4e00\u5f20\u9ad8\u79d1\u6280 VR \u5934\u663e\u7206\u70b8\u89c6\u56fe\u3002

#### \ud83d\udcdd \u63d0\u793a\u8bcd

\`\`\`
Create a high-tech exploded-view poster for a VR headset.
\`\`\`

#### \ud83d\uddbc\ufe0f \u751f\u6210\u56fe\u7247

<div align="center">
<img src="https://cms-assets.youmind.com/media/vr-headset-300x450.jpg" width="700" alt="VR poster">
</div>

#### \ud83d\udccc \u8be6\u60c5

- **\u4f5c\u8005:** [wory](https://x.com/wory37303852)
- **\u6765\u6e90:** [Twitter Post](https://x.com/wory37303852/status/2045925660401795478)
- **\u53d1\u5e03\u65f6\u95f4:** 2026\u5e744\u670819\u65e5
- **\u591a\u8bed\u8a00:** en

**[\ud83d\udc49 \u7acb\u5373\u5c1d\u8bd5 \u2192](https://youmind.com/zh-CN/gpt-image-2-prompts?id=13460)**

<sub>\ud83e\udd16 \u6b64 README \u81ea\u52a8\u751f\u6210\u3002\u6700\u540e\u66f4\u65b0\uff1a 2026-05-30T13:00:52.579Z</sub>
`;

    const dataset = parseYouMindPromptReadme(markdown);

    expect(dataset.total).toBe(8273);
    expect(dataset.updatedAt).toBe("2026-05-30T13:00:52.579Z");
    expect(dataset.prompts).toHaveLength(1);
    expect(dataset.prompts[0]).toMatchObject({
      id: 13460,
      title: "VR \u5934\u663e\u7206\u70b8\u89c6\u56fe\u6d77\u62a5",
      slug: "prompt-13460",
      sourceLink: "https://x.com/wory37303852/status/2045925660401795478",
      sourcePublishedAt: "2026-04-19T00:00:00.000Z",
      language: "en",
      sourcePlatform: "twitter",
      mediaThumbnails: ["https://cms-assets.youmind.com/media/vr-headset-300x450.jpg"],
    });
    expect(dataset.prompts[0]?.content).toContain("VR headset");
  });

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

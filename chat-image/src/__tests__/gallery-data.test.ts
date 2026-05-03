import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("window", {
  electronAPI: undefined,
});

import { examplePromptDatasetSummary, examplePromptLibrary, examplePromptLibraryStats } from "@/data/example-prompts";
import { galleryTopicDatasetSummary, galleryTopicLibrary, galleryTopicSeeds } from "@/data/gallery-topics";

describe("gallery dataset architecture", () => {
  it("should parse the full local gallery dataset from markdown exports", () => {
    expect(examplePromptLibrary.length).toBe(348);
    expect(examplePromptDatasetSummary.structuredCaseCount).toBe(348);
    expect(examplePromptLibraryStats.totalCases).toBe(348);
    expect(examplePromptDatasetSummary.declaredCaseRangeEnd).toBe(351);
    expect(examplePromptLibraryStats.canonicalRangeEnd).toBe(351);
    expect(examplePromptDatasetSummary.missingCaseNumbers).toEqual([12, 169, 170]);
    expect(examplePromptDatasetSummary.missingCaseCount).toBe(3);
    expect(examplePromptLibraryStats.missingCaseNumbers).toEqual([12, 169, 170]);
    expect(examplePromptLibraryStats.legacyExpectedCount).toBe(346);
  });

  it("should expose stable local image urls and structured metadata", () => {
    const first = examplePromptLibrary[0]!;
    expect(first).toMatchObject({
      caseNumber: 1,
      title: "信息图可视化设计",
      imagePath: "case1.jpg",
      upstreamDoc: "gallery-part-1.md",
    });
    expect(first.imageUrl).toContain("vendor/awesome-gpt-image-2-main/data/images/case1.jpg");
    expect(first.prompt.length).toBeGreaterThan(20);
    expect(first.width).toBeGreaterThan(0);
    expect(first.height).toBeGreaterThan(0);
  });

  it("should resolve gallery images through the Electron-safe protocol when desktop bridge is present", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {
      electronAPI: {
        getBackendPort: vi.fn(),
      },
    });

    const { examplePromptLibrary: electronLibrary } = await import("@/data/example-prompts");
    expect(electronLibrary[0]?.imageUrl).toBe("gallery-image://case1.jpg");

    vi.unstubAllGlobals();
    vi.stubGlobal("window", {
      electronAPI: undefined,
    });
  });

  it("should preserve compatibility fields used by ExampleGallery and workbench", () => {
    const sample = examplePromptLibrary[10]!;
    expect(typeof sample.id).toBe("string");
    expect(typeof sample.author).toBe("string");
    expect(typeof sample.sourceUrl).toBe("string");
    expect(typeof sample.imageUrl).toBe("string");
    expect(typeof sample.summary).toBe("string");
    expect(Array.isArray(sample.tags)).toBe(true);
  });

  it("should build topic collections from the structured dataset", () => {
    expect(galleryTopicSeeds.length).toBeGreaterThan(0);
    expect(galleryTopicLibrary.length).toBe(galleryTopicDatasetSummary.topics.totalTopicCount);
    expect(galleryTopicDatasetSummary.dataset.structuredCaseCount).toBe(examplePromptLibrary.length);
    expect(galleryTopicDatasetSummary.coverage.datasetCaseCount).toBe(examplePromptLibrary.length);
    expect(galleryTopicDatasetSummary.coverage.topicEntryCount).toBeGreaterThan(galleryTopicDatasetSummary.coverage.deduplicatedCoveredCaseCount);
    expect(galleryTopicDatasetSummary.coverage.deduplicatedCoveredCaseCount).toBe(247);
    expect(galleryTopicDatasetSummary.coverage.uncoveredCaseCount).toBe(101);
    expect(galleryTopicDatasetSummary.coverage.uncoveredCaseNumbers.length).toBe(101);
    expect(galleryTopicDatasetSummary.coverage.coverageRatio).toBeCloseTo(247 / 348, 5);

    for (const topic of galleryTopicLibrary) {
      expect(topic.entries.length).toBe(topic.totalEntries);
      expect(topic.coverImageUrl).toBe(topic.entries[0]?.imageUrl);
      expect(topic.entries.every((entry) => entry.category === topic.category)).toBe(true);
    }
  });
});

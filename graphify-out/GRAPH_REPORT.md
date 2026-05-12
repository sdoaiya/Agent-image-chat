# Graph Report - .  (2026-05-12)

## Corpus Check
- 90 files · ~4,942,656 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 540 nodes · 822 edges · 80 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]

## God Nodes (most connected - your core abstractions)
1. `Config` - 22 edges
2. `save()` - 14 edges
3. `normalizeProvider()` - 13 edges
4. `handleSubmit()` - 13 edges
5. `OpenAIClient` - 10 edges
6. `main()` - 10 edges
7. `mapYouMindPromptToExamplePromptItem()` - 10 edges
8. `startBackend()` - 9 edges
9. `migrateLegacyOverrideMap()` - 8 edges
10. `main()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `relativeOutput()` --calls--> `relative()`  [INFERRED]
  scripts\run-gallery-workbench-e2e.mjs → scripts\test-packaged-persistence.mjs
- `isInsideDirectory()` --calls--> `relative()`  [INFERRED]
  electron\gallery-image.ts → scripts\test-packaged-persistence.mjs
- `getBackendPort()` --calls--> `resolveElectronBaseURL()`  [INFERRED]
  electron\go-process.ts → src\lib\request.ts
- `main()` --calls--> `relative()`  [INFERRED]
  scripts\inspect-packaged-settings.mjs → scripts\test-packaged-persistence.mjs
- `fileFromImage()` --calls--> `makePromptFiles()`  [INFERRED]
  src\app\canvas\image-card.tsx → src\app\canvas\page.tsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (30): apiKeyForProviderLocked(), AppConfig, applyOverrideMap(), Capabilities, ChatGPTConfig, collectLegacyAvailableModels(), Config, decodeDefaultTemplate() (+22 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (28): ImageData, ImageGenerationResponse, OpenAIClient, providerAttempt, providerFailure, acquireUpstreamRequestSlot(), buildOpenRouterPrompt(), cleanUpstreamResponseBytes() (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (22): generateImages(), providerFallbackError, UpstreamAPIError, main(), walk(), buildPartialGenerationMessage(), buildPromptForReferenceImages(), copyError() (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (3): assertConfigSchemaOmitsLegacyFields(), TestBuildConfigPayloadUsesSingleModelSchema(), TestHandleUpdateConfigAcceptsLegacyInputButRespondsWithNewSchema()

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (23): fetchYouMindPromptLibrarySnapshot(), getBrowserYouMindPromptTransport(), getElectronYouMindPromptTransport(), getPromptCacheStore(), getYouMindPromptTransport(), hasDisplayableItems(), loadYouMindPromptCache(), mergeIncrementalSnapshotWithCache() (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (18): extractAvailableModels(), getSettings(), healthCheck(), listModels(), normalizeModelState(), normalizeModelValue(), uniqueModels(), updateSettings() (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.27
Nodes (18): canReuseExternalBackend(), findAvailablePort(), getBackendBinaryName(), getBackendDataRoot(), getBackendHost(), getBackendPath(), getBackendPort(), getBackendResourceRoot() (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (14): extractGalleryImageRelativePath(), getGalleryImageContentType(), isInsideDirectory(), resolveGalleryImageFilePath(), assertFetchableImageUrl(), createWindow(), normalizeYouMindPromptsPayload(), readLimitedResponseBytes() (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.24
Nodes (8): configUpdatePayload, Server, bearerFromRequest(), parseKeys(), requestIDFrom(), writeError(), writeJSON(), writeUpstreamError()

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (10): addFiles(), buildPromptWithAspectInstruction(), buildPromptWithNegativePrompt(), getAspectInstruction(), handleFileChange(), handleKeyDown(), handlePaste(), handlePrimaryAction() (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.28
Nodes (14): chooseModel(), closePackaged(), ensureDir(), exists(), findAvailablePort(), getComboboxTexts(), launchPackaged(), main() (+6 more)

### Community 11 - "Community 11"
Cohesion: 0.27
Nodes (14): canReach(), delay(), getBaseURL(), getReadableErrorMessage(), getRequestErrorMessage(), humanizeMessage(), isHttpUrl(), isLikelyDevServerOrigin() (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.25
Nodes (9): ImageHandler, buildPartialBatchFailureMessage(), extractPromptFromResponsesInput(), generateImagesInBatches(), generateShortID(), normalizeImageSize(), normalizeImageSizeAndUpscale(), resolveAspectRatioPixelSize() (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (11): ensureDir(), ensureViteServer(), expectCondition(), main(), relativeOutput(), runStep(), saveJson(), saveMarkdown() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.27
Nodes (10): collectDedupeKeys(), compareExamples(), getPromptDedupeKey(), getSortValue(), getSourceDedupeKey(), getTitleAuthorDedupeKey(), matchesQuery(), mergeExamplePromptLibraries() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.28
Nodes (11): deriveModelState(), getProviderDefaults(), getQualityOptionsByApiMode(), mergeModelPools(), normalizeDefaultModel(), normalizeModelValue(), normalizeProvider(), normalizeProviderApiKeys() (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.2
Nodes (2): buildSummary(), truncate()

### Community 17 - "Community 17"
Cohesion: 0.27
Nodes (6): fetchExampleImageBlob(), getCompactImageFrameStyle(), getImageFrameStyle(), inferImageMimeType(), shouldUseElectronImageFetch(), toAttachedPromptFile()

### Community 18 - "Community 18"
Cohesion: 0.36
Nodes (8): buildPoWConfig(), bytesLE(), easternTimeLabel(), formatBrowserParseTime(), formatGMTOffset(), generateRequirementsToken(), getBrowserParseTime(), solvePoW()

### Community 19 - "Community 19"
Cohesion: 0.31
Nodes (7): bufferedConn, bindConnToContext(), buildConnectRequest(), dialHTTPProxyTunnel(), NewHTTPTransport(), newSOCKSContextDialer(), NewTunnelDialContext()

### Community 20 - "Community 20"
Cohesion: 0.31
Nodes (5): downloadImage(), estimateBytes(), fileFromImage(), imageSrc(), normalizeBase64Image()

### Community 21 - "Community 21"
Cohesion: 0.2
Nodes (4): ThemeAndToaster(), YouMindBackgroundSync(), useTheme(), useYouMindPromptSync()

### Community 22 - "Community 22"
Cohesion: 0.46
Nodes (7): corsMiddleware(), envInt(), envString(), isAddressInUseError(), main(), resolveDataDir(), resolveResourceDir()

### Community 23 - "Community 23"
Cohesion: 0.54
Nodes (7): ensureDir(), exists(), main(), relative(), resolveExePath(), wait(), waitForEndpoint()

### Community 24 - "Community 24"
Cohesion: 0.4
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 0.6
Nodes (3): cancelRename(), commitRename(), handleRenameKeyDown()

### Community 26 - "Community 26"
Cohesion: 0.4
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (2): resolveGalleryImageUrl(), toExamplePromptItem()

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (2): getCategoryExamples(), makeTopic()

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 0.67
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **10 isolated node(s):** `ImageGenerationResponse`, `ImageData`, `providerAttempt`, `providerFailure`, `configUpdatePayload` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 34`** (2 nodes): `workbench-layout.tsx`, `WorkbenchLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `ExamplesPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `SettingsPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `Badge()`, `badge.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `cn()`, `dialog.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `tasks.ts`, `taskKey()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `createTurn()`, `conversations.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `clickActionByIndex()`, `example-import-flow.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `youmind-hook.test.tsx`, `makeSnapshot()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `codex_client.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `build-electron.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `dev.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `edit-modal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `page.generate-chain.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `main-navigation.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `button.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `card.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `input.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `select.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `textarea.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `gallery.generated.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `example-import.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `electron.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `image-workflow.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `api-request-layer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `app-routing.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `canvas-titlebar-drag.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `conversations-load.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `electron-packaging-config.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `example-gallery.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `examples-page.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `gallery-data.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `gallery-image-runtime.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `image-card-detail.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `model-config-normalization.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `prompt-bar-import.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `request-auth.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `request-helpers.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `request-origin-resolution.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `settings-drawer-regressions.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `settings-quality-normalization.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `settings-save-chain.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `relative()` connect `Community 10` to `Community 2`, `Community 13`, `Community 7`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 2` to `Community 10`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `handleSubmit()` connect `Community 2` to `Community 11`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `save()` (e.g. with `updateSettings()` and `withTimeout()`) actually correct?**
  _`save()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `handleSubmit()` (e.g. with `generateId()` and `.Error()`) actually correct?**
  _`handleSubmit()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ImageGenerationResponse`, `ImageData`, `providerAttempt` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
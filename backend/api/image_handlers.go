package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gimg/internal/config"
)

type ImageHandler struct {
	cfg *config.Config
}

const maxUpstreamImageBatchSize = 1
const maxUpstreamImageLongEdge = 3840

func buildPartialBatchFailureMessage(successCount, totalCount int, err error) string {
	return fmt.Sprintf("已成功生成 %d/%d 张，其余未完成：%s", successCount, totalCount, err.Error())
}

func NewImageHandler(cfg *config.Config) *ImageHandler {
	return &ImageHandler{
		cfg: cfg,
	}
}

func (h *ImageHandler) HandleImageGenerations(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFrom(r)
	var req struct {
		Model           string   `json:"model"`
		Prompt          string   `json:"prompt"`
		N               int      `json:"n"`
		Size            string   `json:"size"`
		Quality         string   `json:"quality"`
		Style           string   `json:"style"`
		Upscale         string   `json:"upscale"`
		Background      string   `json:"background"`
		ResponseFormat  string   `json:"response_format"`
		ReferenceImages []string `json:"reference_images"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "invalid request body", requestID, nil)
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "prompt is required", requestID, nil)
		return
	}
	if req.N < 1 {
		req.N = 1
	}
	if req.ResponseFormat == "" {
		req.ResponseFormat = "url"
	}
	req.Size, req.Upscale = normalizeImageSizeAndUpscale(req.Size, req.Upscale)

	model := config.NormalizeImageModel(req.Model)
	if model == "" {
		model = h.cfg.GetModel()
	}
	referenceImages := make([][]byte, 0, len(req.ReferenceImages))
	for _, rawImage := range req.ReferenceImages {
		imgData, err := decodeBase64Image(rawImage)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request_error", "invalid base64 reference_images", requestID, nil)
			return
		}
		referenceImages = append(referenceImages, imgData)
	}

	log.Printf("[image-generations] request_id=%s model=%s size=%s response_format=%s n=%d reference_count=%d", requestID, model, req.Size, req.ResponseFormat, req.N, len(referenceImages))
	result, err := generateImagesInBatches(r.Context(), NewOpenAIClient(h.cfg), req.Prompt, model, req.N, req.Size, req.Quality, req.Style, req.Upscale, req.Background, req.ResponseFormat, referenceImages)
	if err != nil {
		log.Printf("[image-generations] request_id=%s model=%s size=%s response_format=%s error=%v", requestID, model, req.Size, req.ResponseFormat, err)
		writeUpstreamError(w, err, requestID, "image generation")
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func normalizeImageSizeAndUpscale(size, upscale string) (string, string) {
	if ratioSize, ok := resolveAspectRatioPixelSize(size, upscale); ok {
		return ratioSize, ""
	}
	return normalizeImageSize(size), strings.TrimSpace(upscale)
}

func normalizeImageSize(size string) string {
	size = strings.TrimSpace(size)
	if size == "" {
		return ""
	}
	parts := strings.Split(size, "x")
	if len(parts) != 2 {
		return size
	}
	width, widthErr := strconv.Atoi(strings.TrimSpace(parts[0]))
	height, heightErr := strconv.Atoi(strings.TrimSpace(parts[1]))
	if widthErr != nil || heightErr != nil || width <= 0 || height <= 0 {
		return size
	}
	longEdge := max(width, height)
	if longEdge <= maxUpstreamImageLongEdge {
		return fmt.Sprintf("%dx%d", width, height)
	}
	scale := float64(maxUpstreamImageLongEdge) / float64(longEdge)
	return fmt.Sprintf("%dx%d", roundToImageGranularity(float64(width)*scale), roundToImageGranularity(float64(height)*scale))
}

func resolveAspectRatioPixelSize(size, upscale string) (string, bool) {
	longEdge := 0
	switch strings.ToLower(strings.TrimSpace(upscale)) {
	case "2k":
		longEdge = 2048
	case "4k":
		longEdge = maxUpstreamImageLongEdge
	default:
		return "", false
	}

	parts := strings.Split(strings.TrimSpace(size), ":")
	if len(parts) != 2 {
		return "", false
	}
	widthRatio, widthErr := strconv.Atoi(strings.TrimSpace(parts[0]))
	heightRatio, heightErr := strconv.Atoi(strings.TrimSpace(parts[1]))
	if widthErr != nil || heightErr != nil || widthRatio <= 0 || heightRatio <= 0 {
		return "", false
	}
	if widthRatio >= heightRatio {
		return fmt.Sprintf("%dx%d", longEdge, roundToImageGranularity(float64(longEdge)*float64(heightRatio)/float64(widthRatio))), true
	}
	return fmt.Sprintf("%dx%d", roundToImageGranularity(float64(longEdge)*float64(widthRatio)/float64(heightRatio)), longEdge), true
}

func roundToImageGranularity(value float64) int {
	rounded := int(math.Round(value/8) * 8)
	if rounded < 8 {
		return 8
	}
	if rounded > maxUpstreamImageLongEdge {
		return maxUpstreamImageLongEdge
	}
	return rounded
}

func generateImagesInBatches(ctx context.Context, client *OpenAIClient, prompt, model string, n int, size, quality, style, upscale, background, responseFormat string, referenceImages [][]byte) (*ImageGenerationResponse, error) {
	if n <= maxUpstreamImageBatchSize {
		return client.GenerateImages(ctx, prompt, model, n, size, quality, style, upscale, background, responseFormat, referenceImages)
	}

	total := n
	remaining := n
	result := &ImageGenerationResponse{
		Data: make([]ImageData, 0, n),
	}
	capabilityNotes := make([]string, 0)

	for remaining > 0 {
		batchSize := maxUpstreamImageBatchSize
		if remaining < batchSize {
			batchSize = remaining
		}

		batchResult, err := client.GenerateImages(ctx, prompt, model, batchSize, size, quality, style, upscale, background, responseFormat, referenceImages)
		if err != nil {
			if len(result.Data) > 0 {
				capabilityNotes = append(capabilityNotes, buildPartialBatchFailureMessage(len(result.Data), total, err))
				break
			}
			return nil, err
		}
		if result.Created == 0 {
			result.Created = batchResult.Created
		}
		if result.Provider == "" {
			result.Provider = batchResult.Provider
		}
		if result.Source == "" {
			result.Source = batchResult.Source
		}
		result.Data = append(result.Data, batchResult.Data...)
		if batchResult.CapabilityNote != "" {
			capabilityNotes = append(capabilityNotes, batchResult.CapabilityNote)
		}

		remaining -= batchSize
	}

	if len(capabilityNotes) > 0 {
		result.CapabilityNote = strings.Join(capabilityNotes, "\n")
	}
	return result, nil
}

func (h *ImageHandler) HandleChatCompletions(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFrom(r)
	var req struct {
		Model    string `json:"model"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
		Stream bool `json:"stream"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "invalid request body", requestID, nil)
		return
	}

	var prompt string
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Content != "" {
			prompt = req.Messages[i].Content
			break
		}
	}
	if prompt == "" {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "no prompt found in messages", requestID, nil)
		return
	}

	model := config.NormalizeImageModel(req.Model)
	if model == "" {
		model = h.cfg.GetModel()
	}

	result, err := NewOpenAIClient(h.cfg).GenerateImages(r.Context(), prompt, model, 1, "", "", "", "", "", "b64_json", nil)
	if err != nil {
		log.Printf("[chat-completions] request_id=%s model=%s error=%v", requestID, model, err)
		writeUpstreamError(w, err, requestID, "chat completions")
		return
	}

	var content string
	if len(result.Data) > 0 {
		content = result.Data[0].URL
		if content == "" {
			content = result.Data[0].B64JSON
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":      fmt.Sprintf("chatcmpl-%s", generateShortID()),
		"object":  "chat.completion",
		"created": time.Now().Unix(),
		"model":   model,
		"choices": []map[string]any{
			{
				"index": 0,
				"message": map[string]any{
					"role":    "assistant",
					"content": content,
				},
				"finish_reason": "stop",
			},
		},
		"usage": map[string]any{
			"prompt_tokens":     0,
			"completion_tokens": 0,
			"total_tokens":      0,
		},
	})
}

func (h *ImageHandler) HandleResponses(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFrom(r)
	var req struct {
		Model  string `json:"model"`
		Input  any    `json:"input"`
		Stream bool   `json:"stream"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "invalid request body", requestID, nil)
		return
	}

	prompt := extractPromptFromResponsesInput(req.Input)
	if prompt == "" {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "no prompt found in input", requestID, nil)
		return
	}

	model := config.NormalizeImageModel(req.Model)
	if model == "" {
		model = h.cfg.GetModel()
	}

	result, err := NewOpenAIClient(h.cfg).GenerateImages(r.Context(), prompt, model, 1, "", "", "", "", "", "b64_json", nil)
	if err != nil {
		log.Printf("[responses] request_id=%s model=%s error=%v", requestID, model, err)
		writeUpstreamError(w, err, requestID, "responses")
		return
	}

	var imageURL string
	var imageB64 string
	if len(result.Data) > 0 {
		imageURL = result.Data[0].URL
		imageB64 = result.Data[0].B64JSON
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":      fmt.Sprintf("resp-%s", generateShortID()),
		"object":  "response",
		"created": time.Now().Unix(),
		"model":   model,
		"output": []map[string]any{
			{
				"type": "image_generation_call",
				"result": func() string {
					if imageB64 != "" {
						return imageB64
					}
					return imageURL
				}(),
			},
		},
	})
}

func extractPromptFromResponsesInput(input any) string {
	switch v := input.(type) {
	case string:
		return strings.TrimSpace(v)
	case []any:
		for _, item := range v {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			role, _ := m["role"].(string)
			if role != "user" {
				continue
			}
			if content, ok := m["content"].(string); ok {
				if trimmed := strings.TrimSpace(content); trimmed != "" {
					return trimmed
				}
			}
			if contentArr, ok := m["content"].([]any); ok {
				for _, ce := range contentArr {
					if cm, ok := ce.(map[string]any); ok {
						if text, ok := cm["text"].(string); ok {
							if trimmed := strings.TrimSpace(text); trimmed != "" {
								return trimmed
							}
						}
					}
				}
			}
		}
	}
	return ""
}

func generateShortID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

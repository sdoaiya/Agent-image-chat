package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"gimg/internal/config"
)

type ImageHandler struct {
	cfg    *config.Config
	client *OpenAIClient
}

func NewImageHandler(cfg *config.Config) *ImageHandler {
	return &ImageHandler{
		cfg:    cfg,
		client: NewOpenAIClient(cfg),
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

	model := config.NormalizeImageModel(req.Model)
	if model == "" {
		model = h.cfg.GetModel()
	}

	log.Printf("[image-generations] request_id=%s model=%s size=%s response_format=%s n=%d reference_images=%d", requestID, model, req.Size, req.ResponseFormat, req.N, len(req.ReferenceImages))

	result, err := h.client.GenerateImages(
		r.Context(),
		req.Prompt,
		model,
		req.N,
		req.Size,
		req.Quality,
		req.Background,
		req.ResponseFormat,
		req.ReferenceImages,
	)
	if err != nil {
		log.Printf("[image-generations] request_id=%s model=%s size=%s response_format=%s error=%v", requestID, model, req.Size, req.ResponseFormat, err)
		writeUpstreamError(w, err, requestID, "image generation")
		return
	}

	writeJSON(w, http.StatusOK, result)
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

	prompt := extractPromptFromMessages(req.Messages)
	if prompt == "" {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "no prompt found in messages", requestID, nil)
		return
	}

	model := config.NormalizeImageModel(req.Model)
	if model == "" {
		model = h.cfg.GetModel()
	}

	result, err := h.client.GenerateImages(r.Context(), prompt, model, 1, "", "", "", "b64_json", nil)
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

	prompt := extractPromptFromInput(req.Input)
	if prompt == "" {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "no prompt found in input", requestID, nil)
		return
	}

	model := config.NormalizeImageModel(req.Model)
	if model == "" {
		model = h.cfg.GetModel()
	}

	result, err := h.client.GenerateImages(r.Context(), prompt, model, 1, "", "", "", "b64_json", nil)
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

func extractPromptFromMessages(messages []struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Content != "" {
			return messages[i].Content
		}
	}
	return ""
}

func extractPromptFromInput(input any) string {
	switch v := input.(type) {
	case string:
		return v
	case []any:
		for _, item := range v {
			message, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if role, _ := message["role"].(string); role != "user" {
				continue
			}
			if content, ok := message["content"].(string); ok && content != "" {
				return content
			}
			contentArr, ok := message["content"].([]any)
			if !ok {
				continue
			}
			for _, entry := range contentArr {
				contentMap, ok := entry.(map[string]any)
				if !ok {
					continue
				}
				if text, ok := contentMap["text"].(string); ok && text != "" {
					return text
				}
			}
		}
	}
	return ""
}

func generateShortID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

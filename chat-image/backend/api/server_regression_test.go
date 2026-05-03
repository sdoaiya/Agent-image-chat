package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"gimg/internal/config"
)

func TestBuildConfigPayloadUsesSingleModelSchema(t *testing.T) {
	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.AuthKey = "auth-test"
	cfg.App.BaseURL = config.DefaultBaseURL
	cfg.App.ImageFormat = "url"
	cfg.Server.Host = "0.0.0.0"
	cfg.Server.Port = 8080
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.SSETimeout = 300
	cfg.ChatGPT.RequestTimeout = 30

	server := NewServer(cfg)
	payload := server.buildConfigPayload()

	app, ok := payload["app"].(map[string]any)
	if !ok {
		t.Fatalf("app payload type = %T", payload["app"])
	}
	chatgpt, ok := payload["chatgpt"].(map[string]any)
	if !ok {
		t.Fatalf("chatgpt payload type = %T", payload["chatgpt"])
	}

	if got := app["apiMode"]; got != "codesonline" {
		t.Fatalf("apiMode = %v, want codesonline", got)
	}
	if got := app["baseUrl"]; got != config.DefaultBaseURL {
		t.Fatalf("baseUrl = %v, want %s", got, config.DefaultBaseURL)
	}
	if _, exists := app["accountId"]; exists {
		t.Fatalf("accountId should not be exposed in new schema")
	}
	if got := chatgpt["model"]; got != config.DefaultImageModel {
		t.Fatalf("model = %v, want %s", got, config.DefaultImageModel)
	}
	if _, exists := chatgpt["freeImageRoute"]; exists {
		t.Fatalf("freeImageRoute should not exist in new schema")
	}
	if _, exists := chatgpt["paidImageRoute"]; exists {
		t.Fatalf("paidImageRoute should not exist in new schema")
	}
	if _, exists := chatgpt["freeImageModel"]; exists {
		t.Fatalf("freeImageModel should not exist in new schema")
	}
	if _, exists := chatgpt["paidImageModel"]; exists {
		t.Fatalf("paidImageModel should not exist in new schema")
	}
}

func TestHandleUpdateConfigAcceptsLegacyInputButRespondsWithNewSchema(t *testing.T) {
	cfg := config.New()
	configPath := filepath.Join(t.TempDir(), "config.toml")
	cfg.SetConfigFilePath(configPath)
	cfg.App.BaseURL = config.DefaultBaseURL
	cfg.App.ImageFormat = "url"
	cfg.Server.Host = "0.0.0.0"
	cfg.Server.Port = 8080
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.SSETimeout = 300
	cfg.ChatGPT.RequestTimeout = 30

	server := NewServer(cfg)
	body := map[string]any{
		"app": map[string]any{
			"apiMode":     "openai",
			"apiKey":      "sk-updated",
			"baseUrl":     "https://api.openai.com",
			"accountId":   "legacy-account",
			"imageFormat": "url",
			"authKey":     "auth-updated",
		},
		"server": map[string]any{
			"host": "0.0.0.0",
			"port": 8080,
		},
		"chatgpt": map[string]any{
			"model":          "gpt-image-2",
			"sseTimeout":     300,
			"requestTimeout": 30,
			"freeImageRoute": "/v1/images/generations",
			"paidImageRoute": "/v1/images/generations",
			"freeImageModel": "gpt-image-2",
			"paidImageModel": "gpt-image-2",
		},
		"proxy": map[string]any{
			"enabled": false,
			"url":     "",
			"mode":    "fixed",
		},
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPut, "/api/config", bytes.NewReader(encoded))
	rec := httptest.NewRecorder()
	server.HandleUpdateConfig(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if _, exists := resp["status"]; exists {
		t.Fatalf("response should not use legacy status wrapper")
	}
	if _, exists := resp["config"]; exists {
		t.Fatalf("response should not use legacy config wrapper")
	}

	app := resp["app"].(map[string]any)
	chatgpt := resp["chatgpt"].(map[string]any)
	if got := app["apiMode"]; got != "codesonline" {
		t.Fatalf("apiMode = %v, want codesonline", got)
	}
	if got := app["baseUrl"]; got != config.DefaultBaseURL {
		t.Fatalf("baseUrl = %v, want %s", got, config.DefaultBaseURL)
	}
	if _, exists := app["accountId"]; exists {
		t.Fatalf("accountId should not be returned")
	}
	if got := chatgpt["model"]; got != config.DefaultImageModel {
		t.Fatalf("model = %v, want %s", got, config.DefaultImageModel)
	}
	if _, exists := chatgpt["freeImageRoute"]; exists {
		t.Fatalf("freeImageRoute should not be returned")
	}
	if _, exists := chatgpt["paidImageRoute"]; exists {
		t.Fatalf("paidImageRoute should not be returned")
	}
	if _, exists := chatgpt["freeImageModel"]; exists {
		t.Fatalf("freeImageModel should not be returned")
	}
	if _, exists := chatgpt["paidImageModel"]; exists {
		t.Fatalf("paidImageModel should not be returned")
	}
}

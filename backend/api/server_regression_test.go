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
	proxy, ok := payload["proxy"].(map[string]any)
	if !ok {
		t.Fatalf("proxy payload type = %T", payload["proxy"])
	}

	if got := app["baseUrl"]; got != config.DefaultBaseURL {
		t.Fatalf("baseUrl = %v, want %s", got, config.DefaultBaseURL)
	}
	assertConfigSchemaOmitsLegacyFields(t, app, chatgpt, proxy)
	if got := chatgpt["model"]; got != config.DefaultImageModel {
		t.Fatalf("model = %v, want %s", got, config.DefaultImageModel)
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
	proxy := resp["proxy"].(map[string]any)
	if got := app["baseUrl"]; got != config.DefaultBaseURL {
		t.Fatalf("baseUrl = %v, want %s", got, config.DefaultBaseURL)
	}
	if got := chatgpt["model"]; got != config.DefaultImageModel {
		t.Fatalf("model = %v, want %s", got, config.DefaultImageModel)
	}
	assertConfigSchemaOmitsLegacyFields(t, app, chatgpt, proxy)
}

func assertConfigSchemaOmitsLegacyFields(t *testing.T, app, chatgpt, proxy map[string]any) {
	t.Helper()

	if _, exists := app["apiMode"]; exists {
		t.Fatalf("apiMode should not be exposed")
	}
	if _, exists := app["accountId"]; exists {
		t.Fatalf("accountId should not be exposed")
	}
	for _, key := range []string{"migrationNote", "freeImageRoute", "paidImageRoute", "freeImageModel", "paidImageModel"} {
		if _, exists := chatgpt[key]; exists {
			t.Fatalf("%s should not be exposed", key)
		}
	}
	if _, exists := proxy["mode"]; exists {
		t.Fatalf("proxy.mode should not be exposed")
	}
}

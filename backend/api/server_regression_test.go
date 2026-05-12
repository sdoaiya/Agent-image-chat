package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/BurntSushi/toml"

	"gimg/internal/config"
)

func TestBuildConfigPayloadUsesSingleModelSchema(t *testing.T) {
	cfg := config.New()
	cfg.App.Provider = config.ProviderCodesOnline
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
	if got := app["provider"]; got != config.ProviderCodesOnline {
		t.Fatalf("provider = %v, want %s", got, config.ProviderCodesOnline)
	}
	assertConfigSchemaOmitsLegacyFields(t, app, chatgpt, proxy)
	if got := chatgpt["model"]; got != config.DefaultImageModel {
		t.Fatalf("model = %v, want %s", got, config.DefaultImageModel)
	}
	if got := chatgpt["requestTimeout"]; got != config.DefaultRequestTimeout {
		t.Fatalf("requestTimeout = %v, want %d", got, config.DefaultRequestTimeout)
	}
}

func TestRequireAuthUsesRuntimeAuthKey(t *testing.T) {
	t.Setenv("GIMG_AUTH_KEY", "runtime-auth")
	cfg := config.New()
	cfg.App.AuthKey = ""
	cfg.App.APIKey = "sk-user-upstream"
	server := NewServer(cfg)
	protected := server.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}))

	unauthorizedReq := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	unauthorizedRec := httptest.NewRecorder()
	protected.ServeHTTP(unauthorizedRec, unauthorizedReq)
	if unauthorizedRec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d, want %d", unauthorizedRec.Code, http.StatusUnauthorized)
	}

	apiKeyReq := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	apiKeyReq.Header.Set("Authorization", "Bearer sk-user-upstream")
	apiKeyRec := httptest.NewRecorder()
	protected.ServeHTTP(apiKeyRec, apiKeyReq)
	if apiKeyRec.Code != http.StatusUnauthorized {
		t.Fatalf("api key auth status = %d, want %d", apiKeyRec.Code, http.StatusUnauthorized)
	}

	authorizedReq := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	authorizedReq.Header.Set("Authorization", "Bearer runtime-auth")
	authorizedRec := httptest.NewRecorder()
	protected.ServeHTTP(authorizedRec, authorizedReq)
	if authorizedRec.Code != http.StatusOK {
		t.Fatalf("authorized status = %d, want %d", authorizedRec.Code, http.StatusOK)
	}
}

func TestRequireAuthIgnoresPersistedLocalAuthKeyWithoutRuntimeAuth(t *testing.T) {
	t.Setenv("GIMG_AUTH_KEY", "")
	cfg := config.New()
	cfg.App.AuthKey = "legacy-local-auth"
	server := NewServer(cfg)
	protected := server.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	rec := httptest.NewRecorder()
	protected.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
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
			"provider":    "openrouter",
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
	if got := app["provider"]; got != config.ProviderOpenRouter {
		t.Fatalf("provider = %v, want %s", got, config.ProviderOpenRouter)
	}
	if got := app["baseUrl"]; got != config.OpenRouterBaseURL {
		t.Fatalf("baseUrl = %v, want %s", got, config.OpenRouterBaseURL)
	}
	if got := chatgpt["model"]; got != config.DefaultImageModel {
		t.Fatalf("model = %v, want %s", got, config.DefaultImageModel)
	}
	if got := chatgpt["requestTimeout"]; got != float64(config.DefaultRequestTimeout) {
		t.Fatalf("requestTimeout = %v, want %d", got, config.DefaultRequestTimeout)
	}
	assertConfigSchemaOmitsLegacyFields(t, app, chatgpt, proxy)
}

func TestHandleUpdateConfigPersistsNormalizedConfig(t *testing.T) {
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
			"provider": "openrouter",
			"apiMode":  "openai",
			"apiKey":   "sk-persisted",
			"providerApiKeys": map[string]string{
				"openrouter": "sk-openrouter",
				"blt":        "sk-blt",
			},
			"baseUrl":     "https://api.openai.com",
			"accountId":   "legacy-account",
			"imageFormat": "url",
			"authKey":     "auth-persisted",
		},
		"server": map[string]any{
			"host": "0.0.0.0",
			"port": 8080,
		},
		"chatgpt": map[string]any{
			"model":          "gpt-5.4-mini",
			"sseTimeout":     300,
			"requestTimeout": 30,
			"freeImageRoute": "/v1/images/generations",
			"paidImageRoute": "/v1/images/generations",
			"freeImageModel": "gpt-5.4-mini",
			"paidImageModel": "gpt-5.4-mini",
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

	var raw map[string]any
	if _, err := toml.DecodeFile(configPath, &raw); err != nil {
		t.Fatalf("decode persisted config: %v", err)
	}
	app := raw["app"].(map[string]any)
	chatgpt := raw["chatgpt"].(map[string]any)
	proxy := raw["proxy"].(map[string]any)

	if got := app["api_key"]; got != "sk-persisted" {
		t.Fatalf("persisted api_key = %v, want sk-persisted", got)
	}
	providerKeys := app["provider_api_keys"].(map[string]any)
	if got := providerKeys[config.ProviderOpenRouter]; got != "sk-openrouter" {
		t.Fatalf("persisted openrouter provider key = %v, want sk-openrouter", got)
	}
	if got := providerKeys[config.ProviderBLT]; got != "sk-blt" {
		t.Fatalf("persisted blt provider key = %v, want sk-blt", got)
	}
	if got := app["provider"]; got != config.ProviderOpenRouter {
		t.Fatalf("persisted provider = %v, want %s", got, config.ProviderOpenRouter)
	}
	if got := app["base_url"]; got != config.OpenRouterBaseURL {
		t.Fatalf("persisted base_url = %v, want %s", got, config.OpenRouterBaseURL)
	}
	if got := app["auth_key"]; got != "" {
		t.Fatalf("persisted auth_key = %v, want empty local auth key", got)
	}
	if got := chatgpt["model"]; got != config.DefaultImageModel {
		t.Fatalf("persisted model = %v, want %s", got, config.DefaultImageModel)
	}
	if got := chatgpt["request_timeout"]; got != int64(config.DefaultRequestTimeout) {
		t.Fatalf("persisted request_timeout = %v, want %d", got, config.DefaultRequestTimeout)
	}
	if _, exists := app["api_mode"]; exists {
		t.Fatalf("persisted config should omit app.api_mode")
	}
	if _, exists := app["account_id"]; exists {
		t.Fatalf("persisted config should omit app.account_id")
	}
	for _, key := range []string{"free_image_route", "paid_image_route", "free_image_model", "paid_image_model"} {
		if _, exists := chatgpt[key]; exists {
			t.Fatalf("persisted config should omit chatgpt.%s", key)
		}
	}
	if _, exists := proxy["mode"]; exists {
		t.Fatalf("persisted config should omit proxy.mode")
	}
}

func TestHandleUpdateConfigPersistsBLTProviderDefaults(t *testing.T) {
	cfg := config.New()
	configPath := filepath.Join(t.TempDir(), "config.toml")
	cfg.SetConfigFilePath(configPath)
	cfg.App.Provider = config.ProviderCodesOnline
	cfg.App.BaseURL = config.DefaultBaseURL
	cfg.App.ImageFormat = "url"
	cfg.Server.Host = "0.0.0.0"
	cfg.Server.Port = 8080
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.SSETimeout = 300
	cfg.ChatGPT.RequestTimeout = config.DefaultRequestTimeout

	server := NewServer(cfg)
	body := map[string]any{
		"app": map[string]any{
			"provider":    "blt",
			"apiKey":      "sk-blt",
			"baseUrl":     "",
			"imageFormat": "url",
			"authKey":     "",
		},
		"server": map[string]any{
			"host": "0.0.0.0",
			"port": 8080,
		},
		"chatgpt": map[string]any{
			"model":           "gpt-image-2",
			"sseTimeout":      300,
			"requestTimeout":  config.DefaultRequestTimeout,
			"availableModels": []string{"gpt-image-2"},
		},
		"proxy": map[string]any{
			"enabled": false,
			"url":     "",
		},
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}

	req := httptest.NewRequest(http.MethodPut, "/api/config", bytes.NewReader(raw))
	rec := httptest.NewRecorder()
	server.HandleUpdateConfig(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	app := resp["app"].(map[string]any)
	if got := app["provider"]; got != config.ProviderBLT {
		t.Fatalf("provider = %v, want %s", got, config.ProviderBLT)
	}
	if got := app["baseUrl"]; got != config.BLTBaseURL {
		t.Fatalf("baseUrl = %v, want %s", got, config.BLTBaseURL)
	}
}

func TestBLTImageGenerationUsesImagesGenerationsEndpoint(t *testing.T) {
	var requestPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.Provider = config.ProviderBLT
	cfg.App.APIKey = "sk-blt"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = config.DefaultRequestTimeout

	result, err := NewOpenAIClient(cfg).GenerateImages(context.Background(), "a BLT request", config.DefaultImageModel, 1, "1024x1024", "", "", "", "", "b64_json", nil)
	if err != nil {
		t.Fatalf("GenerateImages error = %v", err)
	}

	if requestPath != "/v1/images/generations" {
		t.Fatalf("request path = %q, want /v1/images/generations", requestPath)
	}
	if len(result.Data) != 1 || result.Data[0].B64JSON != "abc" {
		t.Fatalf("result data = %+v, want b64_json abc", result.Data)
	}
}

func TestImageGenerationUsesUpdatedAPIKeyAfterConfigSave(t *testing.T) {
	var upstreamAuthHeader string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamAuthHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	configPath := filepath.Join(t.TempDir(), "config.toml")
	cfg.SetConfigFilePath(configPath)
	cfg.App.APIKey = "sk-old"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.Server.Host = "0.0.0.0"
	cfg.Server.Port = 8080
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.SSETimeout = 300
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	server := NewServer(cfg)
	updateBody := map[string]any{
		"app": map[string]any{
			"apiKey":      "sk-new",
			"baseUrl":     upstream.URL,
			"imageFormat": "url",
			"authKey":     "",
		},
		"server": map[string]any{
			"host": "0.0.0.0",
			"port": 8080,
		},
		"chatgpt": map[string]any{
			"model":          config.DefaultImageModel,
			"sseTimeout":     300,
			"requestTimeout": 30,
		},
		"proxy": map[string]any{
			"enabled": false,
			"url":     "",
		},
	}
	encodedUpdate, err := json.Marshal(updateBody)
	if err != nil {
		t.Fatalf("marshal update request: %v", err)
	}
	updateReq := httptest.NewRequest(http.MethodPut, "/api/config", bytes.NewReader(encodedUpdate))
	updateRec := httptest.NewRecorder()
	server.HandleUpdateConfig(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", updateRec.Code, updateRec.Body.String())
	}

	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a small test image","n":1,"response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()
	imageHandler.HandleImageGenerations(generateRec, generateReq)
	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if upstreamAuthHeader != "Bearer sk-new" {
		t.Fatalf("upstream Authorization = %q, want %q", upstreamAuthHeader, "Bearer sk-new")
	}
}

func TestOpenRouterImageGenerationUsesChatCompletionsPayload(t *testing.T) {
	var requestPath string
	var requestBody map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPath = r.URL.Path
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"choices":[{"message":{"images":[{"image_url":{"url":"data:image/png;base64,YWJj"}}]}}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.Provider = config.ProviderOpenRouter
	cfg.App.APIKey = "sk-openrouter"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.OpenRouterImageModel
	cfg.ChatGPT.AvailableModels = []string{config.OpenRouterImageModel}
	cfg.ChatGPT.RequestTimeout = config.DefaultRequestTimeout

	result, err := NewOpenAIClient(cfg).GenerateImages(context.Background(), "beautiful sunset mountains", config.OpenRouterImageModel, 1, "1024x1024", "", "", "", "", "b64_json", nil)
	if err != nil {
		t.Fatalf("GenerateImages error = %v", err)
	}

	if requestPath != "/chat/completions" {
		t.Fatalf("request path = %q, want /chat/completions", requestPath)
	}
	if got := requestBody["model"]; got != config.OpenRouterImageModel {
		t.Fatalf("request model = %v, want %s", got, config.OpenRouterImageModel)
	}
	if got := requestBody["modalities"]; len(got.([]any)) != 2 || got.([]any)[0] != "image" || got.([]any)[1] != "text" {
		t.Fatalf("request modalities = %v, want [image text]", got)
	}
	messages, ok := requestBody["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("messages = %v", requestBody["messages"])
	}
	message, ok := messages[0].(map[string]any)
	if !ok {
		t.Fatalf("message type = %T", messages[0])
	}
	if got := message["content"]; !strings.Contains(got.(string), "Target image size: 1024x1024") {
		t.Fatalf("message content = %v, want size hint", got)
	}
	if len(result.Data) != 1 || result.Data[0].B64JSON != "YWJj" {
		t.Fatalf("result data = %+v, want b64_json YWJj", result.Data)
	}
}

func TestImageGenerationFallsBackToConfiguredProviderKeys(t *testing.T) {
	var requestPaths []string
	var authHeaders []string
	var requestModels []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPaths = append(requestPaths, r.URL.Path)
		authHeaders = append(authHeaders, r.Header.Get("Authorization"))
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if model, _ := body["model"].(string); model != "" {
			requestModels = append(requestModels, model)
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/chat/completions" {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"error":{"message":"openrouter unavailable"}}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"fallback-image"}]}`))
	}))
	defer upstream.Close()

	client := &OpenAIClient{
		provider: config.ProviderOpenRouter,
		apiKey:   "sk-openrouter",
		baseURL:  upstream.URL,
		providerAPIKeys: map[string]string{
			config.ProviderOpenRouter:  "sk-openrouter",
			config.ProviderCodesOnline: "sk-codesonline",
		},
		baseURLs: map[string]string{
			config.ProviderOpenRouter:  upstream.URL,
			config.ProviderCodesOnline: upstream.URL,
		},
		httpClient: upstream.Client(),
	}

	result, err := client.GenerateImages(context.Background(), "fallback test", config.DefaultImageModel, 1, "", "", "", "", "", "b64_json", nil)
	if err != nil {
		t.Fatalf("GenerateImages error = %v", err)
	}

	if got, want := requestPaths, []string{"/chat/completions", "/v1/images/generations"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("request paths = %v, want %v", got, want)
	}
	if got, want := authHeaders, []string{"Bearer sk-openrouter", "Bearer sk-codesonline"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("auth headers = %v, want %v", got, want)
	}
	if got, want := requestModels, []string{config.OpenRouterImageModel, config.DefaultImageModel}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("request models = %v, want %v", got, want)
	}
	if result.Provider != config.ProviderCodesOnline || result.Source != config.ProviderCodesOnline {
		t.Fatalf("provider/source = %q/%q, want %q", result.Provider, result.Source, config.ProviderCodesOnline)
	}
	if len(result.Data) != 1 || result.Data[0].B64JSON != "fallback-image" {
		t.Fatalf("result data = %+v, want fallback-image", result.Data)
	}
}

func TestImageEditFallbackSkipsOpenRouterProvider(t *testing.T) {
	var requestPaths []string
	var authHeaders []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPaths = append(requestPaths, r.URL.Path)
		authHeaders = append(authHeaders, r.Header.Get("Authorization"))
		if r.URL.Path == "/chat/completions" {
			t.Fatalf("openrouter should be skipped for image edits")
		}
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			t.Fatalf("parse multipart: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"edited-fallback"}]}`))
	}))
	defer upstream.Close()

	client := &OpenAIClient{
		provider: config.ProviderOpenRouter,
		apiKey:   "sk-openrouter",
		baseURL:  upstream.URL,
		providerAPIKeys: map[string]string{
			config.ProviderOpenRouter:  "sk-openrouter",
			config.ProviderCodesOnline: "sk-codesonline",
		},
		baseURLs: map[string]string{
			config.ProviderOpenRouter:  upstream.URL,
			config.ProviderCodesOnline: upstream.URL,
		},
		httpClient: upstream.Client(),
	}

	result, err := client.GenerateImages(context.Background(), "edit fallback test", config.DefaultImageModel, 1, "", "", "", "", "", "b64_json", [][]byte{[]byte("reference-image")})
	if err != nil {
		t.Fatalf("GenerateImages error = %v", err)
	}

	if got, want := requestPaths, []string{"/v1/images/edits"}; len(got) != len(want) || got[0] != want[0] {
		t.Fatalf("request paths = %v, want %v", got, want)
	}
	if got, want := authHeaders, []string{"Bearer sk-codesonline"}; len(got) != len(want) || got[0] != want[0] {
		t.Fatalf("auth headers = %v, want %v", got, want)
	}
	if result.Provider != config.ProviderCodesOnline || result.Source != config.ProviderCodesOnline {
		t.Fatalf("provider/source = %q/%q, want %q", result.Provider, result.Source, config.ProviderCodesOnline)
	}
}

func TestImageGenerationReportsAllProviderFailures(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":{"message":"provider unavailable"}}`))
	}))
	defer upstream.Close()

	client := &OpenAIClient{
		provider: config.ProviderOpenRouter,
		apiKey:   "sk-openrouter",
		baseURL:  upstream.URL,
		providerAPIKeys: map[string]string{
			config.ProviderOpenRouter: "sk-openrouter",
			config.ProviderBLT:        "sk-blt",
		},
		baseURLs: map[string]string{
			config.ProviderOpenRouter: upstream.URL,
			config.ProviderBLT:        upstream.URL,
		},
		httpClient: upstream.Client(),
	}

	_, err := client.GenerateImages(context.Background(), "all fail test", config.DefaultImageModel, 1, "", "", "", "", "", "b64_json", nil)
	if err == nil {
		t.Fatal("GenerateImages error = nil, want provider failure summary")
	}
	message := err.Error()
	for _, want := range []string{"all configured providers failed", config.ProviderOpenRouter, config.ProviderBLT, "provider unavailable"} {
		if !strings.Contains(message, want) {
			t.Fatalf("error = %q, want to contain %q", message, want)
		}
	}
}

func TestOpenRouterImageGenerationReturnsDataURLForURLMode(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"choices":[{"message":{"images":[{"image_url":{"url":"data:image/png;base64,YWJj"}}]}}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.Provider = config.ProviderOpenRouter
	cfg.App.APIKey = "sk-openrouter"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.OpenRouterImageModel
	cfg.ChatGPT.AvailableModels = []string{config.OpenRouterImageModel}
	cfg.ChatGPT.RequestTimeout = config.DefaultRequestTimeout

	result, err := NewOpenAIClient(cfg).GenerateImages(context.Background(), "beautiful sunset mountains", config.OpenRouterImageModel, 1, "", "", "", "", "", "url", nil)
	if err != nil {
		t.Fatalf("GenerateImages error = %v", err)
	}
	if len(result.Data) != 1 || result.Data[0].URL != "data:image/png;base64,YWJj" {
		t.Fatalf("result data = %+v, want original data url", result.Data)
	}
}

func TestOpenRouterImageGenerationParsesCamelCaseImageURL(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"choices":[{"message":{"images":[{"imageUrl":{"url":"data:image/png;base64,YWJj"}}]}}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.Provider = config.ProviderOpenRouter
	cfg.App.APIKey = "sk-openrouter"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.OpenRouterImageModel
	cfg.ChatGPT.AvailableModels = []string{config.OpenRouterImageModel}
	cfg.ChatGPT.RequestTimeout = config.DefaultRequestTimeout

	result, err := NewOpenAIClient(cfg).GenerateImages(context.Background(), "beautiful sunset mountains", config.OpenRouterImageModel, 1, "", "", "", "", "", "b64_json", nil)
	if err != nil {
		t.Fatalf("GenerateImages error = %v", err)
	}
	if len(result.Data) != 1 || result.Data[0].B64JSON != "YWJj" {
		t.Fatalf("result data = %+v, want b64_json YWJj", result.Data)
	}
}

func TestOpenRouterImageGenerationParsesContentArrayImageURL(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"choices":[{"message":{"content":[{"type":"output_text","text":"done"},{"type":"image_url","image_url":"data:image/png;base64,YWJj"}]}}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.Provider = config.ProviderOpenRouter
	cfg.App.APIKey = "sk-openrouter"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.OpenRouterImageModel
	cfg.ChatGPT.AvailableModels = []string{config.OpenRouterImageModel}
	cfg.ChatGPT.RequestTimeout = config.DefaultRequestTimeout

	result, err := NewOpenAIClient(cfg).GenerateImages(context.Background(), "beautiful sunset mountains", config.OpenRouterImageModel, 1, "", "", "", "", "", "b64_json", nil)
	if err != nil {
		t.Fatalf("GenerateImages error = %v", err)
	}
	if len(result.Data) != 1 || result.Data[0].B64JSON != "YWJj" {
		t.Fatalf("result data = %+v, want b64_json YWJj", result.Data)
	}
}

func TestOpenRouterConfigPayloadReturnsRestrictedCapabilities(t *testing.T) {
	cfg := config.New()
	cfg.App.Provider = config.ProviderOpenRouter
	cfg.App.BaseURL = config.OpenRouterBaseURL
	cfg.ChatGPT.Model = config.OpenRouterImageModel
	cfg.ChatGPT.AvailableModels = []string{config.OpenRouterImageModel}
	cfg.ChatGPT.RequestTimeout = config.DefaultRequestTimeout

	payload := NewServer(cfg).buildConfigPayload()
	app := payload["app"].(map[string]any)
	caps := payload["capabilities"].(map[string]any)

	if got := app["provider"]; got != config.ProviderOpenRouter {
		t.Fatalf("provider = %v, want %s", got, config.ProviderOpenRouter)
	}
	if got := app["baseUrl"]; got != config.OpenRouterBaseURL {
		t.Fatalf("baseUrl = %v, want %s", got, config.OpenRouterBaseURL)
	}
	if got := caps["supportsEdit"]; got != false {
		t.Fatalf("supportsEdit = %v, want false", got)
	}
	if got := caps["maxReferenceImages"]; got != 0 {
		t.Fatalf("maxReferenceImages = %v, want 0", got)
	}
	if got := caps["supportsMultiImageReference"]; got != false {
		t.Fatalf("supportsMultiImageReference = %v, want false", got)
	}
}

func TestImageGenerationRetriesRateLimitedUpstreamRequest(t *testing.T) {
	attempts := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "application/json")
		if attempts == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":{"message":"rate limited"}}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a rate limited request","n":1,"response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if attempts != 2 {
		t.Fatalf("upstream attempts = %d, want 2", attempts)
	}
}

func TestImageGenerationRetriesPollTimeoutUpstreamRequest(t *testing.T) {
	attempts := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "application/json")
		if attempts == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusGatewayTimeout)
			_, _ = w.Write([]byte(`{"error":{"code":"poll_timeout","message":"upstream poll timeout without any image","type":"invalid_request_error"}}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a poll timeout request","n":1,"response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if attempts != 2 {
		t.Fatalf("upstream attempts = %d, want 2", attempts)
	}
}

func TestImageGenerationRetriesTransientEOFRequestFailure(t *testing.T) {
	attempts := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts == 1 {
			hijacker, ok := w.(http.Hijacker)
			if !ok {
				t.Fatal("response writer does not support hijacking")
			}
			conn, _, err := hijacker.Hijack()
			if err != nil {
				t.Fatalf("hijack upstream connection: %v", err)
			}
			_ = conn.Close()
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a transient eof request","n":1,"response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if attempts != 2 {
		t.Fatalf("upstream attempts = %d, want 2", attempts)
	}
}

func TestImageGenerationRetriesEmptySuccessfulUpstreamResponse(t *testing.T) {
	attempts := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "application/json")
		if attempts == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"an empty upstream response","n":1,"response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if attempts != 2 {
		t.Fatalf("upstream attempts = %d, want 2", attempts)
	}
}

func TestImageGenerationAcceptsJSONWrappedByUpstreamNoise(t *testing.T) {
	attempts := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("event: message\ndata: {\"created\":1,\"data\":[{\"b64_json\":\"abc\"}]}\n\ndata: [DONE]\n"))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a noisy upstream response","n":1,"response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if attempts != 1 {
		t.Fatalf("upstream attempts = %d, want 1", attempts)
	}
}

func TestImageGenerationSerializesConcurrentUpstreamRequests(t *testing.T) {
	var mu sync.Mutex
	active := 0
	maxActive := 0
	firstEntered := make(chan struct{}, 1)
	releaseFirst := make(chan struct{})

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		active++
		if active > maxActive {
			maxActive = active
		}
		isFirst := maxActive == 1 && active == 1
		mu.Unlock()

		if isFirst {
			firstEntered <- struct{}{}
			<-releaseFirst
		}

		mu.Lock()
		active--
		mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30
	imageHandler := NewImageHandler(cfg)

	makeRequest := func() int {
		body := []byte(`{"model":"gpt-image-2","prompt":"a serialized request","n":1,"response_format":"b64_json"}`)
		req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		imageHandler.HandleImageGenerations(rec, req)
		return rec.Code
	}

	var wg sync.WaitGroup
	codes := make(chan int, 2)
	wg.Add(1)
	go func() {
		defer wg.Done()
		codes <- makeRequest()
	}()

	select {
	case <-firstEntered:
	case <-time.After(time.Second):
		t.Fatal("first upstream request did not start")
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		codes <- makeRequest()
	}()

	time.Sleep(40 * time.Millisecond)
	close(releaseFirst)
	wg.Wait()
	close(codes)

	for code := range codes {
		if code != http.StatusOK {
			t.Fatalf("generate status = %d, want %d", code, http.StatusOK)
		}
	}
	if maxActive != 1 {
		t.Fatalf("max concurrent upstream requests = %d, want 1", maxActive)
	}
}

func TestImageGenerationSplitsRequestsIntoSingleImageBatches(t *testing.T) {
	var upstreamBatchSizes []int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			N int `json:"n"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode upstream request: %v", err)
		}
		upstreamBatchSizes = append(upstreamBatchSizes, payload.N)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		resp := map[string]any{
			"created": 1,
			"data":    make([]map[string]string, 0, payload.N),
		}
		for i := 0; i < payload.N; i++ {
			resp["data"] = append(resp["data"].([]map[string]string), map[string]string{
				"b64_json": "batch-image",
			})
		}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			t.Fatalf("encode upstream response: %v", err)
		}
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a four image request","n":4,"response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if got, want := upstreamBatchSizes, []int{1, 1, 1, 1}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] || got[2] != want[2] || got[3] != want[3] {
		t.Fatalf("upstream batch sizes = %v, want %v", got, want)
	}

	var resp struct {
		Data []map[string]string `json:"data"`
	}
	if err := json.Unmarshal(generateRec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Data) != 4 {
		t.Fatalf("returned images = %d, want 4", len(resp.Data))
	}
}

func TestImageGenerationKeepsSuccessfulBatchResultsWhenLaterBatchFails(t *testing.T) {
	attempts := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "application/json")
		if attempts <= 2 {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"batch-image"}]}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a partially successful request","n":4,"response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if attempts != 5 {
		t.Fatalf("upstream attempts = %d, want 5", attempts)
	}

	var resp struct {
		Data           []map[string]string `json:"data"`
		CapabilityNote string              `json:"capability_note"`
	}
	if err := json.Unmarshal(generateRec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Data) != 2 {
		t.Fatalf("returned images = %d, want 2", len(resp.Data))
	}
	if !strings.Contains(resp.CapabilityNote, "已成功生成 2/4 张") {
		t.Fatalf("capability_note = %q, want partial success summary", resp.CapabilityNote)
	}
}

func TestImageGenerationWithReferenceImageUsesUpstreamEditsMultipart(t *testing.T) {
	var upstreamPath string
	var upstreamContentType string
	var formModel string
	var formPrompt string
	var formSize string
	var formQuality string
	var formStyle string
	var formUpscale string
	var formN string
	var formResponseFormat string
	var uploadedImage []byte

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamPath = r.URL.Path
		upstreamContentType = r.Header.Get("Content-Type")

		if err := r.ParseMultipartForm(10 << 20); err != nil {
			t.Fatalf("parse upstream multipart request: %v", err)
		}
		formModel = r.FormValue("model")
		formPrompt = r.FormValue("prompt")
		formSize = r.FormValue("size")
		formQuality = r.FormValue("quality")
		formStyle = r.FormValue("style")
		formUpscale = r.FormValue("upscale")
		formN = r.FormValue("n")
		formResponseFormat = r.FormValue("response_format")

		file, _, err := r.FormFile("image")
		if err != nil {
			t.Fatalf("read image form file: %v", err)
		}
		defer file.Close()
		uploadedImage, err = io.ReadAll(file)
		if err != nil {
			t.Fatalf("read uploaded image: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"edited"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"保留人物主体,改成电影海报风格","n":1,"size":"2048x1152","response_format":"b64_json","reference_images":["cmVmZXJlbmNlLWltYWdl"]}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if upstreamPath != "/v1/images/edits" {
		t.Fatalf("upstream path = %q, want /v1/images/edits", upstreamPath)
	}
	if !strings.HasPrefix(upstreamContentType, "multipart/form-data;") {
		t.Fatalf("upstream content-type = %q, want multipart/form-data", upstreamContentType)
	}
	if formModel != "gpt-image-2" {
		t.Fatalf("model form field = %q, want gpt-image-2", formModel)
	}
	if formPrompt != "保留人物主体,改成电影海报风格" {
		t.Fatalf("prompt form field = %q", formPrompt)
	}
	if formSize != "2048x1152" {
		t.Fatalf("size form field = %q, want 2048x1152", formSize)
	}
	if formQuality != "" || formStyle != "" || formUpscale != "" {
		t.Fatalf("unexpected optional form fields quality=%q style=%q upscale=%q", formQuality, formStyle, formUpscale)
	}
	if formN != "1" {
		t.Fatalf("n form field = %q, want 1", formN)
	}
	if formResponseFormat != "b64_json" {
		t.Fatalf("response_format form field = %q, want b64_json", formResponseFormat)
	}
	if string(uploadedImage) != "reference-image" {
		t.Fatalf("uploaded image = %q, want reference-image", string(uploadedImage))
	}
}

func TestImageGenerationClampsOversizedRequestBeforeCallingUpstream(t *testing.T) {
	var upstreamSize string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode upstream request: %v", err)
		}
		upstreamSize, _ = body["size"].(string)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a square 4k request","n":1,"size":"4096x4096","response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if upstreamSize != "3840x3840" {
		t.Fatalf("upstream size = %q, want 3840x3840", upstreamSize)
	}
}

func TestImageGenerationResolvesAspectRatioAndUpscaleToPixelSize(t *testing.T) {
	var upstreamBody map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&upstreamBody); err != nil {
			t.Fatalf("decode upstream request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a wide 4k request","n":1,"size":"21:9","upscale":"4k","response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if got, _ := upstreamBody["size"].(string); got != "3840x1648" {
		t.Fatalf("upstream size = %q, want 3840x1648", got)
	}
	if got, exists := upstreamBody["upscale"]; exists {
		t.Fatalf("upstream upscale = %v, want omitted after pixel size resolution", got)
	}
}

func TestOpenRouterImageGenerationResolvesAspectRatioAndUpscaleToPixelSize(t *testing.T) {
	var requestBody map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Fatalf("decode upstream request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"images":[{"image_url":{"url":"data:image/png;base64,YWJj"}}]}}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.Provider = config.ProviderOpenRouter
	cfg.App.APIKey = "sk-openrouter"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.OpenRouterImageModel
	cfg.ChatGPT.AvailableModels = []string{config.OpenRouterImageModel}
	cfg.ChatGPT.RequestTimeout = config.DefaultRequestTimeout

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"openai/gpt-5.4-image-2","prompt":"a wide 2k request","n":1,"size":"21:9","upscale":"2k","response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	messages, ok := requestBody["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("messages = %v", requestBody["messages"])
	}
	message, ok := messages[0].(map[string]any)
	if !ok {
		t.Fatalf("message type = %T", messages[0])
	}
	if got := message["content"]; !strings.Contains(got.(string), "Target image size: 2048x880") {
		t.Fatalf("message content = %v, want size hint 2048x880", got)
	}
}

func TestBLTImageGenerationResolvesAspectRatioAndUpscaleToPixelSize(t *testing.T) {
	var upstreamBody map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" {
			t.Fatalf("request path = %q, want /v1/images/generations", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&upstreamBody); err != nil {
			t.Fatalf("decode upstream request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.Provider = config.ProviderBLT
	cfg.App.APIKey = "sk-blt"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a blt 2k portrait request","n":1,"size":"2:3","upscale":"2k","response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if got, _ := upstreamBody["size"].(string); got != "1368x2048" {
		t.Fatalf("size = %q, want 1368x2048", got)
	}
	if got, exists := upstreamBody["upscale"]; exists {
		t.Fatalf("upscale = %v, want omitted after pixel size resolution", got)
	}
}

func TestImageGenerationForwardsOnlinePlayImageOptions(t *testing.T) {
	var upstreamBody map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&upstreamBody); err != nil {
			t.Fatalf("decode upstream request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"abc"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"a poster","n":1,"size":"2:3","quality":"high","style":"vivid","upscale":"2k","response_format":"b64_json"}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	for key, want := range map[string]string{
		"quality": "high",
		"style":   "vivid",
	} {
		if got, _ := upstreamBody[key].(string); got != want {
			t.Fatalf("%s = %q, want %q", key, got, want)
		}
	}
	if got, _ := upstreamBody["size"].(string); got != "1368x2048" {
		t.Fatalf("size = %q, want 1368x2048", got)
	}
	if got, exists := upstreamBody["upscale"]; exists {
		t.Fatalf("upscale = %v, want omitted after pixel size resolution", got)
	}
}

func TestImageGenerationClampsOversizedEditRequestBeforeCallingUpstream(t *testing.T) {
	var formSize string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			t.Fatalf("parse upstream multipart request: %v", err)
		}
		formSize = r.FormValue("size")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":1,"data":[{"b64_json":"edited"}]}`))
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"edit oversized image","n":1,"size":"4096x2304","response_format":"b64_json","reference_images":["cmVmZXJlbmNlLWltYWdl"]}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if formSize != "3840x2160" {
		t.Fatalf("size form field = %q, want 3840x2160", formSize)
	}
}

func TestWriteUpstreamErrorHumanizesSafetyAndSizeErrors(t *testing.T) {
	sizeRec := httptest.NewRecorder()
	writeUpstreamError(sizeRec, &UpstreamAPIError{
		Operation:  "image generation",
		Endpoint:   "/v1/images/generations",
		StatusCode: http.StatusBadRequest,
		Body:       `{"error":{"message":"Invalid size '4096x4096'. The longest edge must be less than or equal to 3840."}}`,
	}, "", "image generation")
	if !strings.Contains(sizeRec.Body.String(), "最长边不超过 3840") {
		t.Fatalf("size error body = %s", sizeRec.Body.String())
	}

	safetyRec := httptest.NewRecorder()
	writeUpstreamError(safetyRec, &UpstreamAPIError{
		Operation:  "image edit",
		Endpoint:   "/v1/images/edits",
		StatusCode: http.StatusInternalServerError,
		Body:       `{"error":{"message":"Your request was rejected by the safety system. safety_violations=[sexual]."}}`,
	}, "", "image edit")
	if !strings.Contains(safetyRec.Body.String(), "安全系统拒绝") {
		t.Fatalf("safety error body = %s", safetyRec.Body.String())
	}
}

func TestImageGenerationWithReferenceImageSplitsEditsRequestsIntoSingleImageBatches(t *testing.T) {
	var upstreamPaths []string
	var upstreamBatchSizes []int

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamPaths = append(upstreamPaths, r.URL.Path)
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			t.Fatalf("parse upstream multipart request: %v", err)
		}
		batchSize, err := strconv.Atoi(r.FormValue("n"))
		if err != nil {
			t.Fatalf("parse n form field: %v", err)
		}
		upstreamBatchSizes = append(upstreamBatchSizes, batchSize)

		file, _, err := r.FormFile("image")
		if err != nil {
			t.Fatalf("read image form file: %v", err)
		}
		_ = file.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		resp := map[string]any{
			"created": 1,
			"data":    make([]map[string]string, 0, batchSize),
		}
		for i := 0; i < batchSize; i++ {
			resp["data"] = append(resp["data"].([]map[string]string), map[string]string{
				"b64_json": "edited-batch-image",
			})
		}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			t.Fatalf("encode upstream response: %v", err)
		}
	}))
	defer upstream.Close()

	cfg := config.New()
	cfg.App.APIKey = "sk-test"
	cfg.App.BaseURL = upstream.URL
	cfg.App.ImageFormat = "url"
	cfg.ChatGPT.Model = config.DefaultImageModel
	cfg.ChatGPT.RequestTimeout = 30

	imageHandler := NewImageHandler(cfg)
	generateBody := []byte(`{"model":"gpt-image-2","prompt":"保留人物主体,改成电影海报风格","n":4,"size":"2048x1152","response_format":"b64_json","reference_images":["cmVmZXJlbmNlLWltYWdl"]}`)
	generateReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(generateBody))
	generateRec := httptest.NewRecorder()

	imageHandler.HandleImageGenerations(generateRec, generateReq)

	if generateRec.Code != http.StatusOK {
		t.Fatalf("generate status = %d, body = %s", generateRec.Code, generateRec.Body.String())
	}
	if got, want := upstreamPaths, []string{"/v1/images/edits", "/v1/images/edits", "/v1/images/edits", "/v1/images/edits"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] || got[2] != want[2] || got[3] != want[3] {
		t.Fatalf("upstream paths = %v, want %v", got, want)
	}
	if got, want := upstreamBatchSizes, []int{1, 1, 1, 1}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] || got[2] != want[2] || got[3] != want[3] {
		t.Fatalf("upstream batch sizes = %v, want %v", got, want)
	}

	var resp struct {
		Data []map[string]string `json:"data"`
	}
	if err := json.Unmarshal(generateRec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Data) != 4 {
		t.Fatalf("returned images = %d, want 4", len(resp.Data))
	}
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

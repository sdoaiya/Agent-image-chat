package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
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
	if got := chatgpt["requestTimeout"]; got != 180 {
		t.Fatalf("requestTimeout = %v, want %d", got, 180)
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
	if got := chatgpt["requestTimeout"]; got != float64(180) {
		t.Fatalf("requestTimeout = %v, want %d", got, 180)
	}
	assertConfigSchemaOmitsLegacyFields(t, app, chatgpt, proxy)
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

func TestImageGenerationSplitsRequestsIntoTwoImageBatches(t *testing.T) {
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
	if got, want := upstreamBatchSizes, []int{2, 2}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
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

func TestImageGenerationWithReferenceImageUsesUpstreamEditsMultipart(t *testing.T) {
	var upstreamPath string
	var upstreamContentType string
	var formModel string
	var formPrompt string
	var formSize string
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

func TestImageGenerationWithReferenceImageSplitsEditsRequestsIntoTwoImageBatches(t *testing.T) {
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
	if got, want := upstreamPaths, []string{"/v1/images/edits", "/v1/images/edits"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("upstream paths = %v, want %v", got, want)
	}
	if got, want := upstreamBatchSizes, []int{2, 2}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
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

package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"

	"gimg/internal/config"
)

type Server struct {
	cfg *config.Config
	mu  sync.RWMutex
}

func NewServer(cfg *config.Config) *Server {
	return &Server{cfg: cfg}
}

func (s *Server) HandleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (s *Server) HandleModels(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"object": "list",
		"data": []map[string]any{
			{"id": config.DefaultImageModel, "object": "model", "created": 1700000002, "owned_by": "codesonline"},
		},
	})
}

func (s *Server) HandleGetConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.buildConfigPayload())
}

func (s *Server) HandleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	var payload configUpdatePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "invalid request body", requestIDFrom(r), nil)
		return
	}

	apiMode := strings.TrimSpace(payload.App.APIMode)
	if apiMode == "" || strings.EqualFold(apiMode, "openai") || strings.EqualFold(apiMode, "codex") || strings.EqualFold(apiMode, "auto") {
		apiMode = "codesonline"
	}
	baseURL := strings.TrimSpace(payload.App.BaseURL)
	if baseURL == "" || strings.EqualFold(baseURL, "https://api.openai.com") || strings.EqualFold(baseURL, "https://mx.free.codesonline.dev") {
		baseURL = config.DefaultBaseURL
	}
	model := config.NormalizeImageModel(payload.ChatGPT.Model)
	if model == "" {
		model = config.DefaultImageModel
	}

	if err := s.cfg.SaveOverrides(map[string]map[string]any{
		"app": {
			"api_mode":     apiMode,
			"api_key":      payload.App.APIKey,
			"base_url":     baseURL,
			"image_format": payload.App.ImageFormat,
			"auth_key":     payload.App.AuthKey,
		},
		"server": {
			"host": payload.Server.Host,
			"port": payload.Server.Port,
		},
		"chatgpt": {
			"model":           model,
			"sse_timeout":     payload.ChatGPT.SSETimeout,
			"request_timeout": payload.ChatGPT.RequestTimeout,
		},
		"proxy": {
			"enabled": payload.Proxy.Enabled,
			"url":     payload.Proxy.URL,
			"mode":    payload.Proxy.Mode,
		},
	}); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_error", err.Error(), requestIDFrom(r), nil)
		return
	}
	writeJSON(w, http.StatusOK, s.buildConfigPayload())
}

func (s *Server) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authKey := s.cfg.GetAuthKey()
		if authKey == "" {
			next.ServeHTTP(w, r)
			return
		}
		token := bearerFromRequest(r)
		if token == "" {
			writeError(w, http.StatusUnauthorized, "invalid_request_error", "invalid api key", requestIDFrom(r), nil)
			return
		}
		apiKey := s.cfg.GetAPIKey()
		keys := parseKeys(apiKey)
		allKeys := append(keys, authKey)
		matched := false
		for _, key := range allKeys {
			if strings.TrimSpace(key) != "" && token == strings.TrimSpace(key) {
				matched = true
				break
			}
		}
		if !matched {
			writeError(w, http.StatusUnauthorized, "invalid_request_error", "invalid api key", requestIDFrom(r), nil)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type configUpdatePayload struct {
	App struct {
		APIMode     string `json:"apiMode"`
		APIKey      string `json:"apiKey"`
		BaseURL     string `json:"baseUrl"`
		ImageFormat string `json:"imageFormat"`
		AuthKey     string `json:"authKey"`
	} `json:"app"`
	Server struct {
		Host string `json:"host"`
		Port int    `json:"port"`
	} `json:"server"`
	ChatGPT struct {
		Model          string `json:"model"`
		SSETimeout     int    `json:"sseTimeout"`
		RequestTimeout int    `json:"requestTimeout"`
	} `json:"chatgpt"`
	Proxy struct {
		Enabled bool   `json:"enabled"`
		URL     string `json:"url"`
		Mode    string `json:"mode"`
	} `json:"proxy"`
}

func (s *Server) buildConfigPayload() map[string]any {
	caps := s.cfg.GetCapabilities()
	model := config.NormalizeImageModel(s.cfg.ChatGPT.Model)
	if model == "" {
		model = config.DefaultImageModel
	}
	return map[string]any{
		"app": map[string]any{
			"apiMode":     s.cfg.GetAPIMode(),
			"apiKey":      s.cfg.App.APIKey,
			"baseUrl":     s.cfg.GetBaseURL(),
			"imageFormat": s.cfg.App.ImageFormat,
			"authKey":     s.cfg.App.AuthKey,
		},
		"server": map[string]any{
			"host": s.cfg.Server.Host,
			"port": s.cfg.Server.Port,
		},
		"chatgpt": map[string]any{
			"model":           model,
			"sseTimeout":      s.cfg.ChatGPT.SSETimeout,
			"requestTimeout":  s.cfg.ChatGPT.RequestTimeout,
			"availableModels": []string{config.DefaultImageModel},
			"migrationNote":   "Legacy openai/codex/auto modes are normalized to the single codesonline image generation backend. Legacy model ids are normalized to gpt-image-2.",
		},
		"proxy": map[string]any{
			"enabled": s.cfg.Proxy.Enabled,
			"url":     s.cfg.Proxy.URL,
			"mode":    s.cfg.Proxy.Mode,
		},
		"capabilities": map[string]any{
			"supportsGenerate":            caps.SupportsGenerate,
			"supportsEdit":                caps.SupportsEdit,
			"resolutions":                 caps.Resolutions,
			"maxReferenceImages":          caps.MaxReferenceImages,
			"supportsMultiImageReference": caps.SupportsMultiReference,
		},
	}
}

func bearerFromRequest(r *http.Request) string {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func parseKeys(raw string) []string {
	result := make([]string, 0)
	for _, item := range strings.Split(raw, ",") {
		if cleaned := strings.TrimSpace(item); cleaned != "" {
			result = append(result, cleaned)
		}
	}
	return result
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, errorType, message, requestID string, details map[string]any) {
	errorPayload := map[string]any{
		"message": message,
		"type":    errorType,
	}
	if requestID != "" {
		errorPayload["request_id"] = requestID
	}
	if len(details) > 0 {
		errorPayload["details"] = details
	}
	writeJSON(w, status, map[string]any{"error": errorPayload})
}

func writeUpstreamError(w http.ResponseWriter, err error, requestID, operation string) {
	var upstreamErr *UpstreamAPIError
	if errors.As(err, &upstreamErr) {
		writeError(w, http.StatusBadGateway, "upstream_api_error", upstreamErr.Error(), requestID, map[string]any{
			"operation":     upstreamErr.Operation,
			"endpoint":      upstreamErr.Endpoint,
			"status_code":   upstreamErr.StatusCode,
			"upstream_body": upstreamErr.Body,
		})
		return
	}
	writeError(w, http.StatusBadGateway, "server_error", err.Error(), requestID, map[string]any{"operation": operation})
}

func requestIDFrom(r *http.Request) string {
	for _, key := range []string{"X-Request-Id", "X-Request-ID", "X-Correlation-Id"} {
		if value := strings.TrimSpace(r.Header.Get(key)); value != "" {
			return value
		}
	}
	return ""
}

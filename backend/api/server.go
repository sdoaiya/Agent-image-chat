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
	models := s.cfg.GetAvailableModels()
	data := make([]map[string]any, 0, len(models))
	for index, model := range models {
		data = append(data, map[string]any{
			"id":       model,
			"object":   "model",
			"created":  1700000000 + index,
			"owned_by": "codesonline",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"object": "list",
		"data":   data,
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
	if err := s.cfg.SaveOverrides(map[string]map[string]any{
		"app": {
			"provider":          payload.App.Provider,
			"api_key":           payload.App.APIKey,
			"provider_api_keys": payload.App.ProviderAPIKeys,
			"base_url":          payload.App.BaseURL,
			"image_format":      payload.App.ImageFormat,
			"auth_key":          "",
		},
		"server": {
			"host": payload.Server.Host,
			"port": payload.Server.Port,
		},
		"chatgpt": {
			"model":            config.NormalizeImageModel(payload.ChatGPT.Model),
			"sse_timeout":      payload.ChatGPT.SSETimeout,
			"request_timeout":  payload.ChatGPT.RequestTimeout,
			"available_models": payload.ChatGPT.AvailableModels,
		},
		"proxy": {
			"enabled": payload.Proxy.Enabled,
			"url":     payload.Proxy.URL,
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
		matched := false
		for _, key := range parseKeys(authKey) {
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
		Provider        string            `json:"provider"`
		APIKey          string            `json:"apiKey"`
		ProviderAPIKeys map[string]string `json:"providerApiKeys"`
		BaseURL         string            `json:"baseUrl"`
		ImageFormat     string            `json:"imageFormat"`
		AuthKey         string            `json:"authKey"`
	} `json:"app"`
	Server struct {
		Host string `json:"host"`
		Port int    `json:"port"`
	} `json:"server"`
	ChatGPT struct {
		Model           string   `json:"model"`
		SSETimeout      int      `json:"sseTimeout"`
		RequestTimeout  int      `json:"requestTimeout"`
		AvailableModels []string `json:"availableModels"`
	} `json:"chatgpt"`
	Proxy struct {
		Enabled bool   `json:"enabled"`
		URL     string `json:"url"`
	} `json:"proxy"`
}

func (s *Server) buildConfigPayload() map[string]any {
	caps := s.cfg.GetCapabilities()
	return map[string]any{
		"app": map[string]any{
			"provider":        s.cfg.GetProvider(),
			"apiKey":          s.cfg.GetAPIKey(),
			"providerApiKeys": s.cfg.GetConfiguredProviderKeys(),
			"baseUrl":         s.cfg.GetBaseURL(),
			"imageFormat":     s.cfg.App.ImageFormat,
			"authKey":         "",
		},
		"server": map[string]any{
			"host": s.cfg.Server.Host,
			"port": s.cfg.Server.Port,
		},
		"chatgpt": map[string]any{
			"model":           s.cfg.GetModel(),
			"sseTimeout":      s.cfg.ChatGPT.SSETimeout,
			"requestTimeout":  s.cfg.GetRequestTimeout(),
			"availableModels": s.cfg.GetAvailableModels(),
		},
		"proxy": map[string]any{
			"enabled": s.cfg.Proxy.Enabled,
			"url":     s.cfg.Proxy.URL,
		},
		"capabilities": map[string]any{
			"supportsGenerate":            caps.SupportsGenerate,
			"supportsEdit":                caps.SupportsEdit,
			"supportsUpscale":             caps.SupportsUpscale,
			"resolutions":                 caps.Resolutions,
			"upscaleFactors":              caps.UpscaleFactors,
			"maxReferenceImages":          caps.MaxReferenceImages,
			"supportsMask":                caps.SupportsMask,
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
		message := upstreamErr.Error()
		lowerBody := strings.ToLower(upstreamErr.Body)
		if strings.Contains(lowerBody, "invalid size") || strings.Contains(lowerBody, "longest edge") {
			message = "输出尺寸过大，请改用原图、2K 高清，或选择最长边不超过 3840 的尺寸。"
		} else if strings.Contains(lowerBody, "safety_violations") || strings.Contains(lowerBody, "rejected by the safety system") {
			message = "请求被上游安全系统拒绝，请调整提示词或参考图后重试。"
		}
		writeError(w, http.StatusBadGateway, "upstream_api_error", message, requestID, map[string]any{
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

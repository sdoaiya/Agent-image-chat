package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"gimg/internal/config"
)

type OpenAIClient struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

func NewOpenAIClient(cfg *config.Config) *OpenAIClient {
	baseURL := cfg.GetBaseURL()
	proxyURL := cfg.ProxyURL()
	timeout := time.Duration(cfg.GetRequestTimeout()) * time.Second

	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 100,
		IdleConnTimeout:     90 * time.Second,
	}
	if proxyURL != "" {
		if proxy, err := parseProxyURL(proxyURL); err == nil {
			transport.Proxy = http.ProxyURL(proxy)
		}
	}

	return &OpenAIClient{
		apiKey:  cfg.GetAPIKey(),
		baseURL: strings.TrimSuffix(baseURL, "/"),
		httpClient: &http.Client{
			Timeout:   timeout,
			Transport: transport,
		},
	}
}

type ImageGenerationResponse struct {
	Created        int         `json:"created"`
	Data           []ImageData `json:"data"`
	CapabilityNote string      `json:"capability_note,omitempty"`
}

type ImageData struct {
	URL           string `json:"url,omitempty"`
	B64JSON       string `json:"b64_json,omitempty"`
	RevisedPrompt string `json:"revised_prompt,omitempty"`
}

type UpstreamAPIError struct {
	Operation  string
	Endpoint   string
	StatusCode int
	Body       string
}

func (e *UpstreamAPIError) Error() string {
	return fmt.Sprintf("%s upstream returned %d from %s: %s", e.Operation, e.StatusCode, e.Endpoint, strings.TrimSpace(e.Body))
}

func (c *OpenAIClient) GenerateImages(ctx context.Context, prompt, model string, n int, size, quality, background, responseFormat string, referenceImages []string) (*ImageGenerationResponse, error) {
	if model == "" {
		model = config.DefaultImageModel
	}
	if n < 1 {
		n = 1
	}
	if responseFormat == "" {
		responseFormat = "url"
	}

	body := map[string]any{
		"model":           model,
		"prompt":          prompt,
		"n":               n,
		"response_format": responseFormat,
	}
	if size != "" {
		body["size"] = size
	}
	if quality != "" {
		body["quality"] = quality
	}
	if background != "" {
		body["background"] = background
	}
	if len(referenceImages) > 0 {
		body["reference_images"] = referenceImages
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/images/generations", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	c.setJSONHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, &UpstreamAPIError{Operation: "image generation", Endpoint: req.URL.Path, StatusCode: resp.StatusCode, Body: string(respBody)}
	}

	var result ImageGenerationResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &result, nil
}

func (c *OpenAIClient) setJSONHeaders(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "gimg/1.0")
}

func parseProxyURL(proxyURL string) (*url.URL, error) {
	return url.Parse(proxyURL)
}

func detectMIME(data []byte) string {
	if len(data) >= 8 {
		if data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
			return "image/png"
		}
		if data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
			return "image/jpeg"
		}
		if data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46 &&
			len(data) >= 12 && data[8] == 0x57 && data[9] == 0x45 && data[10] == 0x42 && data[11] == 0x50 {
			return "image/webp"
		}
	}
	return "image/png"
}

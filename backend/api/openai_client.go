package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
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

func (c *OpenAIClient) GenerateImages(ctx context.Context, prompt, model string, n int, size, quality, background, responseFormat string, referenceImages [][]byte) (*ImageGenerationResponse, error) {
	if model == "" {
		model = config.DefaultImageModel
	}
	if n < 1 {
		n = 1
	}
	if responseFormat == "" {
		responseFormat = "url"
	}
	if len(referenceImages) > 0 {
		return c.EditImages(ctx, prompt, model, n, size, quality, background, responseFormat, referenceImages)
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

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/v1/images/generations", bytes.NewReader(jsonBody))
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

func (c *OpenAIClient) EditImages(ctx context.Context, prompt, model string, n int, size, quality, background, responseFormat string, referenceImages [][]byte) (*ImageGenerationResponse, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	fields := map[string]string{
		"model":           model,
		"prompt":          prompt,
		"n":               fmt.Sprint(n),
		"response_format": responseFormat,
	}
	if size != "" {
		fields["size"] = size
	}
	if quality != "" {
		fields["quality"] = quality
	}
	if background != "" {
		fields["background"] = background
	}
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return nil, fmt.Errorf("write multipart field %s: %w", key, err)
		}
	}
	for index, image := range referenceImages {
		if len(image) == 0 {
			continue
		}
		if err := writeMultipartImage(writer, "image", fmt.Sprintf("reference-%d%s", index+1, imageExtension(image)), image); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close multipart body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/v1/images/edits", &body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	c.setBaseHeaders(req)
	req.Header.Set("Content-Type", writer.FormDataContentType())

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
		return nil, &UpstreamAPIError{Operation: "image edit", Endpoint: req.URL.Path, StatusCode: resp.StatusCode, Body: string(respBody)}
	}

	var result ImageGenerationResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &result, nil
}

func writeMultipartImage(writer *multipart.Writer, fieldName, filename string, image []byte) error {
	contentType := http.DetectContentType(image)
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, filename))
	header.Set("Content-Type", contentType)

	part, err := writer.CreatePart(header)
	if err != nil {
		return fmt.Errorf("create multipart image part: %w", err)
	}
	if _, err := part.Write(image); err != nil {
		return fmt.Errorf("write multipart image part: %w", err)
	}
	return nil
}

func imageExtension(image []byte) string {
	switch http.DetectContentType(image) {
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ".png"
	}
}

func (c *OpenAIClient) setBaseHeaders(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("User-Agent", "gimg/1.0")
}

func (c *OpenAIClient) setJSONHeaders(req *http.Request) {
	c.setBaseHeaders(req)
	req.Header.Set("Content-Type", "application/json")
}

func parseProxyURL(proxyURL string) (*url.URL, error) {
	return url.Parse(proxyURL)
}

func decodeBase64Image(value string) ([]byte, error) {
	cleaned := strings.TrimSpace(value)
	if idx := strings.Index(cleaned, ","); idx >= 0 {
		cleaned = cleaned[idx+1:]
	}
	decoded, err := base64.StdEncoding.DecodeString(cleaned)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 image")
	}
	return decoded, nil
}

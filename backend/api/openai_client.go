package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"strconv"
	"strings"
	"time"

	"gimg/internal/config"
)

type OpenAIClient struct {
	provider        string
	apiKey          string
	baseURL         string
	providerAPIKeys map[string]string
	baseURLs        map[string]string
	httpClient      *http.Client
}

const (
	maxUpstreamRateLimitRetries = 2

	upstreamEmptyResponseMessage       = "\u4e0a\u6e38\u8fd4\u56de\u7a7a\u54cd\u5e94\uff0c\u7cfb\u7edf\u5df2\u81ea\u52a8\u91cd\u8bd5\u4f46\u4ecd\u672a\u62ff\u5230\u6709\u6548\u7ed3\u679c"
	upstreamInvalidJSONResponseMessage = "\u4e0a\u6e38\u8fd4\u56de\u4e0d\u5b8c\u6574\u6216\u65e0\u6548\u7684 JSON\uff0c\u7cfb\u7edf\u5df2\u81ea\u52a8\u91cd\u8bd5\u4f46\u4ecd\u672a\u62ff\u5230\u6709\u6548\u7ed3\u679c"
)

var upstreamRequestGate = make(chan struct{}, 1)

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
		provider:        cfg.GetProvider(),
		apiKey:          cfg.GetAPIKey(),
		baseURL:         strings.TrimSuffix(baseURL, "/"),
		providerAPIKeys: cfg.GetConfiguredProviderKeys(),
		baseURLs: map[string]string{
			config.ProviderCodesOnline: strings.TrimSuffix(cfg.GetBaseURLForProvider(config.ProviderCodesOnline), "/"),
			config.ProviderOpenRouter:  strings.TrimSuffix(cfg.GetBaseURLForProvider(config.ProviderOpenRouter), "/"),
			config.ProviderBLT:         strings.TrimSuffix(cfg.GetBaseURLForProvider(config.ProviderBLT), "/"),
		},
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
	Provider       string      `json:"provider,omitempty"`
	Source         string      `json:"source,omitempty"`
}

type ImageData struct {
	URL           string `json:"url,omitempty"`
	B64JSON       string `json:"b64_json,omitempty"`
	RevisedPrompt string `json:"revised_prompt,omitempty"`
	Provider      string `json:"provider,omitempty"`
	Source        string `json:"source,omitempty"`
}

type UpstreamAPIError struct {
	Operation  string
	Endpoint   string
	StatusCode int
	Body       string
}

func (e *UpstreamAPIError) Error() string {
	body := strings.TrimSpace(e.Body)
	if e.StatusCode == http.StatusOK && (body == upstreamEmptyResponseMessage || body == upstreamInvalidJSONResponseMessage) {
		return body
	}
	if body == "" {
		body = "empty response body"
	}
	return fmt.Sprintf("%s upstream returned %d from %s: %s", e.Operation, e.StatusCode, e.Endpoint, body)
}

func (c *OpenAIClient) GenerateImages(ctx context.Context, prompt, model string, n int, size, quality, style, upscale, background, responseFormat string, referenceImages [][]byte) (*ImageGenerationResponse, error) {
	attempts := c.providerAttempts(len(referenceImages) > 0)
	failures := make([]providerFailure, 0, len(attempts))
	for _, attempt := range attempts {
		next := c.withProvider(attempt.Provider, attempt.APIKey)
		result, err := next.generateImagesOnce(ctx, prompt, model, n, size, quality, style, upscale, background, responseFormat, referenceImages)
		if err != nil {
			failures = append(failures, providerFailure{Provider: attempt.Provider, Err: err})
			continue
		}
		for i := range result.Data {
			result.Data[i].Provider = attempt.Provider
			result.Data[i].Source = attempt.Provider
		}
		result.Provider = attempt.Provider
		result.Source = attempt.Provider
		return result, nil
	}
	return nil, providerFallbackError{Failures: failures}
}

func (c *OpenAIClient) generateImagesOnce(ctx context.Context, prompt, model string, n int, size, quality, style, upscale, background, responseFormat string, referenceImages [][]byte) (*ImageGenerationResponse, error) {
	model = imageModelForProvider(c.provider, model)
	if n < 1 {
		n = 1
	}
	if responseFormat == "" {
		responseFormat = "url"
	}
	if len(referenceImages) > 0 {
		return c.EditImages(ctx, prompt, model, n, size, quality, style, upscale, background, responseFormat, referenceImages)
	}
	if c.provider == config.ProviderOpenRouter {
		return c.generateImagesViaOpenRouter(ctx, prompt, model, n, size, responseFormat)
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
	if style != "" {
		body["style"] = style
	}
	if upscale != "" {
		body["upscale"] = upscale
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
	respBody, err := c.doUpstreamRequestWithRetry(ctx, req, jsonBody, c.setJSONHeaders, "image generation")
	if err != nil {
		return nil, err
	}

	var result ImageGenerationResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &result, nil
}

func imageModelForProvider(provider, model string) string {
	model = strings.TrimSpace(model)
	if normalizeClientProvider(provider) == config.ProviderOpenRouter {
		if model == "" || model == config.DefaultImageModel {
			return config.OpenRouterImageModel
		}
		return model
	}
	if model == "" || model == config.OpenRouterImageModel {
		return config.DefaultImageModel
	}
	return model
}

type providerAttempt struct {
	Provider string
	APIKey   string
}

type providerFailure struct {
	Provider string
	Err      error
}

type providerFallbackError struct {
	Failures []providerFailure
}

func (e providerFallbackError) Error() string {
	if len(e.Failures) == 0 {
		return "no configured provider api keys"
	}
	parts := make([]string, 0, len(e.Failures))
	for _, failure := range e.Failures {
		parts = append(parts, fmt.Sprintf("%s: %s", failure.Provider, failure.Err.Error()))
	}
	return "all configured providers failed: " + strings.Join(parts, "; ")
}

func (c *OpenAIClient) providerAttempts(hasReferenceImages bool) []providerAttempt {
	keys := make(map[string]string, len(c.providerAPIKeys)+1)
	for provider, apiKey := range c.providerAPIKeys {
		provider = normalizeClientProvider(provider)
		apiKey = strings.TrimSpace(apiKey)
		if apiKey == "" {
			continue
		}
		keys[provider] = apiKey
	}
	if c.apiKey != "" {
		if _, exists := keys[c.provider]; !exists {
			keys[c.provider] = c.apiKey
		}
	}

	order := []string{c.provider}
	for _, provider := range []string{config.ProviderCodesOnline, config.ProviderOpenRouter, config.ProviderBLT} {
		if provider != c.provider {
			order = append(order, provider)
		}
	}

	attempts := make([]providerAttempt, 0, len(order))
	seen := map[string]struct{}{}
	for _, provider := range order {
		provider = normalizeClientProvider(provider)
		if _, ok := seen[provider]; ok {
			continue
		}
		seen[provider] = struct{}{}
		if hasReferenceImages && provider == config.ProviderOpenRouter {
			continue
		}
		apiKey := strings.TrimSpace(keys[provider])
		if apiKey == "" {
			continue
		}
		attempts = append(attempts, providerAttempt{Provider: provider, APIKey: apiKey})
	}
	return attempts
}

func (c *OpenAIClient) withProvider(provider, apiKey string) *OpenAIClient {
	next := *c
	next.provider = normalizeClientProvider(provider)
	next.apiKey = strings.TrimSpace(apiKey)
	if baseURL := strings.TrimSpace(c.baseURLs[next.provider]); baseURL != "" {
		next.baseURL = strings.TrimSuffix(baseURL, "/")
	} else {
		next.baseURL = strings.TrimSuffix(configBaseURLForProvider(next.provider), "/")
	}
	return &next
}

func normalizeClientProvider(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case config.ProviderOpenRouter:
		return config.ProviderOpenRouter
	case config.ProviderBLT:
		return config.ProviderBLT
	default:
		return config.ProviderCodesOnline
	}
}

func configBaseURLForProvider(provider string) string {
	switch normalizeClientProvider(provider) {
	case config.ProviderOpenRouter:
		return config.OpenRouterBaseURL
	case config.ProviderBLT:
		return config.BLTBaseURL
	default:
		return config.DefaultBaseURL
	}
}

func (c *OpenAIClient) EditImages(ctx context.Context, prompt, model string, n int, size, quality, style, upscale, background, responseFormat string, referenceImages [][]byte) (*ImageGenerationResponse, error) {
	if c.provider == config.ProviderOpenRouter {
		return nil, fmt.Errorf("openrouter image generation does not support reference_images")
	}
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
	if style != "" {
		fields["style"] = style
	}
	if upscale != "" {
		fields["upscale"] = upscale
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
	req.Header.Set("Content-Type", writer.FormDataContentType())
	contentType := req.Header.Get("Content-Type")
	respBody, err := c.doUpstreamRequestWithRetry(ctx, req, body.Bytes(), func(next *http.Request) {
		c.setBaseHeaders(next)
		next.Header.Set("Content-Type", contentType)
	}, "image edit")
	if err != nil {
		return nil, err
	}

	var result ImageGenerationResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &result, nil
}

func (c *OpenAIClient) generateImagesViaOpenRouter(ctx context.Context, prompt, model string, n int, size, responseFormat string) (*ImageGenerationResponse, error) {
	body := map[string]any{
		"model":      model,
		"modalities": []string{"image", "text"},
		"messages": []map[string]any{
			{
				"role":    "user",
				"content": buildOpenRouterPrompt(prompt, size),
			},
		},
	}
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal openrouter request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create openrouter request: %w", err)
	}
	respBody, err := c.doUpstreamRequestWithRetry(ctx, req, jsonBody, c.setJSONHeaders, "image generation")
	if err != nil {
		return nil, err
	}
	return parseOpenRouterImageResponse(respBody, responseFormat, n)
}

func buildOpenRouterPrompt(prompt, size string) string {
	prompt = strings.TrimSpace(prompt)
	size = strings.TrimSpace(size)
	if prompt == "" || size == "" {
		return prompt
	}
	return fmt.Sprintf("%s\n\nTarget image size: %s", prompt, size)
}

func parseOpenRouterImageResponse(respBody []byte, responseFormat string, requestedCount int) (*ImageGenerationResponse, error) {
	var upstream struct {
		Created int `json:"created"`
		Choices []struct {
			Message struct {
				Images []struct {
					ImageURL struct {
						URL string `json:"url"`
					} `json:"image_url"`
					ImageURLCamel struct {
						URL string `json:"url"`
					} `json:"imageUrl"`
				} `json:"images"`
				Content []struct {
					Type          string `json:"type"`
					ImageURL      string `json:"image_url"`
					ImageURLCamel string `json:"imageUrl"`
					Text          string `json:"text"`
				} `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &upstream); err != nil {
		return nil, fmt.Errorf("decode openrouter response: %w", err)
	}
	result := &ImageGenerationResponse{
		Created: upstream.Created,
		Data:    make([]ImageData, 0, requestedCount),
	}
	for _, choice := range upstream.Choices {
		for _, image := range choice.Message.Images {
			rawURL := strings.TrimSpace(image.ImageURL.URL)
			if rawURL == "" {
				rawURL = strings.TrimSpace(image.ImageURLCamel.URL)
			}
			imageData, err := openRouterImageDataToResult(rawURL, responseFormat)
			if err != nil {
				return nil, err
			}
			result.Data = append(result.Data, imageData)
			if requestedCount > 0 && len(result.Data) >= requestedCount {
				return result, nil
			}
		}
		for _, content := range choice.Message.Content {
			rawURL := strings.TrimSpace(content.ImageURL)
			if rawURL == "" {
				rawURL = strings.TrimSpace(content.ImageURLCamel)
			}
			if rawURL == "" {
				continue
			}
			imageData, err := openRouterImageDataToResult(rawURL, responseFormat)
			if err != nil {
				return nil, err
			}
			result.Data = append(result.Data, imageData)
			if requestedCount > 0 && len(result.Data) >= requestedCount {
				return result, nil
			}
		}
	}
	if result.Created == 0 {
		result.Created = int(time.Now().Unix())
	}
	if len(result.Data) == 0 {
		return nil, fmt.Errorf("openrouter response did not include any images")
	}
	return result, nil
}

func openRouterImageDataToResult(rawURL, responseFormat string) (ImageData, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ImageData{}, fmt.Errorf("openrouter response included an empty image url")
	}
	if responseFormat == "b64_json" {
		encoded, ok := extractDataURLBase64(rawURL)
		if !ok {
			return ImageData{}, fmt.Errorf("openrouter response image was not a base64 data url")
		}
		return ImageData{B64JSON: encoded}, nil
	}
	return ImageData{URL: rawURL}, nil
}

func extractDataURLBase64(value string) (string, bool) {
	if !strings.HasPrefix(value, "data:") {
		return "", false
	}
	index := strings.Index(value, ",")
	if index < 0 {
		return "", false
	}
	meta := value[:index]
	if !strings.Contains(strings.ToLower(meta), ";base64") {
		return "", false
	}
	return strings.TrimSpace(value[index+1:]), true
}

func (c *OpenAIClient) doUpstreamRequestWithRetry(ctx context.Context, baseReq *http.Request, body []byte, setHeaders func(*http.Request), operation string) ([]byte, error) {
	var lastErr error
	for attempt := 0; attempt <= maxUpstreamRateLimitRetries; attempt += 1 {
		if err := acquireUpstreamRequestSlot(ctx); err != nil {
			return nil, err
		}

		req, err := http.NewRequestWithContext(ctx, baseReq.Method, baseReq.URL.String(), bytes.NewReader(body))
		if err != nil {
			releaseUpstreamRequestSlot()
			return nil, fmt.Errorf("create request: %w", err)
		}
		setHeaders(req)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("request failed: %w", err)
			if !isRetriableUpstreamRequestError(err) || attempt == maxUpstreamRateLimitRetries {
				releaseUpstreamRequestSlot()
				return nil, lastErr
			}
			if err := waitForUpstreamRetry(ctx, transientRequestRetryDelay(attempt)); err != nil {
				releaseUpstreamRequestSlot()
				return nil, err
			}
			releaseUpstreamRequestSlot()
			continue
		}

		respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
		_ = resp.Body.Close()
		if readErr != nil {
			releaseUpstreamRequestSlot()
			return nil, fmt.Errorf("read response: %w", readErr)
		}

		if resp.StatusCode == http.StatusOK {
			if normalizedBody, ok := normalizeUpstreamJSONResponse(respBody); ok {
				releaseUpstreamRequestSlot()
				return normalizedBody, nil
			}
			lastErr = &UpstreamAPIError{Operation: operation, Endpoint: req.URL.Path, StatusCode: resp.StatusCode, Body: invalidUpstreamJSONMessage(respBody)}
			if attempt == maxUpstreamRateLimitRetries {
				releaseUpstreamRequestSlot()
				return nil, lastErr
			}
			if err := waitForUpstreamRetry(ctx, retryDelayFromHeader(resp.Header.Get("Retry-After"), attempt)); err != nil {
				releaseUpstreamRequestSlot()
				return nil, err
			}
			releaseUpstreamRequestSlot()
			continue
		}

		lastErr = &UpstreamAPIError{Operation: operation, Endpoint: req.URL.Path, StatusCode: resp.StatusCode, Body: string(respBody)}
		if !shouldRetryUpstreamResponse(resp.StatusCode, respBody) || attempt == maxUpstreamRateLimitRetries {
			releaseUpstreamRequestSlot()
			return nil, lastErr
		}
		if err := waitForUpstreamRetry(ctx, retryDelayFromHeader(resp.Header.Get("Retry-After"), attempt)); err != nil {
			releaseUpstreamRequestSlot()
			return nil, err
		}
		releaseUpstreamRequestSlot()
	}

	return nil, lastErr
}

func shouldRetryUpstreamResponse(statusCode int, body []byte) bool {
	if statusCode == http.StatusTooManyRequests {
		return true
	}
	if statusCode != http.StatusGatewayTimeout {
		return false
	}
	lowerBody := strings.ToLower(string(body))
	return strings.Contains(lowerBody, "poll_timeout") || strings.Contains(lowerBody, "poll timeout")
}

func normalizeUpstreamJSONResponse(body []byte) ([]byte, bool) {
	cleaned := cleanUpstreamResponseBytes(body)
	if len(cleaned) == 0 {
		return nil, false
	}
	if json.Valid(cleaned) {
		return cleaned, true
	}
	if doc, ok := extractFirstValidJSONDocument(cleaned); ok {
		return doc, true
	}
	return nil, false
}

func cleanUpstreamResponseBytes(body []byte) []byte {
	cleaned := bytes.TrimSpace(body)
	cleaned = bytes.TrimPrefix(cleaned, []byte{0xef, 0xbb, 0xbf})
	cleaned = bytes.ReplaceAll(cleaned, []byte{0}, nil)
	return bytes.TrimSpace(cleaned)
}

func extractFirstValidJSONDocument(body []byte) ([]byte, bool) {
	for start, b := range body {
		if b != '{' && b != '[' {
			continue
		}
		if doc, ok := extractJSONDocumentAt(body, start); ok && json.Valid(doc) {
			return doc, true
		}
	}
	return nil, false
}

func extractJSONDocumentAt(body []byte, start int) ([]byte, bool) {
	stack := make([]byte, 0, 8)
	inString := false
	escaped := false
	for i := start; i < len(body); i++ {
		b := body[i]
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if b == '\\' {
				escaped = true
				continue
			}
			if b == '"' {
				inString = false
			}
			continue
		}

		switch b {
		case '"':
			inString = true
		case '{':
			stack = append(stack, '}')
		case '[':
			stack = append(stack, ']')
		case '}', ']':
			if len(stack) == 0 || stack[len(stack)-1] != b {
				return nil, false
			}
			stack = stack[:len(stack)-1]
			if len(stack) == 0 {
				return bytes.TrimSpace(body[start : i+1]), true
			}
		}
	}
	return nil, false
}

func invalidUpstreamJSONMessage(body []byte) string {
	if len(bytes.TrimSpace(body)) == 0 {
		return upstreamEmptyResponseMessage
	}
	return upstreamInvalidJSONResponseMessage
}

func isRetriableUpstreamRequestError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return true
	}
	message := strings.ToLower(err.Error())
	for _, marker := range []string{
		"eof",
		"connection reset",
		"connection refused",
		"broken pipe",
		"server closed idle connection",
		"use of closed network connection",
		"client connection lost",
		"stream error",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}

func transientRequestRetryDelay(attempt int) time.Duration {
	return time.Duration(500+attempt*500) * time.Millisecond
}

func acquireUpstreamRequestSlot(ctx context.Context) error {
	select {
	case upstreamRequestGate <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func releaseUpstreamRequestSlot() {
	<-upstreamRequestGate
}

func retryDelayFromHeader(retryAfter string, attempt int) time.Duration {
	if seconds, err := strconv.Atoi(strings.TrimSpace(retryAfter)); err == nil && seconds >= 0 {
		return time.Duration(seconds) * time.Second
	}
	return time.Duration(2+attempt*3) * time.Second
}

func waitForUpstreamRetry(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
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

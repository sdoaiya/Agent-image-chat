package config

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"

	"github.com/BurntSushi/toml"
)

const (
	userConfigFile = "config.toml"
	dataDirName    = "data"

	DefaultBaseURL        = "https://image.codesonline.dev"
	DefaultImageModel     = "gpt-image-2"
	DefaultRequestTimeout = 300
	LegacyMiniModel       = "gpt-5.4-mini"
)

type Capabilities struct {
	SupportsGenerate       bool     `json:"supportsGenerate"`
	SupportsEdit           bool     `json:"supportsEdit"`
	SupportsUpscale        bool     `json:"supportsUpscale"`
	Resolutions            []string `json:"resolutions"`
	UpscaleFactors         []string `json:"upscaleFactors"`
	MaxReferenceImages     int      `json:"maxReferenceImages"`
	SupportsMask           bool     `json:"supportsMask"`
	SupportsMultiReference bool     `json:"supportsMultiImageReference"`
}

type AppConfig struct {
	APIKey      string `toml:"api_key" json:"apiKey"`
	BaseURL     string `toml:"base_url" json:"baseUrl"`
	ImageFormat string `toml:"image_format" json:"imageFormat"`
	AuthKey     string `toml:"auth_key" json:"authKey"`
}

type ServerConfig struct {
	Host string `toml:"host" json:"host"`
	Port int    `toml:"port" json:"port"`
}

type ChatGPTConfig struct {
	Model           string   `toml:"model" json:"model"`
	SSETimeout      int      `toml:"sse_timeout" json:"sseTimeout"`
	RequestTimeout  int      `toml:"request_timeout" json:"requestTimeout"`
	AvailableModels []string `toml:"available_models" json:"availableModels"`
}

type ProxyConfig struct {
	Enabled bool   `toml:"enabled" json:"enabled"`
	URL     string `toml:"url" json:"url"`
}

type Config struct {
	mu             sync.RWMutex `toml:"-" json:"-"`
	loadMu         sync.Mutex   `toml:"-" json:"-"`
	loaded         bool         `toml:"-" json:"-"`
	configFilePath string       `toml:"-" json:"-"`

	App     AppConfig     `toml:"app" json:"app"`
	Server  ServerConfig  `toml:"server" json:"server"`
	ChatGPT ChatGPTConfig `toml:"chatgpt" json:"chatgpt"`
	Proxy   ProxyConfig   `toml:"proxy" json:"proxy"`
}

func New() *Config {
	return &Config{}
}

func (c *Config) Load(configPath string) error {
	c.loadMu.Lock()
	defer c.loadMu.Unlock()

	next := &Config{}
	if err := decodeDefaultTemplate(next); err != nil {
		return fmt.Errorf("decode embedded defaults: %w", err)
	}
	if configPath != "" && fileExists(configPath) {
		if err := decodeOverrideFile(configPath, next); err != nil {
			return fmt.Errorf("decode override: %w", err)
		}
	}
	next.migrateLegacyModels()
	if err := next.validate(); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.copyFrom(next)
	c.loaded = true
	return nil
}

func (c *Config) SaveOverride(section, key string, value any) error {
	return c.SaveOverrides(map[string]map[string]any{
		section: {key: value},
	})
}

func (c *Config) SaveOverrides(values map[string]map[string]any) error {
	c.loadMu.Lock()

	c.mu.Lock()
	configPath := c.configFilePath
	c.mu.Unlock()

	raw := map[string]any{}
	if configPath != "" && fileExists(configPath) {
		if _, err := toml.DecodeFile(configPath, &raw); err != nil {
			c.loadMu.Unlock()
			return fmt.Errorf("read override: %w", err)
		}
	}
	for section, entries := range values {
		sec, ok := raw[section].(map[string]any)
		if !ok {
			sec = map[string]any{}
		}
		for key, value := range entries {
			sec[key] = value
		}
		raw[section] = sec
	}
	normalized, err := normalizeOverrideMapForSave(raw)
	if err != nil {
		c.loadMu.Unlock()
		return err
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		c.loadMu.Unlock()
		return fmt.Errorf("create config dir: %w", err)
	}
	f, err := os.Create(configPath)
	if err != nil {
		c.loadMu.Unlock()
		return fmt.Errorf("create override file: %w", err)
	}
	defer f.Close()
	if err := toml.NewEncoder(f).Encode(normalized); err != nil {
		c.loadMu.Unlock()
		return fmt.Errorf("encode override: %w", err)
	}
	c.loadMu.Unlock()
	return c.Load(configPath)
}

func (c *Config) ProxyURL() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if !c.Proxy.Enabled {
		return ""
	}
	return strings.TrimSpace(c.Proxy.URL)
}

func (c *Config) normalizeInPlace() {
	c.App.BaseURL = normalizeBaseURL(c.App.BaseURL)
	c.App.ImageFormat = normalizeImageFormat(c.App.ImageFormat)
	c.ChatGPT.Model = normalizePrimaryModel(c.ChatGPT.Model, c.ChatGPT.AvailableModels)
	c.ChatGPT.AvailableModels = normalizeAvailableModels(c.ChatGPT.AvailableModels, c.ChatGPT.Model)
	c.ChatGPT.RequestTimeout = normalizeRequestTimeout(c.ChatGPT.RequestTimeout)
}

func normalizeBaseURL(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return DefaultBaseURL
	}
	return strings.TrimRight(trimmed, "/")
}

func normalizeImageFormat(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "b64_json") {
		return "b64_json"
	}
	return "url"
}

func normalizeRequestTimeout(value int) int {
	if value >= DefaultRequestTimeout {
		return value
	}
	return DefaultRequestTimeout
}

func normalizeAvailableModels(models []string, primary string) []string {
	seen := make(map[string]struct{})
	result := make([]string, 0, len(models)+1)
	for _, candidate := range append([]string{primary}, models...) {
		normalized := NormalizeImageModel(candidate)
		if normalized == "" {
			continue
		}
		key := strings.ToLower(normalized)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, normalized)
	}
	if len(result) == 0 {
		return []string{DefaultImageModel}
	}
	return result
}

func normalizePrimaryModel(model string, fallbacks []string) string {
	normalized := NormalizeImageModel(model)
	if normalized != "" {
		return normalized
	}
	for _, fallback := range fallbacks {
		if normalized = NormalizeImageModel(fallback); normalized != "" {
			return normalized
		}
	}
	return DefaultImageModel
}

func normalizeLegacyImageModel(model string) string {
	normalized := NormalizeImageModel(model)
	if normalized == "" {
		return ""
	}
	return normalized
}

func (c *Config) GetAPIKey() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return strings.TrimSpace(c.App.APIKey)
}

func (c *Config) GetBaseURL() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return normalizeBaseURL(c.App.BaseURL)
}

func (c *Config) GetAuthKey() string {
	if runtimeAuthKey := strings.TrimSpace(os.Getenv("GIMG_AUTH_KEY")); runtimeAuthKey != "" {
		return runtimeAuthKey
	}
	return ""
}

func (c *Config) GetSSETimeout() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.ChatGPT.SSETimeout > 0 {
		return c.ChatGPT.SSETimeout
	}
	return 300
}

func (c *Config) GetRequestTimeout() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.ChatGPT.RequestTimeout >= DefaultRequestTimeout {
		return c.ChatGPT.RequestTimeout
	}
	return DefaultRequestTimeout
}

func (c *Config) GetModel() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return normalizePrimaryModel(c.ChatGPT.Model, c.ChatGPT.AvailableModels)
}

func (c *Config) GetAvailableModels() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	models := normalizeAvailableModels(c.ChatGPT.AvailableModels, c.ChatGPT.Model)
	return append([]string(nil), models...)
}

func (c *Config) GetCapabilities() Capabilities {
	return Capabilities{
		SupportsGenerate:       true,
		SupportsEdit:           true,
		SupportsUpscale:        false,
		Resolutions:            []string{"1024x1024", "1024x1536", "1536x1024"},
		UpscaleFactors:         []string{},
		MaxReferenceImages:     4,
		SupportsMask:           false,
		SupportsMultiReference: true,
	}
}

func NormalizeImageModel(model string) string {
	trimmed := strings.TrimSpace(model)
	switch trimmed {
	case "":
		return ""
	case LegacyMiniModel, "gpt-5.4", "gpt-image-1", "gpt-4.1":
		return DefaultImageModel
	default:
		return trimmed
	}
}

func (c *Config) migrateLegacyModels() {
	c.ChatGPT.Model = normalizePrimaryModel(c.ChatGPT.Model, c.ChatGPT.AvailableModels)
	c.ChatGPT.AvailableModels = normalizeAvailableModels(c.ChatGPT.AvailableModels, c.ChatGPT.Model)
	c.normalizeInPlace()
}

func (c *Config) SetConfigFilePath(path string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.configFilePath = path
}

func (c *Config) copyFrom(other *Config) {
	c.App = other.App
	c.Server = other.Server
	c.ChatGPT = other.ChatGPT
	c.Proxy = other.Proxy
}

func (c *Config) validate() error {
	if !c.Proxy.Enabled {
		return nil
	}
	if strings.TrimSpace(c.Proxy.URL) == "" {
		return fmt.Errorf("proxy.url is required when proxy.enabled = true")
	}
	return nil
}

func EnsureConfigDir(dataDir string) (string, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return "", fmt.Errorf("create data dir: %w", err)
	}
	configPath := filepath.Join(dataDir, userConfigFile)
	if !fileExists(configPath) {
		if err := os.WriteFile(configPath, []byte(defaultConfigTemplate), 0o644); err != nil {
			return "", fmt.Errorf("write default config: %w", err)
		}
	}
	return configPath, nil
}

func decodeOverrideFile(path string, target *Config) error {
	raw := map[string]any{}
	if _, err := toml.DecodeFile(path, &raw); err != nil {
		return err
	}
	migrateLegacyOverrideMap(raw)
	return applyOverrideMap(reflect.ValueOf(target).Elem(), raw)
}

func decodeDefaultTemplate(target *Config) error {
	_, err := toml.Decode(defaultConfigTemplate, target)
	return err
}

func normalizeOverrideMapForSave(raw map[string]any) (*Config, error) {
	migrateLegacyOverrideMap(raw)

	normalized := &Config{}
	if err := decodeDefaultTemplate(normalized); err != nil {
		return nil, fmt.Errorf("decode embedded defaults: %w", err)
	}
	if err := applyOverrideMap(reflect.ValueOf(normalized).Elem(), raw); err != nil {
		return nil, err
	}
	normalized.migrateLegacyModels()
	if err := normalized.validate(); err != nil {
		return nil, err
	}
	return normalized, nil
}

func migrateLegacyOverrideMap(raw map[string]any) {
	app, _ := raw["app"].(map[string]any)
	if app == nil {
		app = map[string]any{}
		raw["app"] = app
	}
	if baseURL, ok := app["base_url"].(string); !ok || strings.TrimSpace(baseURL) == "" || strings.TrimRight(strings.TrimSpace(baseURL), "/") == "https://api.openai.com" {
		app["base_url"] = DefaultBaseURL
	}
	if imageFormat, ok := app["image_format"].(string); !ok || strings.TrimSpace(imageFormat) == "" {
		app["image_format"] = "url"
	}
	app["auth_key"] = ""
	delete(app, "account_id")

	chatgpt, _ := raw["chatgpt"].(map[string]any)
	if chatgpt == nil {
		chatgpt = map[string]any{}
		raw["chatgpt"] = chatgpt
	}

	modelCandidates := make([]string, 0, 4)
	for _, key := range []string{"model", "free_image_model", "paid_image_model"} {
		if value, ok := chatgpt[key].(string); ok {
			modelCandidates = append(modelCandidates, value)
		}
	}
	primaryModel := ""
	for _, candidate := range modelCandidates {
		if normalized := normalizeLegacyImageModel(candidate); normalized != "" {
			primaryModel = normalized
			break
		}
	}
	if primaryModel == "" {
		primaryModel = DefaultImageModel
	}
	chatgpt["model"] = primaryModel

	available := collectLegacyAvailableModels(chatgpt, primaryModel)
	chatgpt["available_models"] = available
	delete(chatgpt, "free_image_route")
	delete(chatgpt, "paid_image_route")
	delete(chatgpt, "free_image_model")
	delete(chatgpt, "paid_image_model")

	if proxy, ok := raw["proxy"].(map[string]any); ok {
		delete(proxy, "mode")
	}
}

func collectLegacyAvailableModels(chatgpt map[string]any, primaryModel string) []string {
	values := make([]string, 0, 4)
	values = append(values, primaryModel)
	if rawModels, ok := chatgpt["available_models"].([]any); ok {
		for _, item := range rawModels {
			if text, ok := item.(string); ok {
				values = append(values, text)
			}
		}
	}
	for _, key := range []string{"model", "free_image_model", "paid_image_model"} {
		if text, ok := chatgpt[key].(string); ok {
			values = append(values, text)
		}
	}
	return normalizeAvailableModels(values, primaryModel)
}

func applyOverrideMap(dst reflect.Value, raw map[string]any) error {
	for key, value := range raw {
		field, ok := structFieldByTOMLTag(dst, key)
		if !ok {
			continue
		}
		if err := setOverrideValue(field, value); err != nil {
			return err
		}
	}
	return nil
}

func setOverrideValue(dst reflect.Value, raw any) error {
	if !dst.CanSet() {
		return nil
	}
	dst = indirectValue(dst)
	if !dst.IsValid() {
		return nil
	}
	switch dst.Kind() {
	case reflect.Struct:
		nested, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("expected table, got %T", raw)
		}
		return applyOverrideMap(dst, nested)
	case reflect.String:
		text, ok := raw.(string)
		if !ok {
			return fmt.Errorf("expected string, got %T", raw)
		}
		dst.SetString(text)
	case reflect.Bool:
		flag, ok := raw.(bool)
		if !ok {
			return fmt.Errorf("expected bool, got %T", raw)
		}
		dst.SetBool(flag)
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		switch n := raw.(type) {
		case int64:
			dst.SetInt(n)
		case int:
			dst.SetInt(int64(n))
		case float64:
			dst.SetInt(int64(n))
		default:
			return fmt.Errorf("expected int, got %T", raw)
		}
	default:
		value := reflect.ValueOf(raw)
		if value.IsValid() && value.Type().AssignableTo(dst.Type()) {
			dst.Set(value)
			return nil
		}
		return fmt.Errorf("unsupported type %s", dst.Type())
	}
	return nil
}

func structFieldByTOMLTag(value reflect.Value, part string) (reflect.Value, bool) {
	valueType := value.Type()
	for i := 0; i < value.NumField(); i++ {
		fieldType := valueType.Field(i)
		if !fieldType.IsExported() {
			continue
		}
		tag := strings.Split(fieldType.Tag.Get("toml"), ",")[0]
		if tag == "-" {
			continue
		}
		if tag == "" {
			tag = strings.ToLower(fieldType.Name)
		}
		if tag == part {
			return value.Field(i), true
		}
	}
	return reflect.Value{}, false
}

func indirectValue(value reflect.Value) reflect.Value {
	for value.IsValid() && (value.Kind() == reflect.Pointer || value.Kind() == reflect.Interface) {
		if value.IsNil() {
			return reflect.Value{}
		}
		value = value.Elem()
	}
	return value
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

//go:embed config.defaults.toml
var defaultConfigTemplate string

func DefaultTemplate() string {
	return defaultConfigTemplate
}

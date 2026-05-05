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

	DefaultImageModel = "gpt-image-2"
	LegacyImageModel1 = "gpt-5.4"
	LegacyMiniModel   = "gpt-5.4-mini"
	LegacyImageModel2 = "gpt-image-1"
	DefaultBaseURL    = "https://image.codesonline.dev/v1"
)

type Capabilities struct {
	SupportsGenerate       bool     `json:"supportsGenerate"`
	SupportsEdit           bool     `json:"supportsEdit"`
	Resolutions            []string `json:"resolutions"`
	MaxReferenceImages     int      `json:"maxReferenceImages"`
	SupportsMultiReference bool     `json:"supportsMultiImageReference"`
}

type AppConfig struct {
	APIKey          string `toml:"api_key" json:"apiKey"`
	APIMode         string `toml:"api_mode" json:"apiMode"`
	BaseURL         string `toml:"base_url" json:"baseUrl"`
	LegacyAccountID string `toml:"account_id" json:"-"`
	ImageFormat     string `toml:"image_format" json:"imageFormat"`
	AuthKey         string `toml:"auth_key" json:"authKey"`
}

type ServerConfig struct {
	Host string `toml:"host" json:"host"`
	Port int    `toml:"port" json:"port"`
}

type ChatGPTConfig struct {
	Model            string `toml:"model" json:"model"`
	SSETimeout       int    `toml:"sse_timeout" json:"sseTimeout"`
	RequestTimeout   int    `toml:"request_timeout" json:"requestTimeout"`
	LegacyFreeRoute  string `toml:"free_image_route" json:"-"`
	LegacyPaidRoute  string `toml:"paid_image_route" json:"-"`
	LegacyFreeModel  string `toml:"free_image_model" json:"-"`
	LegacyPaidModel  string `toml:"paid_image_model" json:"-"`
}

type ProxyConfig struct {
	Enabled bool   `toml:"enabled" json:"enabled"`
	URL     string `toml:"url" json:"url"`
	Mode    string `toml:"mode" json:"mode"`
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
	scrubLegacyOverrideKeys(raw)
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
	if err := toml.NewEncoder(f).Encode(raw); err != nil {
		c.loadMu.Unlock()
		return fmt.Errorf("encode override: %w", err)
	}
	c.loadMu.Unlock()
	return c.Load(configPath)
}

func (c *Config) GetAPIMode() string {
	return "codesonline"
}

func (c *Config) IsOpenAIMode() bool {
	return true
}

func (c *Config) IsCodexMode() bool {
	return false
}

func (c *Config) ProxyURL() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if !c.Proxy.Enabled {
		return ""
	}
	return strings.TrimSpace(c.Proxy.URL)
}

func (c *Config) GetAPIKey() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return strings.TrimSpace(c.App.APIKey)
}



func (c *Config) GetBaseURL() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	trimmed := strings.TrimSpace(c.App.BaseURL)
	if trimmed == "" {
		return DefaultBaseURL
	}
	return strings.TrimRight(trimmed, "/")
}

func (c *Config) GetAuthKey() string {
	return strings.TrimSpace(os.Getenv("GIMG_AUTH_KEY"))
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
	if c.ChatGPT.RequestTimeout > 0 {
		return c.ChatGPT.RequestTimeout
	}
	return 300
}

func (c *Config) GetModel() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if trimmed := NormalizeImageModel(c.ChatGPT.Model); trimmed != "" {
		return trimmed
	}
	return DefaultImageModel
}

func (c *Config) GetCapabilities() Capabilities {
	return Capabilities{
		SupportsGenerate:       true,
		SupportsEdit:           true,
		Resolutions:            []string{"1024x1024", "1024x1536", "1536x1024"},
		MaxReferenceImages:     4,
		SupportsMultiReference: true,
	}
}

func NormalizeImageModel(model string) string {
	trimmed := strings.TrimSpace(model)
	switch trimmed {
	case "":
		return ""
	case LegacyMiniModel, LegacyImageModel1, LegacyImageModel2:
		return DefaultImageModel
	default:
		return trimmed
	}
}

func (c *Config) migrateLegacyModels() {
	if normalized := NormalizeImageModel(c.ChatGPT.Model); normalized != "" {
		c.ChatGPT.Model = normalized
	} else if normalized = NormalizeImageModel(c.ChatGPT.LegacyFreeModel); normalized != "" {
		c.ChatGPT.Model = normalized
	} else if normalized = NormalizeImageModel(c.ChatGPT.LegacyPaidModel); normalized != "" {
		c.ChatGPT.Model = normalized
	}
	if strings.TrimSpace(c.App.APIMode) == "" || strings.EqualFold(strings.TrimSpace(c.App.APIMode), "openai") || strings.EqualFold(strings.TrimSpace(c.App.APIMode), "codex") || strings.EqualFold(strings.TrimSpace(c.App.APIMode), "auto") {
		c.App.APIMode = "codesonline"
	}
	if strings.TrimSpace(c.App.BaseURL) == "" || strings.EqualFold(strings.TrimSpace(c.App.BaseURL), "https://api.openai.com") || strings.EqualFold(strings.TrimSpace(c.App.BaseURL), "https://mx.free.codesonline.dev") {
		c.App.BaseURL = DefaultBaseURL
	}
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
	return applyOverrideMap(reflect.ValueOf(target).Elem(), raw)
}

func decodeDefaultTemplate(target *Config) error {
	_, err := toml.Decode(defaultConfigTemplate, target)
	return err
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

func scrubLegacyOverrideKeys(raw map[string]any) {
	deleteNestedKeys(raw, "app", "account_id", "auth_key")
	deleteNestedKeys(raw, "chatgpt", "free_image_route", "paid_image_route", "free_image_model", "paid_image_model")
}

func deleteNestedKeys(raw map[string]any, section string, keys ...string) {
	value, ok := raw[section]
	if !ok {
		return
	}
	sec, ok := value.(map[string]any)
	if !ok {
		return
	}
	for _, key := range keys {
		delete(sec, key)
	}
	if len(sec) == 0 {
		delete(raw, section)
		return
	}
	raw[section] = sec
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

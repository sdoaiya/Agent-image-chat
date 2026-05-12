package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadInfersBLTProviderFromBaseURL(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.toml")
	content := `[app]
provider = "codesonline"
api_key = "sk-test"
base_url = "https://api.bltcy.ai"
image_format = "url"
auth_key = ""

[server]
host = "0.0.0.0"
port = 8080

[chatgpt]
model = "gpt-image-2"
sse_timeout = 300
request_timeout = 900
available_models = ["gpt-image-2"]

[proxy]
enabled = false
url = ""
`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	var cfg Config
	if err := cfg.Load(configPath); err != nil {
		t.Fatal(err)
	}
	if got := cfg.GetProvider(); got != ProviderBLT {
		t.Fatalf("provider = %q, want %q", got, ProviderBLT)
	}
	if got := cfg.GetBaseURL(); got != BLTBaseURL {
		t.Fatalf("base URL = %q, want %q", got, BLTBaseURL)
	}
}

func TestLoadMigratesLegacyAPIKeyIntoProviderAPIKeys(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.toml")
	content := `[app]
provider = "openrouter"
api_key = "sk-legacy"
base_url = "https://openrouter.ai/api/v1"
image_format = "url"
auth_key = ""

[server]
host = "0.0.0.0"
port = 8080

[chatgpt]
model = "openai/gpt-5.4-image-2"
sse_timeout = 300
request_timeout = 900
available_models = ["openai/gpt-5.4-image-2"]

[proxy]
enabled = false
url = ""
`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	var cfg Config
	if err := cfg.Load(configPath); err != nil {
		t.Fatal(err)
	}

	keys := cfg.GetConfiguredProviderKeys()
	if got := keys[ProviderOpenRouter]; got != "sk-legacy" {
		t.Fatalf("openrouter provider key = %q, want sk-legacy", got)
	}
	if got := cfg.GetAPIKey(); got != "sk-legacy" {
		t.Fatalf("current api key = %q, want sk-legacy", got)
	}
}

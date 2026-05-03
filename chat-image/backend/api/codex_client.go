package api

import (
	"context"
	"fmt"
)

type CodexClient struct{}

func NewCodexClient(any) *CodexClient {
	return &CodexClient{}
}

func (c *CodexClient) GenerateImages(ctx context.Context, prompt, model string, n int, size, quality, background, outputFormat string) (*ImageGenerationResponse, error) {
	return nil, fmt.Errorf("codex backend has been removed; use the single /images/generations backend")
}

func (c *CodexClient) EditImage(ctx context.Context, prompt, model string, images [][]byte, mask []byte, outputFormat string) (*ImageGenerationResponse, error) {
	return nil, fmt.Errorf("codex backend has been removed; use the single /images/generations backend")
}

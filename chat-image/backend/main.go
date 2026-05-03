package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"gimg/api"
	"gimg/internal/config"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	dataDir := resolveDataDir()
	resourceDir := resolveResourceDir()
	configPath, err := config.EnsureConfigDir(dataDir)
	if err != nil {
		slog.Error("failed to ensure config directory", slog.Any("error", err), slog.String("data_dir", dataDir))
		os.Exit(1)
	}

	cfg := config.New()
	cfg.SetConfigFilePath(configPath)

	if err := cfg.Load(configPath); err != nil {
		slog.Error("failed to load config", slog.Any("error", err), slog.String("config_path", configPath))
		os.Exit(1)
	}

	host := envString("GIMG_HOST", cfg.Server.Host)
	port := envInt("GIMG_PORT", cfg.Server.Port)
	addr := net.JoinHostPort(host, strconv.Itoa(port))

	server := api.NewServer(cfg)
	imageHandler := api.NewImageHandler(cfg)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", server.HandleHealth)
	mux.HandleFunc("GET /v1/models", server.HandleModels)
	mux.HandleFunc("GET /api/config", server.HandleGetConfig)
	mux.HandleFunc("PUT /api/config", server.HandleUpdateConfig)
	mux.Handle("POST /v1/images/generations", server.RequireAuth(http.HandlerFunc(imageHandler.HandleImageGenerations)))
	mux.Handle("POST /v1/chat/completions", server.RequireAuth(http.HandlerFunc(imageHandler.HandleChatCompletions)))
	mux.Handle("POST /v1/responses", server.RequireAuth(http.HandlerFunc(imageHandler.HandleResponses)))

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           corsMiddleware(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		if isAddressInUseError(err) {
			slog.Error("port in use", slog.String("addr", addr), slog.Any("error", err))
			os.Exit(1)
		}
		slog.Error("failed to start server", slog.Any("error", err))
		os.Exit(1)
	}

	slog.Info(
		"gimg server listening",
		slog.String("addr", addr),
		slog.String("data_dir", dataDir),
		slog.String("resource_dir", resourceDir),
		slog.String("config_path", configPath),
	)

	errCh := make(chan error, 1)
	go func() {
		if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	select {
	case err := <-errCh:
		if isAddressInUseError(err) {
			slog.Error("port in use", slog.String("addr", addr), slog.Any("error", err))
			os.Exit(1)
		}
		slog.Error("server error", slog.Any("error", err))
		os.Exit(1)
	case <-ctx.Done():
		slog.Info("shutdown signal received")
	}

	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutCtx)
	slog.Info("server stopped")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func resolveDataDir() string {
	if value := strings.TrimSpace(os.Getenv("GIMG_DATA_DIR")); value != "" {
		return value
	}
	return filepath.Join(".", "data")
}

func resolveResourceDir() string {
	if value := strings.TrimSpace(os.Getenv("GIMG_RESOURCE_DIR")); value != "" {
		return value
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return cwd
}

func envString(key, fallback string) string {
	if value := os.Getenv(key); strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return fallback
}

func isAddressInUseError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "address already in use") ||
		strings.Contains(message, "only one usage of each socket address")
}

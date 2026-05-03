package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	mrand "math/rand/v2"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/sha3"
)

const maxPoWIterations = 500000

const defaultChatGPTUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"

var (
	screenSizes  = []int{3000, 4000, 3120, 4160}
	coreCounts   = []int{8, 16, 24, 32}
	navigatorKey = []string{
		"registerProtocolHandler\u2212function registerProtocolHandler() { [native code] }",
		"storage\u2212[object StorageManager]",
		"locks\u2212[object LockManager]",
		"appCodeName\u2212Mozilla",
		"permissions\u2212[object Permissions]",
		"share\u2212function share() { [native code] }",
		"webdriver\u2212false",
		"canShare\u2212function canShare() { [native code] }",
		"vendor\u2212Google Inc.",
		"mediaDevices\u2212[object MediaDevices]",
		"vibrate\u2212function vibrate() { [native code] }",
		"cookieEnabled\u2212true",
		"product\u2212Gecko",
		"language\u2212zh-CN",
		"hardwareConcurrency\u221232",
		"pdfViewerEnabled\u2212true",
	}
	documentKey = []string{
		"_reactListeningo743lnnpvdg",
		"location",
	}
	windowKey = []string{
		"0", "window", "self", "document", "name", "location", "customElements",
		"history", "navigation", "locationbar", "menubar", "personalbar",
		"scrollbars", "statusbar", "toolbar", "status", "closed", "frames",
		"length", "top", "opener", "parent", "frameElement", "navigator",
		"origin", "external", "screen", "innerWidth", "innerHeight", "scrollX",
		"pageXOffset", "scrollY", "pageYOffset", "visualViewport", "screenX",
		"screenY", "outerWidth", "outerHeight", "devicePixelRatio",
		"clientInformation", "screenLeft", "screenTop", "styleMedia", "onsearch",
		"isSecureContext", "trustedTypes", "performance", "crypto", "indexedDB",
		"sessionStorage", "localStorage", "fetch", "atob", "btoa",
		"setTimeout", "setInterval", "clearTimeout", "clearInterval",
		"requestAnimationFrame", "cancelAnimationFrame",
	}
)

func solvePoW(seed, difficulty string) (string, error) {
	config := buildPoWConfig(defaultChatGPTUserAgent)

	diffBytes, err := hex.DecodeString(difficulty)
	if err != nil {
		return "", fmt.Errorf("invalid difficulty hex %q: %w", difficulty, err)
	}
	diffLen := len(diffBytes)

	part1JSON, _ := json.Marshal(config[:3])
	part4to8JSON, _ := json.Marshal(config[4:9])
	part10JSON, _ := json.Marshal(config[10:])

	staticPart1 := append(part1JSON[:len(part1JSON)-1], ',')
	mid := part4to8JSON[1 : len(part4to8JSON)-1]
	staticPart2 := make([]byte, 0, len(mid)+2)
	staticPart2 = append(staticPart2, ',')
	staticPart2 = append(staticPart2, mid...)
	staticPart2 = append(staticPart2, ',')
	tail := part10JSON[1:]
	staticPart3 := make([]byte, 0, len(tail)+1)
	staticPart3 = append(staticPart3, ',')
	staticPart3 = append(staticPart3, tail...)

	seedBytes := []byte(seed)

	for i := 0; i < maxPoWIterations; i++ {
		iStr := []byte(fmt.Sprintf("%d", i))
		jStr := []byte(fmt.Sprintf("%d", i>>1))

		assembled := make([]byte, 0, len(staticPart1)+len(iStr)+len(staticPart2)+len(jStr)+len(staticPart3))
		assembled = append(assembled, staticPart1...)
		assembled = append(assembled, iStr...)
		assembled = append(assembled, staticPart2...)
		assembled = append(assembled, jStr...)
		assembled = append(assembled, staticPart3...)

		b64 := base64.StdEncoding.EncodeToString(assembled)

		hasher := sha3.New512()
		hasher.Write(seedBytes)
		hasher.Write([]byte(b64))
		hash := hasher.Sum(nil)

		if bytesLE(hash[:diffLen], diffBytes) {
			return "gAAAAAB" + b64, nil
		}
	}

	fallback := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%q", seed)))
	return "gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + fallback, nil
}

func generateRequirementsToken() string {
	config := buildPoWConfig(defaultChatGPTUserAgent)

	part1JSON, _ := json.Marshal(config[:3])
	part4to8JSON, _ := json.Marshal(config[4:9])
	part10JSON, _ := json.Marshal(config[10:])

	staticPart1 := append(part1JSON[:len(part1JSON)-1], ',')
	mid := part4to8JSON[1 : len(part4to8JSON)-1]
	staticPart2 := make([]byte, 0, len(mid)+2)
	staticPart2 = append(staticPart2, ',')
	staticPart2 = append(staticPart2, mid...)
	staticPart2 = append(staticPart2, ',')
	tail := part10JSON[1:]
	staticPart3 := make([]byte, 0, len(tail)+1)
	staticPart3 = append(staticPart3, ',')
	staticPart3 = append(staticPart3, tail...)

	assembled := make([]byte, 0, len(staticPart1)+1+len(staticPart2)+1+len(staticPart3))
	assembled = append(assembled, staticPart1...)
	assembled = append(assembled, '0')
	assembled = append(assembled, staticPart2...)
	assembled = append(assembled, '0')
	assembled = append(assembled, staticPart3...)

	b64 := base64.StdEncoding.EncodeToString(assembled)
	return "gAAAAAC" + b64
}

func buildPoWConfig(userAgent string) []any {
	now := time.Now()
	perfCounter := float64(now.UnixMilli()%1000000) + mrand.Float64()
	epochOffset := float64(now.UnixMilli()) - perfCounter

	return []any{
		screenSizes[mrand.IntN(len(screenSizes))],
		getBrowserParseTime(),
		4294705152,
		0,
		userAgent,
		"https://chatgpt.com/backend-api/sentinel/sdk.js",
		"",
		"en-US",
		"en-US,es-US,en,es",
		0,
		navigatorKey[mrand.IntN(len(navigatorKey))],
		documentKey[mrand.IntN(len(documentKey))],
		windowKey[mrand.IntN(len(windowKey))],
		perfCounter,
		uuid.NewString(),
		"",
		coreCounts[mrand.IntN(len(coreCounts))],
		epochOffset,
	}
}

func getBrowserParseTime() string {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		loc = time.FixedZone("EST", -5*60*60)
	}
	return formatBrowserParseTime(time.Now(), loc)
}

func formatBrowserParseTime(now time.Time, loc *time.Location) string {
	local := now.In(loc)
	_, offsetSeconds := local.Zone()
	return fmt.Sprintf(
		"%s GMT%s (%s)",
		local.Format("Mon Jan 02 2006 15:04:05"),
		formatGMTOffset(offsetSeconds),
		easternTimeLabel(offsetSeconds),
	)
}

func formatGMTOffset(offsetSeconds int) string {
	sign := "+"
	if offsetSeconds < 0 {
		sign = "-"
		offsetSeconds = -offsetSeconds
	}
	hours := offsetSeconds / 3600
	minutes := (offsetSeconds % 3600) / 60
	return fmt.Sprintf("%s%02d%02d", sign, hours, minutes)
}

func easternTimeLabel(offsetSeconds int) string {
	if offsetSeconds == -4*60*60 {
		return "Eastern Daylight Time"
	}
	return "Eastern Standard Time"
}

func bytesLE(a, b []byte) bool {
	for i := range a {
		if a[i] < b[i] {
			return true
		}
		if a[i] > b[i] {
			return false
		}
	}
	return true
}

func randomFloat() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(1<<53))
	f := float64(n.Int64()) / float64(1<<53)
	return strings.TrimRight(fmt.Sprintf("%.17f", f), "0")
}
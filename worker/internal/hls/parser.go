package hls

import (
	"bufio"
	"bytes"
	"path/filepath"
	"strings"
)

func ParseSegments(m3u8Data []byte) []string {
	var segments []string
	scanner := bufio.NewScanner(bytes.NewReader(m3u8Data))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasSuffix(strings.ToLower(line), ".ts") {
			segments = append(segments, filepath.Base(line))
		}
	}
	return segments
}

func ContentTypeFor(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".m3u8":
		return "application/vnd.apple.mpegurl"
	case ".ts":
		return "video/mp2t"
	default:
		return "application/octet-stream"
	}
}

package config

import "os"

func JWTSecret() []byte {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return []byte(s)
	}
	return []byte("litestream-dev-secret-change-in-prod")
}

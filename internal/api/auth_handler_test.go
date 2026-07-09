package api

import (
	"net/http"
	"testing"

	"github.com/younkyumjin/mansio/internal/store"
)

func setupAuthMux(t *testing.T, noAuth bool) (store.Store, *http.ServeMux) {
	t.Helper()
	s, err := store.NewSQLite(t.TempDir())
	if err != nil {
		t.Fatalf("NewSQLite: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	ah := NewAuthHandler(AuthHandlerConfig{
		Store:         s,
		CreateSession: func() string { return "tok" },
		SetCookie:     func(http.ResponseWriter, string) {},
		ClearCookie:   func(http.ResponseWriter) {},
		GetToken:      func(*http.Request) string { return "" },
		DeleteSession: func(string) {},
		NoAuth:        noAuth,
	})
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/auth/check", ah.Check)
	return s, mux
}

func TestAuthCheck(t *testing.T) {
	t.Run("fresh store needs setup", func(t *testing.T) {
		_, mux := setupAuthMux(t, false)
		w := doRequest(mux, "GET", "/api/v1/auth/check", nil)
		resp := decodeJSON[map[string]bool](t, w)
		if !resp["needsSetup"] {
			t.Error("needsSetup should be true when no password is configured")
		}
	})

	t.Run("no-auth hides setup even with password", func(t *testing.T) {
		s, mux := setupAuthMux(t, true)
		if err := s.SetPasswordHash("$2a$10$notarealhashnotarealhashnotarealhash"); err != nil {
			t.Fatalf("SetPasswordHash: %v", err)
		}
		w := doRequest(mux, "GET", "/api/v1/auth/check", nil)
		resp := decodeJSON[map[string]bool](t, w)
		if resp["needsSetup"] {
			t.Error("needsSetup should be false in no-auth mode")
		}
		if !resp["authenticated"] {
			t.Error("authenticated should be true in no-auth mode")
		}
	})

	t.Run("no-auth hides setup on fresh store", func(t *testing.T) {
		_, mux := setupAuthMux(t, true)
		w := doRequest(mux, "GET", "/api/v1/auth/check", nil)
		resp := decodeJSON[map[string]bool](t, w)
		if resp["needsSetup"] {
			t.Error("needsSetup should be false in no-auth mode")
		}
	})
}

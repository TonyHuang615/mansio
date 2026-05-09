package server

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"sync"
	"time"
)

type authManager struct {
	mu       sync.RWMutex
	sessions map[string]time.Time
}

func newAuthManager() *authManager {
	return &authManager{
		sessions: make(map[string]time.Time),
	}
}

func (a *authManager) createSession() string {
	b := make([]byte, 32)
	rand.Read(b)
	token := hex.EncodeToString(b)

	a.mu.Lock()
	a.sessions[token] = time.Now().Add(7 * 24 * time.Hour)
	a.mu.Unlock()

	return token
}

func (a *authManager) validateSession(token string) bool {
	a.mu.RLock()
	expiry, ok := a.sessions[token]
	a.mu.RUnlock()

	if !ok {
		return false
	}
	if time.Now().After(expiry) {
		a.mu.Lock()
		delete(a.sessions, token)
		a.mu.Unlock()
		return false
	}
	return true
}

func (a *authManager) deleteSession(token string) {
	a.mu.Lock()
	delete(a.sessions, token)
	a.mu.Unlock()
}

func (a *authManager) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "lociterm_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   7 * 24 * 60 * 60,
	})
}

func (a *authManager) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "lociterm_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
}

func (a *authManager) getTokenFromRequest(r *http.Request) string {
	cookie, err := r.Cookie("lociterm_session")
	if err != nil {
		return ""
	}
	return cookie.Value
}

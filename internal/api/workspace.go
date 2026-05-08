package api

import (
	"encoding/json"
	"net/http"

	"github.com/younkyumjin/ghostterm/internal/model"
	"github.com/younkyumjin/ghostterm/internal/store"
)

type WorkspaceHandler struct {
	store store.Store
}

func NewWorkspaceHandler(s store.Store) *WorkspaceHandler {
	return &WorkspaceHandler{store: s}
}

func (h *WorkspaceHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaces, err := h.store.ListWorkspaces()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if workspaces == nil {
		workspaces = []model.Workspace{}
	}
	writeJSON(w, http.StatusOK, workspaces)
}

func (h *WorkspaceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	workspace, err := h.store.CreateWorkspace(req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, workspace)
}

func (h *WorkspaceHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	workspace, err := h.store.UpdateWorkspace(id, req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if workspace == nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}
	writeJSON(w, http.StatusOK, workspace)
}

func (h *WorkspaceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.store.DeleteWorkspace(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

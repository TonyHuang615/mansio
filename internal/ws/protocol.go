package ws

type ControlMessage struct {
	Type    string `json:"type"`
	Cols    uint16 `json:"cols,omitempty"`
	Rows    uint16 `json:"rows,omitempty"`
	Shell   string `json:"shell,omitempty"`
	Message string `json:"message,omitempty"`
	Title   string `json:"title,omitempty"`
}

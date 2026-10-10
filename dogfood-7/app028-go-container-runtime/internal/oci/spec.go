package oci

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"path"
	"strings"
)

type Limits struct {
	Memory int64 `json:"memory"`
	CPU    int64 `json:"cpu"`
	Pids   int64 `json:"pids"`
}

type Spec struct {
	Version string   `json:"ociVersion"`
	Root    string   `json:"root"`
	Args    []string `json:"args"`
	Env     []string `json:"env"`
	Limits  Limits   `json:"limits"`
}

// @id CODE-OCI-001 @implements REQ-OCI-001 REQ-OCI-002 REQ-OCI-003 REQ-OCI-004 REQ-OCI-005 REQ-OCI-006 REQ-OCI-007 REQ-OCI-008
func Parse(data []byte) (Spec, error) {
	var s Spec
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(&s); err != nil {
		return s, err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return s, errors.New("trailing input")
	}
	if s.Version != "1.0.2" || !path.IsAbs(s.Root) || strings.ContainsRune(s.Root, 0) || len(s.Args) == 0 || strings.TrimSpace(s.Args[0]) == "" {
		return s, errors.New("invalid OCI spec")
	}
	if s.Limits.Memory < 0 || s.Limits.CPU < 0 || s.Limits.Pids < 0 {
		return s, errors.New("negative limit")
	}
	keys := map[string]bool{}
	for _, env := range s.Env {
		key, _, ok := strings.Cut(env, "=")
		if !ok || key == "" || keys[key] {
			return s, errors.New("invalid environment")
		}
		keys[key] = true
	}
	return s, nil
}

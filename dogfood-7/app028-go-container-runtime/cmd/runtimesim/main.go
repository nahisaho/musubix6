package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"example.com/runtime/cgroup"
	"example.com/runtime/checkpoint"
	"example.com/runtime/engine"
	"example.com/runtime/internal/oci"
	"example.com/runtime/overlay"
)

func simulate(specPath string) error {
	data, err := os.ReadFile(specPath)
	if err != nil {
		return err
	}
	spec, err := oci.Parse(data)
	if err != nil {
		return err
	}
	fs := overlay.New(map[string]overlay.Entry{"/etc/message": {Data: []byte("lower layer")}})
	if err = fs.Write("/etc/message", []byte("upper layer")); err != nil {
		return err
	}
	c, err := engine.New("demo", spec, fs)
	if err != nil {
		return err
	}
	if err = c.Apply("start"); err != nil {
		return err
	}
	if err = c.Execute(cgroup.Usage{Memory: 2, CPU: 1, Pids: 1}); err != nil {
		return err
	}
	if err = c.Apply("pause"); err != nil {
		return err
	}
	snapshot, err := checkpoint.Save(c)
	if err != nil {
		return err
	}
	restored, err := checkpoint.Restore(snapshot)
	if err != nil {
		return err
	}
	if err = restored.Apply("resume"); err != nil {
		return err
	}
	if err = restored.Apply("stop"); err != nil {
		return err
	}
	result := struct {
		ID              string       `json:"id"`
		State           engine.State `json:"state"`
		Files           []string     `json:"files"`
		Usage           cgroup.Usage `json:"usage"`
		CheckpointBytes int          `json:"checkpointBytes"`
	}{restored.ID, restored.State, restored.FS.List(), restored.Group.Snapshot(), len(snapshot)}
	return json.NewEncoder(os.Stdout).Encode(result)
}

func main() {
	spec := flag.String("spec", "examples/container.json", "simplified OCI spec JSON")
	flag.Parse()
	if err := simulate(*spec); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

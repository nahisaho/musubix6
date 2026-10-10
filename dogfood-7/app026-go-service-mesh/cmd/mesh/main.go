package main

import (
	mesh "dogfood.mesh"
	"dogfood.mesh/circuit"
	"dogfood.mesh/control"
	"dogfood.mesh/proxy"
	"encoding/json"
	"fmt"
	"os"
)

func run() error {
	c := control.New()
	ch, cancel := c.Subscribe("demo-proxy")
	defer cancel()
	s := mesh.Snapshot{Version: 1, Endpoints: []mesh.Endpoint{
		{ID: "east", Address: "east:8080", Weight: 1, Healthy: true},
		{ID: "west", Address: "west:8080", Weight: 2, Healthy: true},
	}}
	if err := c.Publish(s); err != nil {
		return err
	}
	d := <-ch
	p := proxy.New(circuit.New(8, 3, 10), 2, 20)
	if err := p.Update(d.Snapshot); err != nil {
		c.Ack("demo-proxy", d.Nonce, err.Error())
		return err
	}
	if err := c.Ack("demo-proxy", d.Nonce, ""); err != nil {
		return err
	}
	var routes []string
	for i := int64(0); i < 8; i++ {
		result, err := p.Do(proxy.Request{Idempotent: true, Deadline: 100}, i, 2, 1, func(e mesh.Endpoint) (string, error) {
			if e.ID == "east" {
				return "", proxy.ErrRetryable
			}
			return e.ID, nil
		})
		if err != nil {
			return err
		}
		routes = append(routes, result)
	}
	return json.NewEncoder(os.Stdout).Encode(struct {
		Version uint64
		Routes  []string
	}{c.Acknowledged("demo-proxy"), routes})
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

package main

import (
	"context"
	"encoding/json"
	"example.org/observability/pipeline"
	"example.org/observability/sampling"
	"example.org/observability/trace"
	"fmt"
	"time"
)

func main() {
	c, err := trace.Parse("00-0123456789abcdef0123456789abcdef-0123456789abcdef-01")
	if err != nil {
		panic(err)
	}
	p := pipeline.New(64, time.Second, 100*time.Millisecond)
	now := time.Now()
	if err := p.Add(context.Background(), sampling.Span{Context: c, Duration: 123 * time.Millisecond}, now); err != nil {
		panic(err)
	}
	p.Close()
	s := p.Metrics()
	p99, err := s.Quantile(.99)
	if err != nil {
		panic(err)
	}
	out := struct {
		Count  int64 `json:"count"`
		P99    int64 `json:"p99_ns"`
		Traces int   `json:"traces"`
		Logs   any   `json:"logs"`
	}{s.Count, p99, len(p.Flush(now.Add(time.Second))), p.Logs()}
	b, err := json.Marshal(out)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(b))
}

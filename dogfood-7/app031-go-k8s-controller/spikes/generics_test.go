//go:build sddprobe

package spikes_test

import (
	"dogfood.local/controller/internal/clock"
	"dogfood.local/controller/internal/queue"
	"dogfood.local/controller/model"
	"testing"
	"time"
)

func TestBuildTaggedGenericQueue(t *testing.T) {
	for _, tc := range []struct {
		name     string
		duration time.Duration
	}{{"zero", 0}, {"due", time.Second}} {
		t.Run(tc.name, func(t *testing.T) {
			var clk clock.Clock = clock.NewFake()
			fake := clk.(*clock.Fake)
			q := queue.New[string](clk, time.Second, time.Second)
			o := model.Object{Metadata: model.Metadata{Name: "embedded"}}
			q.AddRateLimited(o.Name)
			fake.Advance(tc.duration)
			q.Tick()
			_, ready := q.Get()
			if ready != (tc.duration >= time.Second) {
				t.Fatal("fake clock/generic queue boundary")
			}
		})
	}
}

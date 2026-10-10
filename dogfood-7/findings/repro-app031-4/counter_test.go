package counter

import (
	"fmt"
	"os"
	"strconv"
	"testing"
)

func TestMain(m *testing.M) {
	if code, err := strconv.Atoi(os.Getenv("PROBE_SETUP_EXIT")); err == nil {
		fmt.Printf("suite setup exits %d before tests\n", code)
		os.Exit(code)
	}
	os.Exit(m.Run())
}

// @id TEST-PROBE-001
// @verifies REQ-PROBE-001
func TestTEST_PROBE_001_count(t *testing.T) {
	t.Log("selected test actually ran")
	if Count() != 1 { t.Fatal("counter is not one") }
}

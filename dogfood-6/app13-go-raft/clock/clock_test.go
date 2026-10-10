package clock

import (
	"errors"
	"reflect"
	"testing"
)

/** @id TEST-CLOCK-001 @verifies REQ-CLOCK-001 */
func TestTEST_CLOCK_001_initial(t *testing.T) {
	c := New()
	if c.Now() != 0 || c.Pending() != 0 {
		t.Fatalf("now=%d pending=%d", c.Now(), c.Pending())
	}
}

/** @id TEST-CLOCK-002 @verifies REQ-CLOCK-002 */
func TestTEST_CLOCK_002_advance(t *testing.T) {
	c := New()
	if err := c.Advance(5); err != nil {
		t.Fatal(err)
	}
	_ = c.Advance(7)
	if c.Now() != 12 {
		t.Fatalf("now=%d", c.Now())
	}
}

/** @id TEST-CLOCK-003 @verifies REQ-CLOCK-003 */
func TestTEST_CLOCK_003_negative(t *testing.T) {
	c := New()
	_ = c.Advance(3)
	err := c.Advance(-1)
	if !errors.Is(err, ErrNegative) || c.Now() != 3 {
		t.Fatalf("err=%v now=%d", err, c.Now())
	}
}

/** @id TEST-CLOCK-004 @verifies REQ-CLOCK-004 */
func TestTEST_CLOCK_004_deadlineInclusive(t *testing.T) {
	c := New()
	n := 0
	c.AfterFunc(10, func() { n++ })
	_ = c.Advance(9)
	if n != 0 {
		t.Fatal("fired early")
	}
	_ = c.Advance(1)
	_ = c.Advance(100)
	if n != 1 {
		t.Fatalf("fired %d times", n)
	}
}

/** @id TEST-CLOCK-005 @verifies REQ-CLOCK-005 */
func TestTEST_CLOCK_005_creationOrder(t *testing.T) {
	c := New()
	var got []int
	for i := 0; i < 5; i++ {
		i := i
		c.AfterFunc(7, func() { got = append(got, i) })
	}
	_ = c.Advance(7)
	if !reflect.DeepEqual(got, []int{0, 1, 2, 3, 4}) {
		t.Fatalf("got %v", got)
	}
}

/** @id TEST-CLOCK-006 @verifies REQ-CLOCK-006 */
func TestTEST_CLOCK_006_nowInCallback(t *testing.T) {
	c := New()
	var seen []int64
	c.AfterFunc(3, func() { seen = append(seen, c.Now()) })
	c.AfterFunc(8, func() { seen = append(seen, c.Now()) })
	_ = c.Advance(20)
	if !reflect.DeepEqual(seen, []int64{3, 8}) || c.Now() != 20 {
		t.Fatalf("seen=%v now=%d", seen, c.Now())
	}
}

/** @id TEST-CLOCK-007 @verifies REQ-CLOCK-007 */
func TestTEST_CLOCK_007_stop(t *testing.T) {
	c := New()
	n := 0
	a := c.AfterFunc(5, func() { n++ })
	b := c.AfterFunc(6, func() { n += 10 })
	if !a.Stop() || a.Stop() {
		t.Fatal("stop pending must be true once")
	}
	_ = c.Advance(10)
	if n != 10 || b.Stop() {
		t.Fatalf("n=%d", n)
	}
	if c.Pending() != 0 {
		t.Fatalf("pending=%d", c.Pending())
	}
}

/** @id TEST-CLOCK-008 @verifies REQ-CLOCK-008 */
func TestTEST_CLOCK_008_nestedSchedule(t *testing.T) {
	c := New()
	var got []string
	c.AfterFunc(10, func() {
		got = append(got, "a")
		c.AfterFunc(2, func() { got = append(got, "c@12") })
		c.AfterFunc(0, func() { got = append(got, "b@10") })
		c.AfterFunc(50, func() { got = append(got, "late") })
	})
	c.AfterFunc(11, func() { got = append(got, "m@11") })
	_ = c.Advance(15)
	want := []string{"a", "b@10", "m@11", "c@12"}
	if !reflect.DeepEqual(got, want) || c.Pending() != 1 {
		t.Fatalf("got %v pending %d", got, c.Pending())
	}
}

/** @id TEST-CLOCK-009 @verifies REQ-CLOCK-009 */
func TestTEST_CLOCK_009_zeroDelay(t *testing.T) {
	c := New()
	n := 0
	c.AfterFunc(0, func() { n++ })
	c.AfterFunc(-5, func() { n++ })
	if n != 0 {
		t.Fatal("must not fire synchronously")
	}
	_ = c.Advance(0)
	if n != 2 || c.Now() != 0 {
		t.Fatalf("n=%d now=%d", n, c.Now())
	}
}

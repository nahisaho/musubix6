package auth

import "testing"

// @id TEST-AUTH-001 @verifies REQ-AUTH-001 REQ-AUTH-002
func TestTEST_AUTH_001(t *testing.T) {
	p := NewPolicy([]string{"demo"})
	for _, row := range []struct{ body, db string }{{"user\x00demo\x00database\x00sample\x00\x00", "sample"}, {"user\x00demo\x00\x00", "demo"}} {
		i, err := Authenticate(196608, []byte(row.body), p)
		if err != nil || i.User != "demo" || i.Database != row.db {
			t.Fatalf("identity %+v %v", i, err)
		}
	}
}

// @id TEST-AUTH-002 @verifies REQ-AUTH-003 REQ-AUTH-004
func TestTEST_AUTH_002(t *testing.T) {
	for _, body := range []string{"user\x00root\x00\x00", "\x00"} {
		if _, err := Authenticate(196608, []byte(body), NewPolicy([]string{"demo"})); err == nil || err.(*Error).Code != "28000" {
			t.Fatalf("policy: %v", err)
		}
	}
}

// @id TEST-AUTH-003 @verifies REQ-AUTH-005 REQ-AUTH-006
func TestTEST_AUTH_003(t *testing.T) {
	for _, body := range []string{"user\x00demo\x00user\x00demo\x00\x00", "user\x00demo", "user\x00demo\x00"} {
		if _, err := Authenticate(196608, []byte(body), NewPolicy([]string{"demo"})); err == nil {
			t.Fatalf("malformed: %q", body)
		}
	}
}

// @id TEST-AUTH-004 @verifies REQ-AUTH-007 REQ-AUTH-008
func TestTEST_AUTH_004(t *testing.T) {
	if !IsSSL(80877103) || IsSSL(196608) {
		t.Fatal("SSL classification")
	}
	if _, err := Authenticate(123, []byte{0}, NewPolicy(nil)); err == nil || err.(*Error).Code != "0A000" {
		t.Fatalf("protocol: %v", err)
	}
}

// @id TEST-AUTH-005 @verifies REQ-AUTH-009 REQ-AUTH-010
func TestTEST_AUTH_005(t *testing.T) {
	users := []string{"demo"}
	p := NewPolicy(users)
	users[0] = "root"
	if !p.Allows("demo") || p.Allows("root") || NewPolicy(nil).Allows("demo") {
		t.Fatal("policy aliasing")
	}
	if _, err := Authenticate(196608, []byte("user\x00demo\x00\x00junk"), p); err == nil {
		t.Fatal("trailing data")
	}
}

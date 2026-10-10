package oci

import "testing"

// @id TEST-OCI-001 @verifies REQ-OCI-001 REQ-OCI-002 REQ-OCI-003 REQ-OCI-004 REQ-OCI-005 REQ-OCI-006 REQ-OCI-007 REQ-OCI-008
func TestTEST_OCI_001_Parse(t *testing.T) {
	good := `{"ociVersion":"1.0.2","root":"/root","args":["sh"],"env":["A=b"],"limits":{"memory":8,"cpu":2,"pids":1}}`
	s, err := Parse([]byte(good))
	if err != nil || s.Root != "/root" || s.Args[0] != "sh" || s.Limits.Memory != 8 {
		t.Fatalf("valid spec rejected: %v", err)
	}
	for _, bad := range []string{
		`{`, good + `{}`, `{"ociVersion":"9","root":"/root","args":["sh"]}`,
		`{"ociVersion":"1.0.2","root":"relative","args":["sh"]}`,
		`{"ociVersion":"1.0.2","root":"/root","args":[]}`,
		`{"ociVersion":"1.0.2","root":"/root","args":["sh"],"env":["bad"]}`,
		`{"ociVersion":"1.0.2","root":"/root","args":["sh"],"env":["A=b","A=c"]}`,
		`{"ociVersion":"1.0.2","root":"/root","args":["sh"],"limits":{"memory":-1}}`,
		`{"ociVersion":"1.0.2","root":"/root","args":["sh"],"unknown":true}`,
	} {
		t.Run(bad, func(t *testing.T) {
			if _, e := Parse([]byte(bad)); e == nil {
				t.Fatal("invalid spec accepted")
			}
		})
	}
}

// @id TEST-OCI-002 @verifies REQ-OCI-005
func TestTEST_OCI_002_BlankExecutable(t *testing.T) {
	for _, arg := range []string{"", " "} {
		raw := []byte(`{"ociVersion":"1.0.2","root":"/root","args":["` + arg + `"]}`)
		if _, err := Parse(raw); err == nil {
			t.Fatal("blank executable accepted")
		}
	}
}

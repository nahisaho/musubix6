package auth

type Policy struct{ roles }

// @id CODE-AUTH-004 @implements REQ-AUTH-009
func NewPolicy(users []string) *Policy {
	p := &Policy{roles: roles{users: make(map[string]bool)}}
	for _, user := range users {
		if user != "" {
			p.users[user] = true
		}
	}
	return p
}

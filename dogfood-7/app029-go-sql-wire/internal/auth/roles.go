package auth

type roles struct{ users map[string]bool }

// @id CODE-AUTH-001 @implements REQ-AUTH-003
func (p *roles) Allows(user string) bool { return p.users[user] }

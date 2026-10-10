package auth

import "example.com/sqlwire/internal/wire"

type Error struct{ Code, Message string }

func (e *Error) Error() string { return e.Code + ": " + e.Message }

type Identity struct{ User, Database string }

// @id CODE-AUTH-002 @implements REQ-AUTH-001 REQ-AUTH-002 REQ-AUTH-004 REQ-AUTH-005 REQ-AUTH-006 REQ-AUTH-008 REQ-AUTH-010
func Authenticate(protocol uint32, body []byte, p *Policy) (Identity, error) {
	if protocol != 196608 {
		return Identity{}, &Error{"0A000", "unsupported protocol"}
	}
	c := wire.Cursor{Body: body}
	fields := make(map[string]string)
	for {
		key, err := c.String()
		if err != nil {
			return Identity{}, err
		}
		if key == "" {
			if !c.Done() {
				return Identity{}, wire.ErrPayload
			}
			break
		}
		if _, ok := fields[key]; ok {
			return Identity{}, wire.ErrPayload
		}
		value, err := c.String()
		if err != nil {
			return Identity{}, err
		}
		fields[key] = value
	}
	user := fields["user"]
	if user == "" || p == nil || !p.Allows(user) {
		return Identity{}, &Error{"28000", "role denied"}
	}
	db := fields["database"]
	if db == "" {
		db = user
	}
	return Identity{user, db}, nil
}

// @id CODE-AUTH-003 @implements REQ-AUTH-007
func IsSSL(protocol uint32) bool { return protocol == 80877103 }

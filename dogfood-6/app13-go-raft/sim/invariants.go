package sim

import "raftsim/node"

/** @id CODE-SIM-007 @implements REQ-SIM-003 REQ-SIM-010 */
func (c *Cluster) checkLeader(id int, nd *node.Node) {
	t := nd.Term()
	if prev, ok := c.termLeader[t]; ok && prev != id {
		c.fail("election-safety", "term %d has leaders %d and %d", t, prev, id)
	}
	c.termLeader[t] = id
	key := uint64(id)<<48 | t
	if c.checked[key] {
		return
	}
	c.checked[key] = true
	for idx, e := range c.committed {
		if got, ok := nd.Log().Get(idx); !ok || got != e {
			c.fail("leader-completeness", "leader %d term %d lacks committed index %d", id, t, idx)
		}
	}
}

/** @id CODE-SIM-006 @implements REQ-SIM-008 */
func (c *Cluster) checkLogMatching() {
	for a := 0; a < len(c.nodes); a++ {
		for b := a + 1; b < len(c.nodes); b++ {
			la, lb := c.nodes[a].Log(), c.nodes[b].Log()
			top := la.LastIndex()
			if lb.LastIndex() < top {
				top = lb.LastIndex()
			}
			for i := top; i >= 1; i-- {
				ta, _ := la.Term(i)
				tb, _ := lb.Term(i)
				if ta != tb {
					continue
				}
				for j := uint64(1); j <= i; j++ {
					ea, _ := la.Get(j)
					eb, _ := lb.Get(j)
					if ea != eb {
						c.fail("log-matching", "nodes %d,%d agree at (%d,%d) but differ at index %d", a, b, i, ta, j)
						break
					}
				}
				break
			}
		}
	}
}

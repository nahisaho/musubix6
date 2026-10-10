use pagefmt::{Page, PageError};
use std::cmp::Ordering;

#[derive(Debug, Clone, PartialEq)]
pub enum BTreeError {
    OrderTooSmall,
    Page(PageError),
    BadPage,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Stats {
    pub splits: u64,
    pub merges: u64,
    pub borrows: u64,
}

pub struct PageImage {
    pub pages: Vec<Page>,
    pub root: usize,
    pub order: usize,
}

#[derive(Debug, Clone)]
enum Node {
    Leaf { keys: Vec<Vec<u8>>, vals: Vec<Vec<u8>>, next: Option<usize> },
    Internal { keys: Vec<Vec<u8>>, children: Vec<usize> },
}

impl Node {
    fn nkeys(&self) -> usize {
        match self {
            Node::Leaf { keys, .. } | Node::Internal { keys, .. } => keys.len(),
        }
    }
}

fn empty_leaf() -> Node {
    Node::Leaf { keys: vec![], vals: vec![], next: None }
}

fn lower_bound(keys: &[Vec<u8>], k: &[u8]) -> usize {
    keys.partition_point(|x| x.as_slice() < k)
}

fn upper_bound(keys: &[Vec<u8>], k: &[u8]) -> usize {
    keys.partition_point(|x| x.as_slice() <= k)
}

#[derive(Debug, Clone)]
pub struct BTree {
    nodes: Vec<Node>,
    free: Vec<usize>,
    root: usize,
    order: usize,
    len: usize,
    stats: Stats,
}

impl BTree {
    /** @id CODE-BT-001 @implements REQ-BT-010 */
    pub fn new(order: usize) -> Result<Self, BTreeError> {
        if order < 3 {
            return Err(BTreeError::OrderTooSmall);
        }
        Ok(BTree { nodes: vec![empty_leaf()], free: vec![], root: 0, order, len: 0, stats: Stats::default() })
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn stats(&self) -> Stats {
        self.stats.clone()
    }

    fn min_keys(&self) -> usize {
        self.order / 2
    }

    fn alloc(&mut self, n: Node) -> usize {
        if let Some(i) = self.free.pop() {
            self.nodes[i] = n;
            i
        } else {
            self.nodes.push(n);
            self.nodes.len() - 1
        }
    }

    fn release(&mut self, id: usize) {
        self.nodes[id] = empty_leaf();
        self.free.push(id);
    }

    fn take(&mut self, id: usize) -> Node {
        std::mem::replace(&mut self.nodes[id], empty_leaf())
    }

    /** @id CODE-BT-002 @implements REQ-BT-001 */
    pub fn get(&self, k: &[u8]) -> Option<&[u8]> {
        let mut id = self.root;
        loop {
            match &self.nodes[id] {
                Node::Internal { keys, children } => id = children[upper_bound(keys, k)],
                Node::Leaf { keys, vals, .. } => {
                    let i = lower_bound(keys, k);
                    return if i < keys.len() && keys[i] == k { Some(vals[i].as_slice()) } else { None };
                }
            }
        }
    }

    /** @id CODE-BT-003 @implements REQ-BT-002 REQ-BT-003 */
    pub fn insert(&mut self, k: &[u8], v: &[u8]) -> Option<Vec<u8>> {
        let (old, split) = self.insert_rec(self.root, k, v);
        if let Some((sep, right)) = split {
            let left = self.root;
            self.root = self.alloc(Node::Internal { keys: vec![sep], children: vec![left, right] });
        }
        if old.is_none() {
            self.len += 1;
        }
        old
    }

    fn insert_rec(&mut self, id: usize, k: &[u8], v: &[u8]) -> (Option<Vec<u8>>, Option<(Vec<u8>, usize)>) {
        let order = self.order;
        let child = match &mut self.nodes[id] {
            Node::Leaf { keys, vals, next } => {
                let i = lower_bound(keys, k);
                if i < keys.len() && keys[i] == k {
                    return (Some(std::mem::replace(&mut vals[i], v.to_vec())), None);
                }
                keys.insert(i, k.to_vec());
                vals.insert(i, v.to_vec());
                if keys.len() <= order {
                    return (None, None);
                }
                let mid = keys.len().div_ceil(2);
                let rk = keys.split_off(mid);
                let rv = vals.split_off(mid);
                let sep = rk[0].clone();
                let right = Node::Leaf { keys: rk, vals: rv, next: next.take() };
                let rid = self.alloc(right);
                if let Node::Leaf { next, .. } = &mut self.nodes[id] {
                    *next = Some(rid);
                }
                self.stats.splits += 1;
                return (None, Some((sep, rid)));
            }
            Node::Internal { keys, children } => {
                let i = upper_bound(keys, k);
                (i, children[i])
            }
        };
        let (old, split) = self.insert_rec(child.1, k, v);
        let Some((sep, rid)) = split else { return (old, None) };
        let Node::Internal { keys, children } = &mut self.nodes[id] else { unreachable!() };
        keys.insert(child.0, sep);
        children.insert(child.0 + 1, rid);
        if keys.len() <= order {
            return (old, None);
        }
        let mid = keys.len() / 2;
        let rk = keys.split_off(mid + 1);
        let up = keys.pop().unwrap();
        let rc = children.split_off(mid + 1);
        let nid = self.alloc(Node::Internal { keys: rk, children: rc });
        self.stats.splits += 1;
        (old, Some((up, nid)))
    }

    /** @id CODE-BT-004 @implements REQ-BT-005 REQ-BT-007 */
    pub fn remove(&mut self, k: &[u8]) -> Option<Vec<u8>> {
        let old = self.remove_rec(self.root, k);
        if old.is_some() {
            self.len -= 1;
        }
        if let Node::Internal { keys, children } = &self.nodes[self.root] {
            if keys.is_empty() {
                let only = children[0];
                let old_root = self.root;
                self.root = only;
                self.release(old_root);
            }
        }
        old
    }

    fn remove_rec(&mut self, id: usize, k: &[u8]) -> Option<Vec<u8>> {
        let (idx, child) = match &mut self.nodes[id] {
            Node::Leaf { keys, vals, .. } => {
                let i = lower_bound(keys, k);
                if i < keys.len() && keys[i] == k {
                    keys.remove(i);
                    return Some(vals.remove(i));
                }
                return None;
            }
            Node::Internal { keys, children } => {
                let i = upper_bound(keys, k);
                (i, children[i])
            }
        };
        let old = self.remove_rec(child, k);
        if old.is_some() && self.nodes[child].nkeys() < self.min_keys() {
            self.fix_child(id, idx);
        }
        old
    }

    /** @id CODE-BT-005 @implements REQ-BT-006 */
    fn fix_child(&mut self, parent: usize, idx: usize) {
        let min = self.min_keys();
        let Node::Internal { mut keys, mut children } = self.take(parent) else { unreachable!() };
        let cid = children[idx];
        let mut c = self.take(cid);
        if idx > 0 && self.nodes[children[idx - 1]].nkeys() > min {
            let mut l = self.take(children[idx - 1]);
            match (&mut l, &mut c) {
                (Node::Leaf { keys: lk, vals: lv, .. }, Node::Leaf { keys: ck, vals: cv, .. }) => {
                    ck.insert(0, lk.pop().unwrap());
                    cv.insert(0, lv.pop().unwrap());
                    keys[idx - 1] = ck[0].clone();
                }
                (Node::Internal { keys: lk, children: lc }, Node::Internal { keys: ck, children: cc }) => {
                    ck.insert(0, std::mem::replace(&mut keys[idx - 1], lk.pop().unwrap()));
                    cc.insert(0, lc.pop().unwrap());
                }
                _ => unreachable!(),
            }
            self.nodes[children[idx - 1]] = l;
            self.nodes[cid] = c;
            self.stats.borrows += 1;
        } else if idx + 1 < children.len() && self.nodes[children[idx + 1]].nkeys() > min {
            let mut r = self.take(children[idx + 1]);
            match (&mut r, &mut c) {
                (Node::Leaf { keys: rk, vals: rv, .. }, Node::Leaf { keys: ck, vals: cv, .. }) => {
                    ck.push(rk.remove(0));
                    cv.push(rv.remove(0));
                    keys[idx] = rk[0].clone();
                }
                (Node::Internal { keys: rk, children: rc }, Node::Internal { keys: ck, children: cc }) => {
                    ck.push(std::mem::replace(&mut keys[idx], rk.remove(0)));
                    cc.push(rc.remove(0));
                }
                _ => unreachable!(),
            }
            self.nodes[children[idx + 1]] = r;
            self.nodes[cid] = c;
            self.stats.borrows += 1;
        } else {
            let (li, ri) = if idx > 0 { (idx - 1, idx) } else { (idx, idx + 1) };
            let (lid, rid) = (children[li], children[ri]);
            let (mut l, r) = if idx > 0 { (self.take(lid), c) } else { (c, self.take(rid)) };
            match (&mut l, r) {
                (Node::Leaf { keys: lk, vals: lv, next: ln }, Node::Leaf { keys: rk, vals: rv, next: rn }) => {
                    lk.extend(rk);
                    lv.extend(rv);
                    *ln = rn;
                }
                (Node::Internal { keys: lk, children: lc }, Node::Internal { keys: rk, children: rc }) => {
                    lk.push(keys[li].clone());
                    lk.extend(rk);
                    lc.extend(rc);
                }
                _ => unreachable!(),
            }
            self.nodes[lid] = l;
            keys.remove(li);
            children.remove(ri);
            self.release(rid);
            self.stats.merges += 1;
        }
        self.nodes[parent] = Node::Internal { keys, children };
    }

    pub fn height(&self) -> usize {
        let mut h = 1;
        let mut id = self.root;
        while let Node::Internal { children, .. } = &self.nodes[id] {
            id = children[0];
            h += 1;
        }
        h
    }

    fn leftmost_leaf(&self) -> usize {
        let mut id = self.root;
        while let Node::Internal { children, .. } = &self.nodes[id] {
            id = children[0];
        }
        id
    }

    pub fn entries(&self) -> Vec<(Vec<u8>, Vec<u8>)> {
        let mut out = vec![];
        let mut cur = Some(self.leftmost_leaf());
        while let Some(id) = cur {
            let Node::Leaf { keys, vals, next } = &self.nodes[id] else { unreachable!() };
            out.extend(keys.iter().cloned().zip(vals.iter().cloned()));
            cur = *next;
        }
        out
    }

    /** @id CODE-BT-006 @implements REQ-BT-008 */
    pub fn first_ge(&self, k: &[u8]) -> Option<(&[u8], &[u8])> {
        let mut id = self.root;
        loop {
            match &self.nodes[id] {
                Node::Internal { keys, children } => id = children[upper_bound(keys, k)],
                Node::Leaf { keys, vals, next } => {
                    let i = lower_bound(keys, k);
                    if i < keys.len() {
                        return Some((keys[i].as_slice(), vals[i].as_slice()));
                    }
                    return next.and_then(|n| match &self.nodes[n] {
                        Node::Leaf { keys, vals, .. } if !keys.is_empty() => Some((keys[0].as_slice(), vals[0].as_slice())),
                        _ => None,
                    });
                }
            }
        }
    }

    pub fn last_lt(&self, k: &[u8]) -> Option<(&[u8], &[u8])> {
        self.last_lt_rec(self.root, k)
    }

    /** @id CODE-BT-009 @implements REQ-BT-011 */
    pub fn last(&self) -> Option<(&[u8], &[u8])> {
        let mut id = self.root;
        loop {
            match &self.nodes[id] {
                Node::Internal { children, .. } => id = *children.last()?,
                Node::Leaf { keys, vals, .. } => return Some((keys.last()?.as_slice(), vals.last()?.as_slice())),
            }
        }
    }

    fn last_lt_rec(&self, id: usize, k: &[u8]) -> Option<(&[u8], &[u8])> {
        match &self.nodes[id] {
            Node::Leaf { keys, vals, .. } => {
                let i = lower_bound(keys, k);
                (i > 0).then(|| (keys[i - 1].as_slice(), vals[i - 1].as_slice()))
            }
            Node::Internal { keys, children } => {
                let idx = lower_bound(keys, k);
                (0..=idx).rev().find_map(|i| self.last_lt_rec(children[i], k))
            }
        }
    }

    /** @id CODE-BT-007 @implements REQ-BT-003 REQ-BT-004 */
    pub fn check_invariants(&self) -> Result<(), String> {
        let mut leaves = vec![];
        let depth = self.check_node(self.root, None, None, true, &mut leaves)?;
        let mut count = 0;
        for w in leaves.windows(2) {
            let Node::Leaf { next, .. } = &self.nodes[w[0]] else { unreachable!() };
            if *next != Some(w[1]) {
                return Err(format!("I5: leaf {} next is {:?}, expected {}", w[0], next, w[1]));
            }
        }
        if let Some(last) = leaves.last() {
            let Node::Leaf { next, .. } = &self.nodes[*last] else { unreachable!() };
            if next.is_some() {
                return Err("I5: last leaf has a next".into());
            }
        }
        for l in &leaves {
            count += self.nodes[*l].nkeys();
        }
        if count != self.len {
            return Err(format!("I6: len {} != entries {}", self.len, count));
        }
        let _ = depth;
        Ok(())
    }

    fn check_node(&self, id: usize, lo: Option<&[u8]>, hi: Option<&[u8]>, is_root: bool, leaves: &mut Vec<usize>) -> Result<usize, String> {
        let min = self.min_keys();
        let (keys, kids) = match &self.nodes[id] {
            Node::Leaf { keys, vals, .. } => {
                if keys.len() != vals.len() {
                    return Err(format!("node {id}: keys/vals mismatch"));
                }
                (keys, None)
            }
            Node::Internal { keys, children } => {
                if children.len() != keys.len() + 1 {
                    return Err(format!("node {id}: children {} != keys+1", children.len()));
                }
                (keys, Some(children))
            }
        };
        if keys.len() > self.order {
            return Err(format!("I1: node {id} overfull ({})", keys.len()));
        }
        if !is_root && keys.len() < min {
            return Err(format!("I1: node {id} underfull ({} < {min})", keys.len()));
        }
        if is_root && kids.is_some() && keys.is_empty() {
            return Err("I1: internal root without keys".into());
        }
        for w in keys.windows(2) {
            if w[0].cmp(&w[1]) != Ordering::Less {
                return Err(format!("I2: node {id} keys not strictly increasing"));
            }
        }
        if let (Some(l), Some(f)) = (lo, keys.first()) {
            if f.as_slice() < l {
                return Err(format!("I3: node {id} key below lower bound"));
            }
        }
        if let (Some(h), Some(l)) = (hi, keys.last()) {
            if l.as_slice() >= h {
                return Err(format!("I3: node {id} key at/above upper bound"));
            }
        }
        match kids {
            None => {
                leaves.push(id);
                Ok(1)
            }
            Some(children) => {
                let mut depth = None;
                for (i, c) in children.iter().enumerate() {
                    let clo = if i == 0 { lo } else { Some(keys[i - 1].as_slice()) };
                    let chi = if i == keys.len() { hi } else { Some(keys[i].as_slice()) };
                    let d = self.check_node(*c, clo, chi, false, leaves)?;
                    if *depth.get_or_insert(d) != d {
                        return Err(format!("I4: node {id} has leaves at different depths"));
                    }
                }
                Ok(depth.unwrap() + 1)
            }
        }
    }

    /** @id CODE-BT-008 @implements REQ-BT-009 REQ-BT-013 */
    pub fn to_pages(&self, page_size: usize) -> Result<PageImage, PageError> {
        Page::try_new(page_size)?;
        let mut pages = Vec::with_capacity(self.nodes.len());
        for (i, n) in self.nodes.iter().enumerate() {
            let mut p = Page::try_new(page_size)?;
            if self.free.contains(&i) {
                pages.push(p);
                continue;
            }
            match n {
                Node::Leaf { keys, vals, next } => {
                    let mut h = vec![0u8];
                    h.extend((next.map(|x| x as u64).unwrap_or(u64::MAX)).to_le_bytes());
                    p.insert(&h)?;
                    for (k, v) in keys.iter().zip(vals) {
                        let mut c = (k.len() as u16).to_le_bytes().to_vec();
                        c.extend(k);
                        c.extend(v);
                        p.insert(&c)?;
                    }
                }
                Node::Internal { keys, children } => {
                    p.insert(&[1u8])?;
                    p.insert(&(children[0] as u64).to_le_bytes())?;
                    for (k, c) in keys.iter().zip(&children[1..]) {
                        let mut cell = (*c as u64).to_le_bytes().to_vec();
                        cell.extend(k);
                        p.insert(&cell)?;
                    }
                }
            }
            pages.push(p);
        }
        Ok(PageImage { pages, root: self.root, order: self.order })
    }

    pub fn from_pages(img: &PageImage) -> Result<BTree, BTreeError> {
        let mut t = BTree::new(img.order)?;
        t.nodes.clear();
        for (i, p) in img.pages.iter().enumerate() {
            let Some(h) = p.get(0) else {
                t.nodes.push(empty_leaf());
                t.free.push(i);
                continue;
            };
            let node = match h.first() {
                Some(0) if h.len() == 9 => {
                    let nx = u64::from_le_bytes(h[1..9].try_into().unwrap());
                    let (mut keys, mut vals) = (vec![], vec![]);
                    let mut s = 1;
                    while let Some(c) = p.get(s) {
                        if c.len() < 2 {
                            return Err(BTreeError::BadPage);
                        }
                        let kl = u16::from_le_bytes([c[0], c[1]]) as usize;
                        if c.len() < 2 + kl {
                            return Err(BTreeError::BadPage);
                        }
                        keys.push(c[2..2 + kl].to_vec());
                        vals.push(c[2 + kl..].to_vec());
                        s += 1;
                    }
                    t.len += keys.len();
                    Node::Leaf { keys, vals, next: (nx != u64::MAX).then_some(nx as usize) }
                }
                Some(1) if h.len() == 1 => {
                    let first = p.get(1).filter(|c| c.len() == 8).ok_or(BTreeError::BadPage)?;
                    let mut children = vec![u64::from_le_bytes(first.try_into().unwrap()) as usize];
                    let mut keys = vec![];
                    let mut s = 2;
                    while let Some(c) = p.get(s) {
                        if c.len() < 8 {
                            return Err(BTreeError::BadPage);
                        }
                        children.push(u64::from_le_bytes(c[..8].try_into().unwrap()) as usize);
                        keys.push(c[8..].to_vec());
                        s += 1;
                    }
                    Node::Internal { keys, children }
                }
                _ => return Err(BTreeError::BadPage),
            };
            t.nodes.push(node);
        }
        if img.root >= t.nodes.len() {
            return Err(BTreeError::BadPage);
        }
        t.root = img.root;
        t.validate_graph()?;
        t.check_invariants().map_err(|_| BTreeError::BadPage)?;
        Ok(t)
    }

    /** @id CODE-BT-010 @implements REQ-BT-012 */
    fn validate_graph(&self) -> Result<(), BTreeError> {
        let mut seen = vec![false; self.nodes.len()];
        let mut stack = vec![self.root];
        while let Some(id) = stack.pop() {
            if id >= self.nodes.len() || std::mem::replace(&mut seen[id], true) {
                return Err(BTreeError::BadPage);
            }
            if let Node::Internal { children, .. } = &self.nodes[id] {
                stack.extend(children);
            }
        }
        Ok(())
    }
}

from collections import Counter


# @id CODE-JOIN-007 @implements REQ-JOIN-007
def validate(left, right, left_keys, right_keys):
    if not left_keys or len(left_keys) != len(right_keys):
        raise ValueError("invalid join key arity")
    if any(any(k not in row for k in left_keys) for row in left):
        raise ValueError("missing left join key")
    if any(any(k not in row for k in right_keys) for row in right):
        raise ValueError("missing right join key")


def key_for(row, keys):
    key = tuple(row[k] for k in keys)
    return None if any(value is None for value in key) else key


def combine(left, right):
    return {**{"l." + k: v for k, v in left.items()}, **{"r." + k: v for k, v in right.items()}}


def buckets(data, keys):
    result = {}
    for row in data:
        key = key_for(row, keys)
        if key is not None:
            result.setdefault(key, []).append(row)
    return result


# @id CODE-JOIN-001 @implements REQ-JOIN-001
def hash_join(left, right, left_keys, right_keys):
    validate(left, right, left_keys, right_keys)
    index = buckets(right, right_keys)
    return [combine(l, r) for l in left for r in index.get(key_for(l, left_keys), ())]


# @id CODE-JOIN-002 @implements REQ-JOIN-002
def merge_join(left, right, left_keys, right_keys):
    validate(left, right, left_keys, right_keys)
    ls = sorted((key_for(r, left_keys), i, r) for i, r in enumerate(left) if key_for(r, left_keys) is not None)
    rs = sorted((key_for(r, right_keys), i, r) for i, r in enumerate(right) if key_for(r, right_keys) is not None)
    i, j, result = 0, 0, []
    while i < len(ls) and j < len(rs):
        if ls[i][0] < rs[j][0]:
            i += 1
        elif ls[i][0] > rs[j][0]:
            j += 1
        else:
            ie, je = i + 1, j + 1
            while ie < len(ls) and ls[ie][0] == ls[i][0]:
                ie += 1
            while je < len(rs) and rs[je][0] == rs[j][0]:
                je += 1
            result.extend(combine(l[2], r[2]) for l in ls[i:ie] for r in rs[j:je])
            i, j = ie, je
    return result


# @id CODE-JOIN-003 @implements REQ-JOIN-003
def semi_join(left, right, left_keys, right_keys):
    validate(left, right, left_keys, right_keys)
    index = buckets(right, right_keys)
    return [dict(r) for r in left if key_for(r, left_keys) in index]


# @id CODE-JOIN-004 @implements REQ-JOIN-004
def anti_join(left, right, left_keys, right_keys):
    validate(left, right, left_keys, right_keys)
    index = buckets(right, right_keys)
    return [dict(r) for r in left if key_for(r, left_keys) not in index]


# @id CODE-JOIN-005 @implements REQ-JOIN-005
def left_join(left, right, left_keys, right_keys, right_columns=None):
    validate(left, right, left_keys, right_keys)
    index = buckets(right, right_keys)
    columns = tuple(right_columns) if right_columns is not None else tuple(dict.fromkeys(k for r in right for k in r))
    columns = columns or tuple(right_keys)
    null_row = dict.fromkeys(columns)
    return [combine(l, r) for l in left for r in index.get(key_for(l, left_keys), [null_row])]


# @id CODE-JOIN-006 @implements REQ-JOIN-006
def choose_join(left_count, right_count, left_sorted=False, right_sorted=False):
    return {"strategy": "merge" if left_sorted and right_sorted else "hash", "work": left_count + right_count}


# @id CODE-JOIN-008 @implements REQ-JOIN-008
def join_count(left, right, left_keys, right_keys):
    validate(left, right, left_keys, right_keys)
    counts = Counter(key_for(r, right_keys) for r in right if key_for(r, right_keys) is not None)
    return sum(counts[key_for(r, left_keys)] for r in left)

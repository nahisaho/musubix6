import struct


# @id CODE-ENC-009 @implements REQ-ENC-009
def scalar_key(value):
    if type(value) not in (type(None), bool, int, float, str, bytes):
        raise ValueError("unsupported scalar type")
    return (type(value), struct.pack("!d", value) if type(value) is float else value)


# @id CODE-ENC-001 @implements REQ-ENC-001
def encode_dictionary(values):
    dictionary, codes, index = [], [], {}
    for value in values:
        key = scalar_key(value)
        if key not in index:
            index[key] = len(dictionary)
            dictionary.append(value)
        codes.append(index[key])
    return "dict", tuple(dictionary), tuple(codes)


# @id CODE-ENC-002 @implements REQ-ENC-002
def decode_dictionary(payload):
    kind, dictionary, codes = payload
    if kind != "dict" or any(not isinstance(c, int) or c < 0 or c >= len(dictionary) for c in codes):
        raise ValueError("invalid dictionary payload")
    return [dictionary[c] for c in codes]


# @id CODE-ENC-003 @implements REQ-ENC-003
def encode_rle(values):
    runs = []
    for value in values:
        key = scalar_key(value)
        if runs and scalar_key(runs[-1][0]) == key:
            runs[-1] = value, runs[-1][1] + 1
        else:
            runs.append((value, 1))
    return "rle", tuple(runs)


# @id CODE-ENC-004 @implements REQ-ENC-004
def decode_rle(payload):
    kind, runs = payload
    if kind != "rle" or any(not isinstance(n, int) or n <= 0 for _, n in runs):
        raise ValueError("invalid RLE payload")
    return [value for value, count in runs for _ in range(count)]


# @id CODE-ENC-005 @implements REQ-ENC-005
def choose_encoding(values):
    values = tuple(values)
    dictionary, rle = encode_dictionary(values), encode_rle(values)
    return dictionary if encoded_size(dictionary) <= encoded_size(rle) else rle


# @id CODE-ENC-006 @implements REQ-ENC-006
def encoded_size(payload):
    if payload[0] == "dict":
        return len(payload[1]) + len(payload[2])
    if payload[0] == "rle":
        return 2 * len(payload[1])
    raise ValueError("unknown encoding")


def decode(payload):
    if payload[0] == "dict":
        return decode_dictionary(payload)
    if payload[0] == "rle":
        return decode_rle(payload)
    raise ValueError("unknown encoding")


# @id CODE-ENC-007 @implements REQ-ENC-007
def slice_encoded(payload, start=None, stop=None):
    encoder = encode_dictionary if payload[0] == "dict" else encode_rle
    return encoder(decode(payload)[start:stop])


# @id CODE-ENC-008 @implements REQ-ENC-008
def dictionary_lookup(payload, value):
    _, dictionary, codes = payload
    matching = {i for i, item in enumerate(dictionary) if item == value}
    return [i for i, code in enumerate(codes) if code in matching]

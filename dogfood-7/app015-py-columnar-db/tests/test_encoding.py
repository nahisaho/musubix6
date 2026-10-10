import pytest
from columnar.encoding import (
    encode_dictionary, decode_dictionary, encode_rle, decode_rle,
    choose_encoding, encoded_size, slice_encoded, dictionary_lookup,
)


# @id TEST-ENC-001 @verifies REQ-ENC-001
def test_enc_001():
    assert encode_dictionary(["b", None, "b", "a"]) == ("dict", ("b", None, "a"), (0, 1, 0, 2))
    assert encode_dictionary([]) == ("dict", (), ())


# @id TEST-ENC-002 @verifies REQ-ENC-002
def test_enc_002():
    assert decode_dictionary(("dict", ("a", None), (1, 0, 1))) == [None, "a", None]
    with pytest.raises(ValueError):
        decode_dictionary(("dict", ("a",), (-1,)))


# @id TEST-ENC-003 @verifies REQ-ENC-003
def test_enc_003():
    assert encode_rle([1, 1, None, None, 1]) == ("rle", ((1, 2), (None, 2), (1, 1)))
    assert encode_rle([]) == ("rle", ())


# @id TEST-ENC-004 @verifies REQ-ENC-004
def test_enc_004():
    assert decode_rle(("rle", ((None, 2), (4, 1)))) == [None, None, 4]
    with pytest.raises(ValueError):
        decode_rle(("rle", ((1, 0),)))


# @id TEST-ENC-005 @verifies REQ-ENC-005
def test_enc_005():
    assert choose_encoding([7] * 20)[0] == "rle"
    assert choose_encoding([1, 2, 1, 2])[0] == "dict"
    assert choose_encoding([])[0] == "dict"


# @id TEST-ENC-006 @verifies REQ-ENC-006
def test_enc_006():
    assert encoded_size(("dict", (1, 2), (0, 1, 0))) == 5
    assert encoded_size(("rle", ((1, 9), (2, 3)))) == 4


# @id TEST-ENC-007 @verifies REQ-ENC-007
def test_enc_007():
    assert decode_dictionary(slice_encoded(("dict", ("a", "b"), (0, 1, 0)), 1, 3)) == ["b", "a"]
    assert decode_rle(slice_encoded(("rle", ((1, 4), (2, 2))), -3, None)) == [1, 2, 2]


# @id TEST-ENC-008 @verifies REQ-ENC-008
def test_enc_008():
    assert dictionary_lookup(("dict", ("x", None), (0, 1, 0)), "x") == [0, 2]
    assert dictionary_lookup(("dict", ("x", None), (0, 1, 0)), None) == [1]
    assert dictionary_lookup(("dict", ("x",), (0,)), "absent") == []


# @id TEST-ENC-009 @verifies REQ-ENC-009
def test_enc_009():
    import math
    for encoder, decoder in [(encode_dictionary, decode_dictionary), (encode_rle, decode_rle)]:
        result = decoder(encoder([0.0, -0.0, 0.0]))
        assert [math.copysign(1, v) for v in result] == [1, -1, 1]
        with pytest.raises(ValueError):
            encoder([[]])

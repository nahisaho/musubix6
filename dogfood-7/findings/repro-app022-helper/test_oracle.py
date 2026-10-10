from production import actual


# @id TEST-ORACLE-001 @verifies REQ-ORACLE-001
def test_oracle_001():
    assert actual() == expected()


def expected():
    return 1

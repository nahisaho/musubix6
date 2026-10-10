from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN, localcontext

EXPONENTS = {"USD": 2, "EUR": 2, "GBP": 2, "JPY": 0, "KWD": 3}


# @id CODE-MONEY-001 @implements REQ-MONEY-001 REQ-MONEY-002 REQ-MONEY-003 REQ-MONEY-004 REQ-MONEY-005 REQ-MONEY-006
def decimal(value):
    if isinstance(value, (float, bool)) or not isinstance(value, (str, int, Decimal)):
        raise ValueError("invalid amount type")
    try:
        result = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("invalid amount") from exc
    if not result.is_finite():
        raise ValueError("nonfinite amount")
    return result

def quantum(currency):
    if currency not in EXPONENTS:
        raise ValueError("unknown currency")
    return Decimal(1).scaleb(-EXPONENTS[currency])

def minor(value, currency):
    number = exact(value, currency)
    sign, digits, exponent = number.as_tuple()
    coefficient = int("".join(map(str, digits)))
    shift = exponent + EXPONENTS[currency]
    units = coefficient * 10 ** shift if shift >= 0 else coefficient // 10 ** -shift
    return -units if sign else units

def from_minor(units, currency):
    return Decimal((int(units < 0), tuple(map(int, str(abs(units)))), -EXPONENTS[currency]))

def rounded(value, currency):
    number = decimal(value)
    with localcontext() as context:
        context.prec = max(28, len(number.as_tuple().digits) + abs(number.adjusted()) + 8)
        return number.quantize(quantum(currency), rounding=ROUND_HALF_EVEN)

def exact(value, currency):
    number = decimal(value)
    if number != rounded(number, currency):
        raise ValueError("amount precision")
    return number


# @id CODE-MONEY-002 @implements REQ-MONEY-007 REQ-MONEY-008 REQ-MONEY-009
def allocate(value, currency, weights):
    weights = tuple(weights)
    if not weights or any(type(w) is not int or w < 0 for w in weights) or not sum(weights):
        raise ValueError("invalid weights")
    amount = exact(value, currency)
    if amount < 0:
        raise ValueError("negative amount")
    units = minor(amount, currency)
    total = sum(weights)
    pieces = [units * weight // total for weight in weights]
    order = sorted(range(len(weights)), key=lambda i: (-(units * weights[i] % total), i))
    for i in order[:units - sum(pieces)]:
        pieces[i] += 1
    return [from_minor(piece, currency) for piece in pieces]

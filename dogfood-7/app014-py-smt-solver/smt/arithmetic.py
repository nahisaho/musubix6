from fractions import Fraction
from smt.terms import Relation, rational


# @id CODE-ARITHMETIC-001 @implements REQ-ARITHMETIC-005 REQ-ARITHMETIC-006 REQ-ARITHMETIC-007
def simplex(matrix, bounds, objective):
    """Maximize c*x subject to A*x <= b and x >= 0, with two exact phases."""
    m, n = len(bounds), len(objective)
    if len(matrix) != m or any(len(row) != n for row in matrix):
        raise ValueError("inconsistent LP dimensions")
    table = [[Fraction(0) for _ in range(n + 2)] for _ in range(m + 2)]
    basic = [n + i for i in range(m)]
    nonbasic = list(range(n)) + [-1]
    for i in range(m):
        table[i][:n] = [rational(value) for value in matrix[i]]
        table[i][n] = Fraction(-1)
        table[i][n + 1] = rational(bounds[i])
    table[m][:n] = [-rational(value) for value in objective]
    table[m + 1][n] = Fraction(1)

    def pivot(row, col):
        value = table[row][col]
        for i in range(m + 2):
            if i == row:
                continue
            for j in range(n + 2):
                if j != col:
                    table[i][j] -= table[row][j] * table[i][col] / value
        for j in range(n + 2):
            if j != col:
                table[row][j] /= value
        for i in range(m + 2):
            if i != row:
                table[i][col] /= -value
        table[row][col] = 1 / value
        basic[row], nonbasic[col] = nonbasic[col], basic[row]

    def phase(number):
        obj = m + 1 if number == 1 else m
        while True:
            candidates = [j for j in range(n + 1) if table[obj][j] < 0
                          and (number == 1 or nonbasic[j] != -1)]
            if not candidates:
                return True
            col = min(candidates, key=lambda j: nonbasic[j])
            rows = [i for i in range(m) if table[i][col] > 0]
            if not rows:
                return False
            row = min(rows, key=lambda i: (table[i][n + 1] / table[i][col], basic[i]))
            pivot(row, col)

    if m:
        row = min(range(m), key=lambda i: table[i][n + 1])
        if table[row][n + 1] < 0:
            pivot(row, n)
            if not phase(1) or table[m + 1][n + 1] != 0:
                return "infeasible", None, None
            for row in range(m):
                if basic[row] == -1:
                    candidates = [j for j in range(n + 1)
                                  if nonbasic[j] != -1 and table[row][j] != 0]
                    if candidates:
                        pivot(row, min(candidates, key=lambda j: nonbasic[j]))
    optimal = phase(2)
    solution = [Fraction(0)] * n
    for row in range(m):
        if 0 <= basic[row] < n:
            solution[basic[row]] = table[row][n + 1]
    return ("optimal" if optimal else "unbounded"), solution, table[m][n + 1]


# @id CODE-ARITHMETIC-002 @implements REQ-ARITHMETIC-001 REQ-ARITHMETIC-002 REQ-ARITHMETIC-003 REQ-ARITHMETIC-004 REQ-ARITHMETIC-005 REQ-ARITHMETIC-006 REQ-ARITHMETIC-007 REQ-ARITHMETIC-008
def feasible(relations):
    relations = list(relations)
    if any(not isinstance(relation, Relation) for relation in relations):
        raise TypeError("arithmetic relations required")
    names = sorted({name for relation in relations for name, _ in relation.expression.coeffs})
    strict = any(relation.op in ("lt", "gt") for relation in relations)
    n = 2 * len(names) + int(strict)
    matrix, bounds = [], []
    for relation in relations:
        expression, op = relation.expression, relation.op
        signs = [1, -1] if op == "eq" else [-1] if op in ("ge", "gt") else [1]
        for sign in signs:
            coeffs = dict(expression.coeffs)
            row = [sign * coeffs.get(name, Fraction(0)) for name in names]
            row += [-value for value in row]
            if strict:
                row.append(Fraction(int(op in ("lt", "gt"))))
            matrix.append(row)
            bounds.append(-sign * expression.constant)
    objective = [Fraction(0)] * n
    if strict:
        matrix.append([Fraction(0)] * (n - 1) + [Fraction(1)])
        bounds.append(Fraction(1))
        objective[-1] = Fraction(1)
    status, values, _ = simplex(matrix, bounds, objective)
    if status == "infeasible" or (strict and values[-1] <= 0):
        return None
    model = {name: values[i] - values[i + len(names)] for i, name in enumerate(names)}
    if not all(relation.holds(model) for relation in relations):
        raise AssertionError("simplex returned invalid model")
    return model

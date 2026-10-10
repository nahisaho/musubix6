class StepLimitError(RuntimeError):
    """Evaluation work exceeded the configured transition budget."""


# @id CODE-SAFETY-001
# @implements REQ-SAFETY-001 REQ-SAFETY-002
class Budget:
    def __init__(self, limit):
        if type(limit) is not int or limit < 1:
            raise ValueError("step_limit must be a positive integer")
        self.limit = limit
        self.steps = 0

    def tick(self):
        self.steps += 1
        if self.steps > self.limit:
            raise StepLimitError(f"step limit {self.limit} exceeded")

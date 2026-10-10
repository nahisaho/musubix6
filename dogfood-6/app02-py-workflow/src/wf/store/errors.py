class StoreError(Exception):
    pass


class IllegalTransition(StoreError):
    pass


class CorruptJournal(StoreError):
    pass

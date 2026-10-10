package ledger.accounts;

import java.util.LinkedHashMap;
import java.util.Map;

public class Chart {
    private final Map<String, Account> accounts = new LinkedHashMap<>();

    /** @id CODE-ACCT-003 @implements REQ-ACCT-003 */
    public void add(Account a) {
        if (accounts.containsKey(a.code())) {
            throw new DuplicateAccountException(a.code());
        }
        accounts.put(a.code(), a);
    }

    /** @id CODE-ACCT-006 @implements REQ-ACCT-006 */
    public void add(Account a, String parent) {
        Account p = find(parent);
        if (p.type() != a.type()) {
            throw new IllegalArgumentException("parent type differs");
        }
        add(a.withParent(parent));
    }

    /** @id CODE-ACCT-004 @implements REQ-ACCT-004 */
    public Account find(String code) {
        Account a = accounts.get(code);
        if (a == null) {
            throw new AccountNotFoundException(code);
        }
        return a;
    }

    /** @id CODE-ACCT-005 @implements REQ-ACCT-005 */
    public void deactivate(String code) {
        accounts.put(code, find(code).withActive(false));
    }
}

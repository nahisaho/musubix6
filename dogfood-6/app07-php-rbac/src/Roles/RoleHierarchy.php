<?php
declare(strict_types=1);

namespace Rbac\Roles;

final class RoleHierarchy
{
    /** @var array<string, string[]> */
    private array $parents = [];

    /** @id CODE-ROLES-001 @implements REQ-ROLES-001 REQ-ROLES-002 */
    public function addRole(string $role): void
    {
        self::validate($role);
        $this->parents[$role] ??= [];
    }

    public function has(string $role): bool
    {
        return isset($this->parents[$role]);
    }

    /** @id CODE-ROLES-002 @implements REQ-ROLES-003 REQ-ROLES-004 */
    public function inherit(string $child, string $parent): void
    {
        self::validate($child);
        self::validate($parent);
        if ($child === $parent || in_array($child, $this->effectiveRoles($parent), true)) {
            throw new \LogicException("cycle: $child -> $parent");
        }
        $this->addRole($child);
        $this->addRole($parent);
        if (!in_array($parent, $this->parents[$child], true)) {
            $this->parents[$child][] = $parent;
        }
    }

    public function parentsOf(string $role): array
    {
        return $this->parents[$role] ?? [];
    }

    /** @id CODE-ROLES-003 @implements REQ-ROLES-005 REQ-ROLES-006 */
    public function effectiveRoles(string $role): array
    {
        if (!$this->has($role)) {
            return [];
        }
        $seen = [];
        $stack = [$role];
        while ($stack) {
            $r = array_pop($stack);
            if (isset($seen[$r])) {
                continue;
            }
            $seen[$r] = true;
            foreach ($this->parents[$r] ?? [] as $p) {
                $stack[] = $p;
            }
        }
        return array_keys($seen);
    }

    /** @id CODE-ROLES-004 @implements REQ-ROLES-007 */
    public function effectiveRolesOf(array $roles): array
    {
        $all = [];
        foreach ($roles as $r) {
            foreach ($this->effectiveRoles($r) as $e) {
                $all[$e] = true;
            }
        }
        $names = array_map('strval', array_keys($all));
        sort($names, SORT_STRING);
        return $names;
    }

    private static function validate(string $role): void
    {
        if (preg_match('/^[A-Za-z0-9_.-]+$/D', $role) !== 1) {
            throw new \InvalidArgumentException("invalid role name: '$role'");
        }
    }
}

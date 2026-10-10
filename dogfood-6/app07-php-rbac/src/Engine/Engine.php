<?php
declare(strict_types=1);

namespace Rbac\Engine;

use Rbac\Roles\RoleHierarchy;

class Engine
{
    /** @var array<string, Policy> */
    private array $policies = [];

    public function __construct(private RoleHierarchy $roles)
    {
    }

    /** @id CODE-ENG-003 @implements REQ-ENG-008 REQ-ENG-009 */
    public function addPolicy(Policy $p): void
    {
        if ($p->effect !== 'allow' && $p->effect !== 'deny') {
            throw new \InvalidArgumentException("invalid effect '{$p->effect}'");
        }
        if (isset($this->policies[$p->id])) {
            throw new \LogicException("duplicate policy id {$p->id}");
        }
        $this->policies[$p->id] = $p;
    }

    /** @id CODE-ENG-004 @implements REQ-ENG-001 REQ-ENG-003 REQ-ENG-007 */
    public function decide(Request $r): Decision
    {
        $eff = $this->roles->effectiveRolesOf($r->roles);
        $matched = [];
        $deny = false;
        foreach ($this->policies as $p) {
            if (Matcher::matches($p, $eff, $r)) {
                $matched[] = $p->id;
                $deny = $deny || $p->effect === 'deny';
            }
        }
        sort($matched, SORT_STRING);
        if ($deny) {
            return Decision::deny('deny-policy', $matched);
        }
        return $matched === []
            ? Decision::deny('default-deny')
            : Decision::allow($matched);
    }
}

<?php
declare(strict_types=1);

namespace Rbac\Engine;

use Rbac\Conditions\Condition;
use Rbac\Conditions\ParseException;

final class Matcher
{
    /** @id CODE-ENG-001 @implements REQ-ENG-005 */
    public static function pattern(string $pattern, string $value): bool
    {
        if ($pattern !== '' && str_ends_with($pattern, '*')) {
            return str_starts_with($value, substr($pattern, 0, -1));
        }
        return $pattern === $value;
    }

    /** @param string[] $patterns */
    public static function anyPattern(array $patterns, string $value): bool
    {
        foreach ($patterns as $p) {
            if (self::pattern($p, $value)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @id CODE-ENG-002 @implements REQ-ENG-002 REQ-ENG-004 REQ-ENG-006
     * @param string[] $effectiveRoles
     */
    public static function matches(Policy $p, array $effectiveRoles, Request $r): bool
    {
        if (array_intersect($p->roles, $effectiveRoles) === []) {
            return false;
        }
        if (!self::anyPattern($p->actions, $r->action) || !self::anyPattern($p->resources, $r->resource)) {
            return false;
        }
        try {
            return Condition::evaluate($p->condition, [
                'subject' => $r->subject,
                'resource' => $r->resourceAttrs,
                'env' => $r->env,
            ]);
        } catch (ParseException) {
            return $p->effect === 'deny';
        }
    }
}

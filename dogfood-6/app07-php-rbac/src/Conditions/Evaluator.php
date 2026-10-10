<?php
declare(strict_types=1);

namespace Rbac\Conditions;

final class Evaluator
{
    private const MISSING = "\0missing";

    /** @id CODE-COND-003 @implements REQ-COND-001 REQ-COND-002 REQ-COND-004 REQ-COND-005 REQ-COND-008 REQ-COND-009 */
    public static function run(array $ast, array $ctx): bool
    {
        return self::tri($ast, $ctx) === true;
    }

    /** Three-valued evaluation: null = unknown (missing attribute), which stays unknown under negation. */
    private static function tri(array $ast, array $ctx): ?bool
    {
        switch ($ast[0]) {
            case 'or':
                $a = self::tri($ast[1], $ctx);
                $b = self::tri($ast[2], $ctx);
                return $a === true || $b === true ? true : ($a === null || $b === null ? null : false);
            case 'and':
                $a = self::tri($ast[1], $ctx);
                $b = self::tri($ast[2], $ctx);
                return $a === false || $b === false ? false : ($a === null || $b === null ? null : true);
            case 'not':
                $a = self::tri($ast[1], $ctx);
                return $a === null ? null : !$a;
            case 'in':
                $l = self::value($ast[1], $ctx);
                if ($l === self::MISSING) {
                    return null;
                }
                foreach ($ast[2] as $item) {
                    if ($l === self::value($item, $ctx)) {
                        return true;
                    }
                }
                return false;
            case 'cmp':
                return self::compare($ast[1], self::value($ast[2], $ctx), self::value($ast[3], $ctx));
            default:
                $v = self::value($ast, $ctx);
                return $v === self::MISSING ? null : $v === true;
        }
    }

    private static function compare(string $op, mixed $l, mixed $r): ?bool
    {
        if ($l === self::MISSING || $r === self::MISSING) {
            return null;
        }
        if ($op === '==') {
            return $l === $r;
        }
        if ($op === '!=') {
            return $l !== $r;
        }
        if (!(is_int($l) || is_float($l)) || !(is_int($r) || is_float($r))) {
            return false;
        }
        return match ($op) {
            '<' => $l < $r,
            '<=' => $l <= $r,
            '>' => $l > $r,
            '>=' => $l >= $r,
        };
    }

    private static function value(array $node, array $ctx): mixed
    {
        if ($node[0] === 'lit') {
            return $node[1];
        }
        if ($node[0] !== 'path') {
            return self::tri($node, $ctx);
        }
        $cur = $ctx;
        foreach (explode('.', $node[1]) as $seg) {
            if (!is_array($cur) || !array_key_exists($seg, $cur)) {
                return self::MISSING;
            }
            $cur = $cur[$seg];
        }
        return $cur;
    }
}

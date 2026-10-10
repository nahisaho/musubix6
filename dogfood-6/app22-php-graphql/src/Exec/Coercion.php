<?php
declare(strict_types=1);

namespace GraphqlLite\Exec;

use GraphqlLite\Query\Ast\Operation;
use GraphqlLite\Schema\Schema;
use GraphqlLite\Sdl\FieldDef;
use GraphqlLite\Sdl\TypeRef;

final class Coercion
{
    /** Marker for "no value" (an unprovided variable). */
    public static function omit(): object
    {
        static $o;
        return $o ??= new \stdClass();
    }

    /**
     * @id CODE-EXE-001 @implements REQ-EXE-003 REQ-EXE-004
     * @return array{0:array<string,mixed>,1:string[]}
     */
    public static function variables(Schema $schema, Operation $op, array $input): array
    {
        $values = [];
        $errors = [];
        foreach ($op->variables as $name => $def) {
            $t = $def->type;
            if (!array_key_exists($name, $input)) {
                if ($def->default !== null) {
                    $values[$name] = self::literal($schema, $def->default, $t, []);
                } elseif ($t->isNonNull()) {
                    $errors[] = "Variable \"\$$name\" of required type \"$t\" was not provided.";
                }
                continue;
            }
            if ($input[$name] === null && $t->isNonNull()) {
                $errors[] = "Variable \"\$$name\" of non-null type \"$t\" must not be null.";
                continue;
            }
            try {
                $values[$name] = self::input($schema, $input[$name], $t, $name);
            } catch (CoercionError $e) {
                $errors[] = "Variable \"\$$name\" got invalid value " . self::show($input[$name]) . ($e->at !== '' ? " at \"{$e->at}\"" : '') . '; ' . $e->getMessage();
            }
        }
        return [$values, $errors];
    }

    /** @throws CoercionError */
    public static function input(Schema $schema, mixed $v, TypeRef $t, string $path): mixed
    {
        if ($t->kind === 'nonnull') {
            if ($v === null) {
                throw new CoercionError("Expected non-nullable type \"$t\" not to be null.", $path);
            }
            return self::input($schema, $v, $t->of, $path);
        }
        if ($v === null) {
            return null;
        }
        if ($t->kind === 'list') {
            if (is_array($v) && array_is_list($v)) {
                $out = [];
                foreach ($v as $i => $item) {
                    $out[] = self::input($schema, $item, $t->of, "{$path}[$i]");
                }
                return $out;
            }
            return [self::input($schema, $v, $t->of, $path)];
        }
        $name = (string) $t->name;
        $def = $schema->type($name);
        switch ($def?->kind) {
            case 'enum':
                if (is_string($v) && isset($def->enumValues[$v])) {
                    return $v;
                }
                throw new CoercionError("Value " . self::show($v) . " does not exist in \"$name\" enum.", $path);
            case 'input':
                if (!is_array($v) || ($v && array_is_list($v))) {
                    throw new CoercionError("Expected type \"$name\" to be an object.", $path);
                }
                $out = [];
                foreach (array_keys($v) as $k) {
                    if (!isset($def->fields[$k])) {
                        throw new CoercionError("Field \"$k\" is not defined by type \"$name\".", $path);
                    }
                }
                foreach ($def->fields as $k => $f) {
                    if (array_key_exists($k, $v)) {
                        $out[$k] = self::input($schema, $v[$k], $f->type, $path === '' ? $k : "$path.$k");
                    } elseif ($f->default !== null) {
                        $out[$k] = self::literal($schema, $f->default, $f->type, []);
                    } elseif ($f->type->isNonNull()) {
                        throw new CoercionError("Field \"$k\" of required type \"{$f->type}\" was not provided.", $path);
                    }
                }
                return $out;
            case 'scalar':
                return self::parseScalar($name, $v, $path);
        }
        throw new CoercionError("Type \"$name\" is not an input type.", $path);
    }

    private static function accepts(string $name, mixed $v, bool $output): bool
    {
        return match ($name) {
            'Int' => (is_int($v) && self::inRange($v)) || (is_float($v) && is_finite($v) && floor($v) === $v && self::inRange($v)),
            'Float' => is_int($v) || (is_float($v) && is_finite($v)),
            'String' => is_string($v) || ($output && (is_int($v) || is_float($v))),
            'Boolean' => is_bool($v),
            'ID' => is_string($v) || is_int($v),
            default => true,
        };
    }

    private static function parseScalar(string $name, mixed $v, string $path): mixed
    {
        $ok = self::accepts($name, $v, false);
        if (!$ok) {
            throw new CoercionError("$name cannot represent value: " . self::show($v), $path);
        }
        return match ($name) {
            'Int' => (int) $v,
            'Float' => (float) $v,
            'ID' => (string) $v,
            default => $v,
        };
    }

    private static function inRange(int|float $n): bool
    {
        return $n >= -2147483648 && $n <= 2147483647;
    }

    /**
     * Converts a literal AST value, substituting coerced variables; returns omit() for an unprovided variable.
     * @id CODE-EXE-002 @implements REQ-EXE-015
     * @throws CoercionError
     */
    public static function literal(Schema $schema, array $ast, TypeRef $t, array $vars): mixed
    {
        if ($ast['kind'] === 'Variable') {
            if (!array_key_exists($ast['value'], $vars)) {
                return self::omit();
            }
            if ($vars[$ast['value']] === null && $t->isNonNull()) {
                throw new CoercionError("Variable \"\${$ast['value']}\" must not be null for type \"$t\".");
            }
            return $vars[$ast['value']];
        }
        if ($t->kind === 'nonnull') {
            if ($ast['kind'] === 'Null') {
                throw new CoercionError("Expected non-nullable type \"$t\" not to be null.");
            }
            return self::literal($schema, $ast, $t->of, $vars);
        }
        if ($ast['kind'] === 'Null') {
            return null;
        }
        if ($t->kind === 'list') {
            if ($ast['kind'] !== 'List') {
                $r = self::literal($schema, $ast, $t->of, $vars);
                return $r === self::omit() ? $r : [$r];
            }
            $out = [];
            foreach ($ast['value'] as $item) {
                $r = self::literal($schema, $item, $t->of, $vars);
                if ($r === self::omit()) {
                    if ($t->of->isNonNull()) {
                        throw new CoercionError('Missing variable for non-null list item.');
                    }
                    $r = null;
                }
                $out[] = $r;
            }
            return $out;
        }
        $name = (string) $t->name;
        $def = $schema->type($name);
        switch ($def?->kind) {
            case 'enum':
                if ($ast['kind'] === 'Enum' && isset($def->enumValues[$ast['value']])) {
                    return $ast['value'];
                }
                throw new CoercionError("Value does not exist in \"$name\" enum.");
            case 'input':
                if ($ast['kind'] !== 'Object') {
                    throw new CoercionError("Expected type \"$name\" to be an object.");
                }
                $out = [];
                foreach ($def->fields as $k => $f) {
                    $r = array_key_exists($k, $ast['value']) ? self::literal($schema, $ast['value'][$k], $f->type, $vars) : self::omit();
                    if ($r === self::omit()) {
                        if ($f->default !== null) {
                            $out[$k] = self::literal($schema, $f->default, $f->type, []);
                        } elseif ($f->type->isNonNull()) {
                            throw new CoercionError("Field \"$k\" of required type \"{$f->type}\" was not provided.");
                        }
                    } else {
                        $out[$k] = $r;
                    }
                }
                return $out;
            case 'scalar':
                return self::literalScalar($name, $ast);
        }
        throw new CoercionError("Type \"$name\" is not an input type.");
    }

    private static function literalScalar(string $name, array $ast): mixed
    {
        $k = $ast['kind'];
        $v = $ast['value'];
        return match (true) {
            $name === 'Int' && $k === 'Int' && self::inRange((int) $v) => (int) $v,
            $name === 'Float' && ($k === 'Int' || $k === 'Float') => (float) $v,
            $name === 'String' && $k === 'String' => $v,
            $name === 'Boolean' && $k === 'Boolean' => $v,
            $name === 'ID' && $k === 'String' => $v,
            $name === 'ID' && $k === 'Int' => (string) $v,
            !in_array($name, Schema::BUILTIN_SCALARS, true) => self::plain($ast),
            default => throw new CoercionError("$name cannot represent a $k literal."),
        };
    }

    private static function plain(array $ast): mixed
    {
        return match ($ast['kind']) {
            'Int' => (int) $ast['value'],
            'Float' => (float) $ast['value'],
            'List' => array_map(fn($x) => self::plain($x), $ast['value']),
            'Object' => array_map(fn($x) => self::plain($x), $ast['value']),
            default => $ast['value'],
        };
    }

    /**
     * @param array<string,array> $args AST args
     * @return array<string,mixed>
     * @throws CoercionError
     */
    public static function arguments(Schema $schema, FieldDef $def, array $args, array $vars): array
    {
        $out = [];
        foreach ($def->args as $name => $a) {
            $r = array_key_exists($name, $args) ? self::literal($schema, $args[$name], $a->type, $vars) : self::omit();
            if ($r !== self::omit()) {
                $out[$name] = $r;
            } elseif ($a->default !== null) {
                $out[$name] = self::literal($schema, $a->default, $a->type, []);
            } elseif ($a->type->isNonNull()) {
                throw new CoercionError("Argument \"$name\" of required type \"{$a->type}\" was not provided.");
            }
        }
        return $out;
    }

    /**
     * @id CODE-EXE-003 @implements REQ-EXE-011
     * @throws CoercionError
     */
    public static function serialize(Schema $schema, string $name, mixed $v): mixed
    {
        $def = $schema->type($name);
        if ($def?->kind === 'enum') {
            if (is_string($v) && isset($def->enumValues[$v])) {
                return $v;
            }
            throw new CoercionError("Enum \"$name\" cannot represent value: " . self::show($v));
        }
        $ok = self::accepts($name, $v, true);
        if (!$ok) {
            throw new CoercionError("$name cannot represent value: " . self::show($v));
        }
        return match ($name) {
            'Int' => (int) $v,
            'Float' => (float) $v,
            'String', 'ID' => (string) $v,
            default => $v,
        };
    }

    /** @id CODE-EXE-007 @implements REQ-EXE-016 */
    public static function show(mixed $v): string
    {
        if (is_float($v) && is_nan($v)) {
            return 'NaN';
        }
        if (is_float($v) && is_infinite($v)) {
            return $v > 0 ? 'INF' : '-INF';
        }
        $j = json_encode($v, JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
        return $j === false || $j === 'null' && $v !== null ? get_debug_type($v) : $j;
    }
}

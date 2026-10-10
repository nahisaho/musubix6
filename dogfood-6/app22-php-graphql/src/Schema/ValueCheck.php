<?php
declare(strict_types=1);

namespace GraphqlLite\Schema;

use GraphqlLite\Sdl\TypeRef;

final class ValueCheck
{
    /**
     * Checks a literal AST value against an input type; returns an error text or null.
     * @id CODE-SCH-004 @implements REQ-SCH-012
     */
    public static function fits(Schema $schema, array $value, TypeRef $type): ?string
    {
        if ($type->kind === 'nonnull') {
            if ($value['kind'] === 'Null') {
                return "expected non-null $type but got null";
            }
            return self::fits($schema, $value, $type->of);
        }
        if ($value['kind'] === 'Variable') {
            return null;
        }
        if ($value['kind'] === 'Null') {
            return null;
        }
        if ($type->kind === 'list') {
            if ($value['kind'] !== 'List') {
                return self::fits($schema, $value, $type->of);
            }
            foreach ($value['value'] as $i => $item) {
                $err = self::fits($schema, $item, $type->of);
                if ($err !== null) {
                    return "[$i]: $err";
                }
            }
            return null;
        }
        $name = (string) $type->name;
        $def = $schema->type($name);
        if ($def === null) {
            return null;
        }
        switch ($def->kind) {
            case 'enum':
                if ($value['kind'] !== 'Enum') {
                    return "expected enum $name but got {$value['kind']}";
                }
                return isset($def->enumValues[$value['value']]) ? null : "\"{$value['value']}\" is not a value of enum $name";
            case 'input':
                if ($value['kind'] !== 'Object') {
                    return "expected input object $name but got {$value['kind']}";
                }
                foreach ($value['value'] as $k => $v) {
                    if (!isset($def->fields[$k])) {
                        return "unknown field \"$k\" of input $name";
                    }
                    $err = self::fits($schema, $v, $def->fields[$k]->type);
                    if ($err !== null) {
                        return "$k: $err";
                    }
                }
                foreach ($def->fields as $k => $f) {
                    if ($f->type->isNonNull() && $f->default === null && !array_key_exists($k, $value['value'])) {
                        return "missing required field \"$k\" of input $name";
                    }
                }
                return null;
            case 'scalar':
                return self::scalar($name, $value);
        }
        return "$name is not an input type";
    }

    private static function scalar(string $name, array $value): ?string
    {
        $k = $value['kind'];
        $ok = match ($name) {
            'Int' => $k === 'Int' && self::int32($value['value']),
            'Float' => $k === 'Int' || $k === 'Float',
            'String' => $k === 'String',
            'Boolean' => $k === 'Boolean',
            'ID' => $k === 'Int' || $k === 'String',
            default => true,
        };
        return $ok ? null : "expected $name but got $k" . ($k === 'Int' && $name === 'Int' ? ' out of 32-bit range' : '');
    }

    public static function int32(string $digits): bool
    {
        return preg_match('/^-?\d+$/', $digits) === 1 && (int) $digits >= -2147483648 && (int) $digits <= 2147483647 && (string) (int) $digits === ltrim($digits, '+');
    }
}

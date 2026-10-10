<?php
declare(strict_types=1);

namespace GraphqlLite\Schema;

use GraphqlLite\Sdl\Definition;

final class Validator
{
    /** @var string[] */
    private array $errors = [];

    public function __construct(private readonly Schema $schema)
    {
    }

    /**
     * @id CODE-SCH-005 @implements REQ-SCH-003 REQ-SCH-004 REQ-SCH-006 REQ-SCH-007 REQ-SCH-008 REQ-SCH-009 REQ-SCH-011
     * @return string[]
     */
    public function validate(): array
    {
        $this->errors = [];
        $this->builtins();
        $this->roots();
        foreach ($this->schema->types() as $def) {
            match ($def->kind) {
                'object', 'interface' => $this->composite($def),
                'input' => $this->inputType($def),
                'union' => $this->union($def),
                'enum' => $this->enum($def),
                default => null,
            };
        }
        $this->interfaceCycles();
        $this->inputCycles();
        return $this->errors;
    }

    private function err(string $m): void
    {
        $this->errors[] = $m;
    }

    private function builtins(): void
    {
        foreach (Schema::BUILTIN_SCALARS as $n) {
            if (in_array($n, $this->schema->userTypeNames(), true)) {
                $this->err("type \"$n\" is a built-in scalar and cannot be redefined");
            }
        }
    }

    private function roots(): void
    {
        $roots = $this->schema->roots();
        if (!isset($roots['query'])) {
            $this->err('query root type must be provided');
        }
        foreach ($roots as $op => $name) {
            $k = $this->schema->kindOf($name);
            if ($k === null) {
                $this->err("$op root type \"$name\" is unknown type");
            } elseif ($k !== 'object') {
                $this->err("$op root type \"$name\" must be an object type");
            }
        }
    }

    private function refKnown(string $name, string $where): bool
    {
        if ($this->schema->type($name) === null) {
            $this->err("$where references unknown type \"$name\"");
            return false;
        }
        return true;
    }

    private function composite(Definition $def): void
    {
        foreach ($def->interfaces as $i) {
            if ($this->refKnown($i, $def->name) && $this->schema->kindOf($i) !== 'interface') {
                $this->err("{$def->name} implements \"$i\" which is not an interface");
            }
        }
        foreach ($def->fields as $f) {
            $where = "{$def->name}.{$f->name}";
            $t = $f->type->namedType();
            if ($this->refKnown($t, $where) && !$this->schema->isOutputType($t)) {
                $this->err("$where must be an output type but \"$t\" is not");
            }
            foreach ($f->args as $a) {
                $this->inputValue($a, "$where($a->name:)");
            }
        }
        foreach ($def->interfaces as $iname) {
            $iface = $this->schema->type($iname);
            if ($iface !== null && $iface->kind === 'interface') {
                $this->implementation($def, $iface);
            }
        }
    }

    private function inputValue(object $a, string $where): void
    {
        $t = $a->type->namedType();
        if ($this->refKnown($t, $where)) {
            if (!$this->schema->isInputType($t)) {
                $this->err("$where must be an input type but \"$t\" is not");
            } elseif ($a->default !== null) {
                $bad = ValueCheck::fits($this->schema, $a->default, $a->type);
                if ($bad !== null) {
                    $this->err("$where has an invalid default value: $bad");
                }
            }
        }
    }

    private function implementation(Definition $def, Definition $iface): void
    {
        foreach ($iface->fields as $if) {
            $f = $def->fields[$if->name] ?? null;
            if ($f === null) {
                $this->err("Type \"{$def->name}\" must define field \"{$if->name}\" required by interface {$iface->name}");
                continue;
            }
            if (!$this->schema->isTypeSubtype($f->type, $if->type)) {
                $this->err("Interface field {$iface->name}.{$if->name} expects type \"{$if->type}\" but {$def->name}.{$f->name} is type \"{$f->type}\"");
            }
            foreach ($if->args as $ia) {
                $a = $f->args[$ia->name] ?? null;
                if ($a === null) {
                    $this->err("Interface field argument \"{$ia->name}\" of {$iface->name}.{$if->name} is missing on {$def->name}.{$f->name}");
                } elseif ((string) $a->type !== (string) $ia->type) {
                    $this->err("Interface field argument \"{$ia->name}\" of {$iface->name}.{$if->name} expects type \"{$ia->type}\" but {$def->name}.{$f->name} has \"{$a->type}\"");
                }
            }
            foreach ($f->args as $a) {
                if (!isset($if->args[$a->name]) && $a->type->isNonNull() && $a->default === null) {
                    $this->err("extra argument \"{$a->name}\" on {$def->name}.{$f->name} must be optional");
                }
            }
        }
    }

    private function inputType(Definition $def): void
    {
        foreach ($def->fields as $f) {
            $this->inputValue($f, "{$def->name}.{$f->name}");
        }
    }

    private function union(Definition $def): void
    {
        if (!$def->members) {
            $this->err("union {$def->name} must have at least one member type");
        }
        foreach ($def->members as $m) {
            if ($this->refKnown($m, "union {$def->name}") && $this->schema->kindOf($m) !== 'object') {
                $this->err("union {$def->name} member \"$m\" must be an object type");
            }
        }
    }

    private function enum(Definition $def): void
    {
        if (!$def->enumValues) {
            $this->err("enum {$def->name} must have at least one value");
        }
        foreach ($def->enumValues as $v) {
            if (in_array($v->name, ['true', 'false', 'null'], true)) {
                $this->err("enum {$def->name} value cannot be named \"{$v->name}\"");
            }
        }
    }

    private function interfaceCycles(): void
    {
        $color = [];
        $reported = [];
        $visit = function (string $n, array $path) use (&$visit, &$color, &$reported): void {
            $color[$n] = 1;
            $path[] = $n;
            foreach ($this->schema->type($n)->interfaces as $i) {
                if ($this->schema->kindOf($i) !== 'interface') {
                    continue;
                }
                if (($color[$i] ?? 0) === 1) {
                    $cycle = array_slice($path, (int) array_search($i, $path, true));
                    $key = implode(',', $cycle);
                    $norm = $cycle;
                    sort($norm);
                    if (!isset($reported[implode(',', $norm)])) {
                        $reported[implode(',', $norm)] = true;
                        $this->err('Interface cycle: ' . implode(' -> ', [...$cycle, $i]));
                    }
                } elseif (!isset($color[$i])) {
                    $visit($i, $path);
                }
            }
            $color[$n] = 2;
        };
        foreach ($this->schema->types() as $d) {
            if ($d->kind === 'interface' && !isset($color[$d->name])) {
                $visit($d->name, []);
            }
        }
    }

    private function inputCycles(): void
    {
        $state = [];
        $visit = function (string $n, array $path) use (&$visit, &$state): void {
            $state[$n] = 1;
            foreach ($this->schema->type($n)->fields as $f) {
                $t = $f->type;
                if (!$t->isNonNull() || $t->of->kind !== 'named') {
                    continue;
                }
                $next = $t->of->name;
                if ($this->schema->kindOf($next) !== 'input') {
                    continue;
                }
                if (($state[$next] ?? 0) === 1) {
                    $this->err("Cannot reference Input Object \"$next\" within itself through a series of non-null fields: \"" . implode('.', [...$path, $f->name]) . '"');
                } elseif (!isset($state[$next])) {
                    $visit($next, [...$path, $f->name]);
                }
            }
            $state[$n] = 2;
        };
        foreach ($this->schema->types() as $d) {
            if ($d->kind === 'input' && !isset($state[$d->name])) {
                $visit($d->name, []);
            }
        }
    }
}

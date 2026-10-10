<?php
declare(strict_types=1);

namespace GraphqlLite\Query;

use GraphqlLite\Query\Ast\Document;
use GraphqlLite\Query\Ast\Field;
use GraphqlLite\Query\Ast\FragmentSpread;
use GraphqlLite\Query\Ast\InlineFragment;
use GraphqlLite\Query\Ast\Operation;
use GraphqlLite\Schema\Schema;
use GraphqlLite\Schema\ValueCheck;
use GraphqlLite\Sdl\FieldDef;
use GraphqlLite\Sdl\TypeRef;

final class Validator
{
    /** @var string[] */
    private array $errors = [];

    private function __construct(private readonly Schema $schema, private readonly Document $doc)
    {
    }

    /**
     * @id CODE-QRY-002 @implements REQ-QRY-005 REQ-QRY-006 REQ-QRY-007 REQ-QRY-008 REQ-QRY-009 REQ-QRY-010 REQ-QRY-011
     * @return string[]
     */
    public static function validate(Schema $schema, Document $doc): array
    {
        $v = new self($schema, $doc);
        $v->run();
        return array_values(array_unique($v->errors));
    }

    private function err(string $m): void
    {
        $this->errors[] = $m;
    }

    private function run(): void
    {
        $this->definitions();
        foreach ($this->doc->operations as $op) {
            $root = $this->schema->roots()[$op->type] ?? null;
            if ($root === null) {
                $this->err("schema does not define a root type for $op->type operations");
                continue;
            }
            $this->selections($op->selections, $root);
            $this->mergeCheck($op->selections, $root);
            $this->variables($op);
        }
        foreach ($this->doc->fragments as $f) {
            $t = $this->schema->type($f->typeCondition);
            if ($t === null) {
                $this->err("fragment \"{$f->name}\" is on unknown type \"{$f->typeCondition}\"");
            } elseif (!in_array($t->kind, ['object', 'interface', 'union'], true)) {
                $this->err("fragment \"{$f->name}\" cannot condition on non-composite type \"{$f->typeCondition}\"");
            } else {
                $this->directives($f->directives);
                $this->selections($f->selections, $f->typeCondition);
                $this->mergeCheck($f->selections, $f->typeCondition);
            }
        }
        $this->fragmentGraph();
    }

    private function definitions(): void
    {
        $names = [];
        $anon = 0;
        foreach ($this->doc->operations as $op) {
            if ($op->name === null) {
                $anon++;
            } elseif (isset($names[$op->name])) {
                $this->err("duplicate operation name \"{$op->name}\"");
            }
            $names[$op->name ?? ''] = true;
            foreach ($op->duplicateVariables as $v) {
                $this->err("duplicate variable \"$v\"");
            }
        }
        if ($anon > 0 && count($this->doc->operations) > 1) {
            $this->err('an anonymous operation must be the only operation in the document');
        }
        foreach (array_unique($this->doc->duplicateFragments) as $f) {
            $this->err("duplicate fragment \"$f\"");
        }
    }

    private function fieldDef(string $parent, string $field): ?FieldDef
    {
        $t = $this->schema->type($parent);
        return $t !== null && in_array($t->kind, ['object', 'interface'], true) ? ($t->fields[$field] ?? null) : null;
    }

    private function isComposite(string $name): bool
    {
        return in_array($this->schema->kindOf($name), ['object', 'interface', 'union'], true);
    }

    private function overlaps(string $a, string $b): bool
    {
        return (bool) array_intersect($this->schema->possibleTypes($a), $this->schema->possibleTypes($b));
    }

    private function selections(array $sels, string $parent): void
    {
        foreach ($sels as $s) {
            if ($s instanceof Field) {
                $this->field($s, $parent);
            } elseif ($s instanceof InlineFragment) {
                $this->directives($s->directives);
                $cond = $s->typeCondition ?? $parent;
                if ($s->typeCondition !== null) {
                    if ($this->schema->type($cond) === null) {
                        $this->err("inline fragment is on unknown type \"$cond\"");
                        continue;
                    }
                    if (!$this->isComposite($cond)) {
                        $this->err("inline fragment cannot condition on non-composite type \"$cond\"");
                        continue;
                    }
                    $this->spreadable($cond, $parent);
                }
                $this->selections($s->selections, $cond);
            } else {
                $this->directives($s->directives);
                $frag = $this->doc->fragments[$s->name] ?? null;
                if ($frag !== null && $this->isComposite($frag->typeCondition)) {
                    $this->spreadable($frag->typeCondition, $parent);
                }
            }
        }
    }

    private function spreadable(string $cond, string $parent): void
    {
        if (!$this->overlaps($cond, $parent)) {
            $this->err("fragment on \"$cond\" cannot be spread here as objects of type \"$parent\" can never be of type \"$cond\"");
        }
    }

    private function field(Field $f, string $parent): void
    {
        $this->directives($f->directives);
        if ($f->name === '__typename') {
            if ($f->selections !== null) {
                $this->err('field "__typename" must not have a selection');
            }
            return;
        }
        $def = $this->fieldDef($parent, $f->name);
        if ($def === null) {
            $this->err("cannot query field \"{$f->name}\" on type \"$parent\"");
            return;
        }
        $this->arguments($f, $def, "$parent.{$f->name}");
        $ret = $def->type->namedType();
        if ($this->schema->isLeaf($ret)) {
            if ($f->selections !== null) {
                $this->err("field \"{$f->name}\" of type \"$ret\" must not have a selection");
            }
        } elseif ($f->selections === null) {
            $this->err("field \"{$f->name}\" of type \"$ret\" must have a selection of subfields");
        } else {
            $this->selections($f->selections, $ret);
        }
    }

    private function arguments(Field $f, FieldDef $def, string $where): void
    {
        foreach ($f->duplicateArgs as $d) {
            $this->err("duplicate argument \"$d\" on \"$where\"");
        }
        foreach ($f->args as $name => $value) {
            $a = $def->args[$name] ?? null;
            if ($a === null) {
                $this->err("unknown argument \"$name\" on \"$where\"");
                continue;
            }
            $bad = ValueCheck::fits($this->schema, $value, $a->type);
            if ($bad !== null) {
                $this->err("argument \"$name\" of \"$where\" has an invalid value: $bad");
            }
        }
        foreach ($def->args as $name => $a) {
            if ($a->type->isNonNull() && $a->default === null && !array_key_exists($name, $f->args)) {
                $this->err("required argument \"$name\" of \"$where\" is missing");
            }
        }
    }

    private function directives(array $dirs): void
    {
        foreach ($dirs as $d) {
            if (!in_array($d->name, ['skip', 'include'], true)) {
                $this->err("unknown directive \"@{$d->name}\"");
                continue;
            }
            if (!isset($d->args['if'])) {
                $this->err("directive \"@{$d->name}\" requires argument \"if\"");
                continue;
            }
            $bad = ValueCheck::fits($this->schema, $d->args['if'], TypeRef::nonNull(TypeRef::named('Boolean')));
            if ($bad !== null) {
                $this->err("argument \"if\" of directive \"@{$d->name}\" is invalid: $bad");
            }
        }
    }

    private function fragmentGraph(): void
    {
        $edges = [];
        foreach ($this->doc->fragments as $name => $f) {
            $edges[$name] = $this->spreadsIn($f->selections);
        }
        $reachable = [];
        $stack = [];
        foreach ($this->doc->operations as $op) {
            array_push($stack, ...$this->spreadsIn($op->selections));
        }
        foreach ($stack as $n) {
            if (!isset($this->doc->fragments[$n])) {
                $this->err("unknown fragment \"$n\"");
            }
        }
        foreach ($edges as $from => $tos) {
            foreach ($tos as $n) {
                if (!isset($this->doc->fragments[$n])) {
                    $this->err("unknown fragment \"$n\" (spread in fragment \"$from\")");
                }
            }
        }
        while ($stack) {
            $n = array_pop($stack);
            if (isset($reachable[$n]) || !isset($edges[$n])) {
                continue;
            }
            $reachable[$n] = true;
            array_push($stack, ...$edges[$n]);
        }
        foreach (array_keys($this->doc->fragments) as $n) {
            if (!isset($reachable[$n])) {
                $this->err("fragment \"$n\" is never used");
            }
        }
        $color = [];
        $seen = [];
        $visit = function (string $n, array $path) use (&$visit, &$color, &$seen, $edges): void {
            $color[$n] = 1;
            $path[] = $n;
            foreach ($edges[$n] as $m) {
                if (!isset($edges[$m])) {
                    continue;
                }
                if (($color[$m] ?? 0) === 1) {
                    $cycle = array_slice($path, (int) array_search($m, $path, true));
                    $key = $cycle;
                    sort($key);
                    if (!isset($seen[implode(',', $key)])) {
                        $seen[implode(',', $key)] = true;
                        $this->err('fragment cycle: ' . implode(' -> ', [...$cycle, $m]));
                    }
                } elseif (!isset($color[$m])) {
                    $visit($m, $path);
                }
            }
            $color[$n] = 2;
        };
        foreach (array_keys($edges) as $n) {
            if (!isset($color[$n])) {
                $visit($n, []);
            }
        }
    }

    /** @return string[] */
    private function spreadsIn(array $sels): array
    {
        $out = [];
        foreach ($sels as $s) {
            if ($s instanceof FragmentSpread) {
                $out[] = $s->name;
            } elseif ($s instanceof InlineFragment) {
                array_push($out, ...$this->spreadsIn($s->selections));
            } elseif ($s instanceof Field && $s->selections !== null) {
                array_push($out, ...$this->spreadsIn($s->selections));
            }
        }
        return $out;
    }

    private function variables(Operation $op): void
    {
        foreach ($op->variables as $v) {
            $t = $v->type->namedType();
            if ($this->schema->type($t) === null) {
                $this->err("variable \"\${$v->name}\" has unknown type \"$t\"");
            } elseif (!$this->schema->isInputType($t)) {
                $this->err("variable \"\${$v->name}\" type \"$t\" is not an input type");
            }
        }
        $usages = [];
        $visited = [];
        $this->usages($op->selections, $this->schema->roots()[$op->type], $visited, $usages);
        $used = [];
        foreach ($usages as [$name, $expected, $locDefault]) {
            $used[$name] = true;
            $def = $op->variables[$name] ?? null;
            if ($def === null) {
                $this->err("variable \"\$$name\" is not defined");
                continue;
            }
            if (!$this->positionAllowed($def->type, $def->default !== null && $def->default['kind'] !== 'Null', $expected, $locDefault)) {
                $this->err("variable \"\$$name\" of type \"{$def->type}\" used in position expecting \"$expected\"");
            }
        }
        foreach (array_keys($op->variables) as $name) {
            if (!isset($used[$name])) {
                $this->err("variable \"\$$name\" is never used");
            }
        }
    }

    private function positionAllowed(TypeRef $varType, bool $varDefault, TypeRef $expected, bool $locDefault): bool
    {
        if ($expected->isNonNull() && !$varType->isNonNull()) {
            return ($varDefault || $locDefault) && $this->schema->isTypeSubtype($varType, $expected->of);
        }
        return $this->schema->isTypeSubtype($varType, $expected);
    }

    private function usages(array $sels, string $parent, array &$visited, array &$out): void
    {
        foreach ($sels as $s) {
            if ($s instanceof FragmentSpread) {
                $this->directiveUsages($s->directives, $out);
                $frag = $this->doc->fragments[$s->name] ?? null;
                if ($frag !== null && !isset($visited[$s->name])) {
                    $visited[$s->name] = true;
                    $this->usages($frag->selections, $frag->typeCondition, $visited, $out);
                }
            } elseif ($s instanceof InlineFragment) {
                $this->directiveUsages($s->directives, $out);
                $this->usages($s->selections, $s->typeCondition ?? $parent, $visited, $out);
            } else {
                $this->directiveUsages($s->directives, $out);
                $def = $this->fieldDef($parent, $s->name);
                if ($def === null) {
                    continue;
                }
                foreach ($s->args as $name => $value) {
                    if (isset($def->args[$name])) {
                        $this->valueUsages($value, $def->args[$name]->type, $def->args[$name]->default !== null, $out);
                    }
                }
                if ($s->selections !== null) {
                    $this->usages($s->selections, $def->type->namedType(), $visited, $out);
                }
            }
        }
    }

    private function directiveUsages(array $dirs, array &$out): void
    {
        foreach ($dirs as $d) {
            if (isset($d->args['if'])) {
                $this->valueUsages($d->args['if'], TypeRef::nonNull(TypeRef::named('Boolean')), false, $out);
            }
        }
    }

    private function valueUsages(array $value, TypeRef $type, bool $hasDefault, array &$out): void
    {
        if ($value['kind'] === 'Variable') {
            $out[] = [$value['value'], $type, $hasDefault];
            return;
        }
        $inner = $type->nullable();
        if ($value['kind'] === 'List' && $inner->kind === 'list') {
            foreach ($value['value'] as $item) {
                $this->valueUsages($item, $inner->of, false, $out);
            }
        } elseif ($value['kind'] === 'Object' && $inner->kind === 'named') {
            $def = $this->schema->type((string) $inner->name);
            foreach ($value['value'] as $k => $v) {
                if ($def !== null && $def->kind === 'input' && isset($def->fields[$k])) {
                    $this->valueUsages($v, $def->fields[$k]->type, $def->fields[$k]->default !== null, $out);
                }
            }
        }
    }

    private function mergeCheck(array $sels, string $parent): void
    {
        $map = [];
        $visited = [];
        $this->collect($sels, $parent, $map, $visited);
        $this->checkMap($map, $visited);
    }

    private function collect(array $sels, string $parent, array &$map, array &$visited): void
    {
        foreach ($sels as $s) {
            if ($s instanceof Field) {
                $map[$s->responseKey()][] = [$s, $parent, $s->name === '__typename' ? null : $this->fieldDef($parent, $s->name)];
            } elseif ($s instanceof InlineFragment) {
                $this->collect($s->selections, $s->typeCondition ?? $parent, $map, $visited);
            } else {
                $frag = $this->doc->fragments[$s->name] ?? null;
                if ($frag !== null && !isset($visited[$s->name])) {
                    $visited[$s->name] = true;
                    $this->collect($frag->selections, $frag->typeCondition, $map, $visited);
                }
            }
        }
    }

    private function checkMap(array $map, array $visited): void
    {
        foreach ($map as $key => $group) {
            $n = count($group);
            for ($i = 0; $i < $n; $i++) {
                for ($j = $i + 1; $j < $n; $j++) {
                    $this->pairConflict($key, $group[$i], $group[$j]);
                }
            }
            $sub = [];
            $v = $visited;
            foreach ($group as [$f, , $def]) {
                if ($f->selections !== null && $def !== null) {
                    $this->collect($f->selections, $def->type->namedType(), $sub, $v);
                }
            }
            if ($sub) {
                $this->checkMap($sub, $v);
            }
        }
    }

    private function pairConflict(string $key, array $a, array $b): void
    {
        [$fa, $pa, $da] = $a;
        [$fb, $pb, $db] = $b;
        $exclusive = $this->schema->kindOf($pa) === 'object' && $this->schema->kindOf($pb) === 'object' && $pa !== $pb;
        if (!$exclusive) {
            if ($fa->name !== $fb->name) {
                $this->err("fields \"$key\" conflict because \"{$fa->name}\" and \"{$fb->name}\" are different fields");
                return;
            }
            if ($this->canon($fa->args) !== $this->canon($fb->args)) {
                $this->err("fields \"$key\" conflict because they have differing arguments");
                return;
            }
        }
        if ($da !== null && $db !== null && $this->typesConflict($da->type, $db->type)) {
            $this->err("fields \"$key\" conflict because they return conflicting types \"{$da->type}\" and \"{$db->type}\"");
        }
    }

    private function canon(mixed $v): string
    {
        $sort = function (mixed $x) use (&$sort): mixed {
            if (is_array($x)) {
                $x = array_map($sort, $x);
                if (array_keys($x) !== range(0, count($x) - 1)) {
                    ksort($x);
                }
            }
            return $x;
        };
        return json_encode($sort($v), JSON_THROW_ON_ERROR);
    }

    private function typesConflict(TypeRef $a, TypeRef $b): bool
    {
        if ($a->kind === 'nonnull' || $b->kind === 'nonnull') {
            return $a->kind !== $b->kind || $this->typesConflict($a->of, $b->of);
        }
        if ($a->kind === 'list' || $b->kind === 'list') {
            return $a->kind !== $b->kind || $this->typesConflict($a->of, $b->of);
        }
        if ($this->schema->isLeaf((string) $a->name) || $this->schema->isLeaf((string) $b->name)) {
            return $a->name !== $b->name;
        }
        return false;
    }
}

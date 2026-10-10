<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

final class Parser extends ValueParser
{
    /** @id CODE-SDL-001 @implements REQ-SDL-001 REQ-SDL-002 REQ-SDL-003 REQ-SDL-004 REQ-SDL-005 REQ-SDL-006 REQ-SDL-007 REQ-SDL-008 REQ-SDL-009 */
    public static function parse(string $src): Document
    {
        return (new self($src))->document();
    }

    private function document(): Document
    {
        $defs = [];
        $roots = [];
        while ($this->peek()->kind !== 'EOF') {
            $start = $this->peek();
            $desc = $this->parseDescription();
            $kw = $this->peek();
            if (!$kw->is('Name')) {
                throw $this->unexpected('definition');
            }
            if ($kw->value === 'schema') {
                $roots = $this->schemaBlock();
                continue;
            }
            $def = match ($kw->value) {
                'type' => $this->objectLike('object', $desc),
                'interface' => $this->objectLike('interface', $desc),
                'input' => $this->inputDef($desc),
                'enum' => $this->enumDef($desc),
                'union' => $this->unionDef($desc),
                'scalar' => $this->scalarDef($desc),
                default => throw $this->unexpected(),
            };
            if (isset($defs[$def->name])) {
                throw $this->failAt($kw, "Syntax: duplicate definition of type \"{$def->name}\"");
            }
            $defs[$def->name] = $def;
        }
        return new Document($defs, $roots);
    }

    private function parseDescription(): ?string
    {
        $t = $this->peek();
        if ($t->is('String') || $t->is('BlockString')) {
            $this->advance();
            return $t->value;
        }
        return null;
    }

    private function schemaBlock(): array
    {
        $this->advance();
        $this->parseDirectives();
        $this->expectPunct('{');
        $roots = [];
        do {
            $t = $this->peek();
            $op = $this->expectName('operation type');
            if (!in_array($op, ['query', 'mutation', 'subscription'], true)) {
                throw $this->failAt($t, "Syntax: unknown operation type \"$op\"");
            }
            if (isset($roots[$op])) {
                throw $this->failAt($t, "Syntax: duplicate operation type \"$op\"");
            }
            $this->expectPunct(':');
            $roots[$op] = $this->expectName();
        } while (!$this->atPunct('}'));
        $this->advance();
        return $roots;
    }

    private function objectLike(string $kind, ?string $desc): Definition
    {
        $this->advance();
        $name = $this->expectName();
        $ifaces = [];
        if ($this->atName('implements')) {
            $this->advance();
            $this->eatPunct('&');
            do {
                $t = $this->peek();
                $n = $this->expectName();
                if (in_array($n, $ifaces, true)) {
                    throw $this->failAt($t, "Syntax: duplicate interface \"$n\"");
                }
                $ifaces[] = $n;
                $this->eatPunct('&');
            } while ($this->atName());
        }
        $dirs = $this->parseDirectives();
        $this->expectPunct('{');
        $fields = [];
        do {
            $fields = $this->addUnique($fields, $this->fieldDef(), 'field');
        } while (!$this->atPunct('}'));
        $this->advance();
        return new Definition($kind, $name, $desc, $ifaces, $fields, [], [], $dirs);
    }

    private function addUnique(array $map, object $item, string $what): array
    {
        if (isset($map[$item->name])) {
            $t = $this->peek();
            throw $this->failAt($t, "Syntax: duplicate $what \"{$item->name}\"");
        }
        $map[$item->name] = $item;
        return $map;
    }

    private function fieldDef(): FieldDef
    {
        $desc = $this->parseDescription();
        $name = $this->expectName('field name');
        $args = [];
        if ($this->atPunct('(')) {
            $this->advance();
            do {
                $args = $this->addUnique($args, $this->inputValue(), 'argument');
            } while (!$this->atPunct(')'));
            $this->advance();
        }
        $this->expectPunct(':');
        $type = $this->parseTypeRef();
        return new FieldDef($name, $type, $args, $desc, $this->parseDirectives());
    }

    private function inputValue(): InputValueDef
    {
        $desc = $this->parseDescription();
        $name = $this->expectName('name');
        $this->expectPunct(':');
        $type = $this->parseTypeRef();
        $default = null;
        if ($this->eatPunct('=')) {
            $default = $this->parseValue();
        }
        return new InputValueDef($name, $type, $default, $desc, $this->parseDirectives());
    }

    private function inputDef(?string $desc): Definition
    {
        $this->advance();
        $name = $this->expectName();
        $dirs = $this->parseDirectives();
        $this->expectPunct('{');
        $fields = [];
        do {
            $fields = $this->addUnique($fields, $this->inputValue(), 'field');
        } while (!$this->atPunct('}'));
        $this->advance();
        return new Definition('input', $name, $desc, [], $fields, [], [], $dirs);
    }

    private function enumDef(?string $desc): Definition
    {
        $this->advance();
        $name = $this->expectName();
        $dirs = $this->parseDirectives();
        $this->expectPunct('{');
        $values = [];
        do {
            $vd = $this->parseDescription();
            $v = new EnumValueDef($this->expectName('enum value'), $vd);
            $v = new EnumValueDef($v->name, $vd, $this->parseDirectives());
            $values = $this->addUnique($values, $v, 'enum value');
        } while (!$this->atPunct('}'));
        $this->advance();
        return new Definition('enum', $name, $desc, [], [], $values, [], $dirs);
    }

    private function unionDef(?string $desc): Definition
    {
        $this->advance();
        $name = $this->expectName();
        $dirs = $this->parseDirectives();
        $this->expectPunct('=');
        $this->eatPunct('|');
        $members = [];
        do {
            $t = $this->peek();
            $m = $this->expectName('member type');
            if (in_array($m, $members, true)) {
                throw $this->failAt($t, "Syntax: duplicate union member \"$m\"");
            }
            $members[] = $m;
        } while ($this->eatPunct('|'));
        return new Definition('union', $name, $desc, [], [], [], $members, $dirs);
    }

    private function scalarDef(?string $desc): Definition
    {
        $this->advance();
        $name = $this->expectName();
        return new Definition('scalar', $name, $desc, [], [], [], [], $this->parseDirectives());
    }
}

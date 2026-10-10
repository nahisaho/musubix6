<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

class ValueParser extends TokenStream
{
    protected bool $allowVariables = false;
    protected bool $collectDuplicateArgs = false;
    /** @var string[] */
    protected array $duplicateArgs = [];

    /** @return array{kind:string,value:mixed} */
    protected function parseValue(): array
    {
        $t = $this->peek();
        switch ($t->kind) {
            case 'Int':
            case 'Float':
                $this->advance();
                return ['kind' => $t->kind, 'value' => $t->value];
            case 'String':
            case 'BlockString':
                $this->advance();
                return ['kind' => 'String', 'value' => $t->value];
            case 'Name':
                $this->advance();
                return match ($t->value) {
                    'true' => ['kind' => 'Boolean', 'value' => true],
                    'false' => ['kind' => 'Boolean', 'value' => false],
                    'null' => ['kind' => 'Null', 'value' => null],
                    default => ['kind' => 'Enum', 'value' => $t->value],
                };
            case 'Punct':
                if ($t->value === '[') {
                    $this->advance();
                    $items = [];
                    while (!$this->atPunct(']')) {
                        $items[] = $this->parseValue();
                    }
                    $this->advance();
                    return ['kind' => 'List', 'value' => $items];
                }
                if ($t->value === '{') {
                    $this->advance();
                    $fields = [];
                    while (!$this->atPunct('}')) {
                        $nt = $this->peek();
                        $name = $this->expectName();
                        if (array_key_exists($name, $fields)) {
                            throw $this->failAt($nt, "Syntax: duplicate object field \"$name\"");
                        }
                        $this->expectPunct(':');
                        $fields[$name] = $this->parseValue();
                    }
                    $this->advance();
                    return ['kind' => 'Object', 'value' => $fields];
                }
                if ($t->value === '$' && $this->allowVariables) {
                    $this->advance();
                    return ['kind' => 'Variable', 'value' => $this->expectName()];
                }
        }
        throw $this->unexpected('value');
    }

    /** @return Directive[] */
    protected function parseDirectives(): array
    {
        $out = [];
        while ($this->atPunct('@')) {
            $this->advance();
            $name = $this->expectName();
            $out[] = new Directive($name, $this->atPunct('(') ? $this->parseArgumentValues() : []);
        }
        return $out;
    }

    /** @return array<string,array> */
    protected function parseArgumentValues(): array
    {
        $this->expectPunct('(');
        $args = [];
        do {
            $nt = $this->peek();
            $name = $this->expectName();
            if (array_key_exists($name, $args) && $this->collectDuplicateArgs) {
                $this->duplicateArgs[] = $name;
            } elseif (array_key_exists($name, $args)) {
                throw $this->failAt($nt, "Syntax: duplicate argument \"$name\"");
            }
            $this->expectPunct(':');
            $args[$name] = $this->parseValue();
        } while (!$this->atPunct(')'));
        $this->advance();
        return $args;
    }

    protected function parseTypeRef(): TypeRef
    {
        if ($this->eatPunct('[')) {
            $t = TypeRef::list($this->parseTypeRef());
            $this->expectPunct(']');
        } else {
            $t = TypeRef::named($this->expectName('type name'));
        }
        if ($this->atPunct('!')) {
            $this->advance();
            $t = TypeRef::nonNull($t);
            if ($this->atPunct('!')) {
                throw $this->unexpected("no further \"!\" after $t");
            }
        }
        return $t;
    }
}

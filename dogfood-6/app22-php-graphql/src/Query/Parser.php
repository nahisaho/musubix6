<?php
declare(strict_types=1);

namespace GraphqlLite\Query;

use GraphqlLite\Query\Ast\Document;
use GraphqlLite\Query\Ast\Field;
use GraphqlLite\Query\Ast\FragmentDef;
use GraphqlLite\Query\Ast\FragmentSpread;
use GraphqlLite\Query\Ast\InlineFragment;
use GraphqlLite\Query\Ast\Operation;
use GraphqlLite\Query\Ast\VariableDef;
use GraphqlLite\Sdl\ValueParser;

final class Parser extends ValueParser
{
    protected bool $allowVariables = true;
    protected bool $collectDuplicateArgs = true;

    /** @id CODE-QRY-001 @implements REQ-QRY-001 REQ-QRY-002 REQ-QRY-003 REQ-QRY-004 */
    public static function parse(string $src): Document
    {
        return (new self($src))->document();
    }

    private function document(): Document
    {
        $ops = [];
        $frags = [];
        $dupFrags = [];
        if ($this->peek()->kind === 'EOF') {
            throw $this->unexpected('definition');
        }
        while ($this->peek()->kind !== 'EOF') {
            if ($this->atPunct('{')) {
                $ops[] = new Operation('query', null, [], [], $this->selectionSet());
            } elseif ($this->atName('query') || $this->atName('mutation') || $this->atName('subscription')) {
                $ops[] = $this->operation();
            } elseif ($this->atName('fragment')) {
                $f = $this->fragmentDef();
                if (isset($frags[$f->name])) {
                    $dupFrags[] = $f->name;
                }
                $frags[$f->name] ??= $f;
            } else {
                throw $this->unexpected();
            }
        }
        return new Document($ops, $frags, $dupFrags);
    }

    private function operation(): Operation
    {
        $type = $this->advance()->value;
        $name = $this->atName() ? $this->advance()->value : null;
        $vars = [];
        $dups = [];
        if ($this->eatPunct('(')) {
            do {
                $this->expectPunct('$');
                $n = $this->expectName();
                $this->expectPunct(':');
                $t = $this->parseTypeRef();
                $default = $this->eatPunct('=') ? $this->parseValue() : null;
                if (isset($vars[$n])) {
                    $dups[] = $n;
                }
                $vars[$n] ??= new VariableDef($n, $t, $default, $this->parseDirectives());
            } while (!$this->atPunct(')'));
            $this->advance();
        }
        $dirs = $this->parseDirectives();
        return new Operation($type, $name, $vars, $dirs, $this->selectionSet(), $dups);
    }

    private function fragmentDef(): FragmentDef
    {
        $this->advance();
        if ($this->atName('on')) {
            throw $this->unexpected('fragment name');
        }
        $name = $this->expectName('fragment name');
        $this->expectKeyword('on');
        $type = $this->expectName('type condition');
        return new FragmentDef($name, $type, $this->parseDirectives(), $this->selectionSet());
    }

    /** @return array */
    private function selectionSet(): array
    {
        $this->expectPunct('{');
        $out = [];
        do {
            $out[] = $this->selection();
        } while (!$this->atPunct('}'));
        $this->advance();
        return $out;
    }

    private function selection(): Field|FragmentSpread|InlineFragment
    {
        if ($this->eatPunct('...')) {
            if ($this->atName() && !$this->atName('on')) {
                return new FragmentSpread($this->advance()->value, $this->parseDirectives());
            }
            $type = null;
            if ($this->atName('on')) {
                $this->advance();
                $type = $this->expectName('type condition');
            }
            $dirs = $this->parseDirectives();
            return new InlineFragment($type, $dirs, $this->selectionSet());
        }
        $line = $this->peek()->line;
        $name = $this->expectName('field name');
        $alias = null;
        if ($this->eatPunct(':')) {
            $alias = $name;
            $name = $this->expectName('field name');
        }
        $this->duplicateArgs = [];
        $args = $this->atPunct('(') ? $this->parseArgumentValues() : [];
        $dups = $this->duplicateArgs;
        $dirs = $this->parseDirectives();
        $sel = $this->atPunct('{') ? $this->selectionSet() : null;
        return new Field($alias, $name, $args, $dirs, $sel, $dups, $line);
    }
}

<?php
declare(strict_types=1);

namespace GraphqlLite\Query\Ast;

final class FragmentDef
{
    /** @param \GraphqlLite\Sdl\Directive[] $directives */
    public function __construct(public readonly string $name, public readonly string $typeCondition, public readonly array $directives, public readonly array $selections)
    {
    }
}

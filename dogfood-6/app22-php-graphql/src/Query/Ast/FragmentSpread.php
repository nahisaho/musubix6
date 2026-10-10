<?php
declare(strict_types=1);

namespace GraphqlLite\Query\Ast;

final class FragmentSpread
{
    /** @param \GraphqlLite\Sdl\Directive[] $directives */
    public function __construct(public readonly string $name, public readonly array $directives = [])
    {
    }
}

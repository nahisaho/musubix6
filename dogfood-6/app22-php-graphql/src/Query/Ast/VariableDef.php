<?php
declare(strict_types=1);

namespace GraphqlLite\Query\Ast;

use GraphqlLite\Sdl\TypeRef;

final class VariableDef
{
    /** @param \GraphqlLite\Sdl\Directive[] $directives */
    public function __construct(public readonly string $name, public readonly TypeRef $type, public readonly ?array $default = null, public readonly array $directives = [])
    {
    }
}

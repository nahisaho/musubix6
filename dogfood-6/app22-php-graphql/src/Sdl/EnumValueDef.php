<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

final class EnumValueDef
{
    /** @param Directive[] $directives */
    public function __construct(public readonly string $name, public readonly ?string $description = null, public readonly array $directives = [])
    {
    }
}

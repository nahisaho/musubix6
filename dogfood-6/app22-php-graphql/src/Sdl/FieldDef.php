<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

final class FieldDef
{
    /** @param array<string,InputValueDef> $args @param Directive[] $directives */
    public function __construct(
        public readonly string $name,
        public readonly TypeRef $type,
        public readonly array $args = [],
        public readonly ?string $description = null,
        public readonly array $directives = [],
    ) {
    }
}

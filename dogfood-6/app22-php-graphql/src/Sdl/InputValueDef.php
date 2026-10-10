<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

final class InputValueDef
{
    /** @param Directive[] $directives */
    public function __construct(
        public readonly string $name,
        public readonly TypeRef $type,
        public readonly ?array $default = null,
        public readonly ?string $description = null,
        public readonly array $directives = [],
    ) {
    }
}

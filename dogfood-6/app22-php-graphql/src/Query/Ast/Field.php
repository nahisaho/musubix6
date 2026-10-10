<?php
declare(strict_types=1);

namespace GraphqlLite\Query\Ast;

final class Field
{
    /** @param array<string,array> $args @param \GraphqlLite\Sdl\Directive[] $directives @param array|null $selections @param string[] $duplicateArgs */
    public function __construct(
        public readonly ?string $alias,
        public readonly string $name,
        public readonly array $args,
        public readonly array $directives,
        public readonly ?array $selections,
        public readonly array $duplicateArgs = [],
        public readonly int $line = 0,
    ) {
    }

    public function responseKey(): string
    {
        return $this->alias ?? $this->name;
    }
}

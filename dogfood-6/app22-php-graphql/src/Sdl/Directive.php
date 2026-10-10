<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

final class Directive
{
    /** @param array<string,array> $args */
    public function __construct(public readonly string $name, public readonly array $args = [])
    {
    }
}

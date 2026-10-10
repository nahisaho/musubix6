<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

final class Document
{
    /** @param array<string,Definition> $definitions @param array<string,string> $roots */
    public function __construct(public readonly array $definitions, public readonly array $roots)
    {
    }
}

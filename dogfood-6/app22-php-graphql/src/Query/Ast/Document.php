<?php
declare(strict_types=1);

namespace GraphqlLite\Query\Ast;

final class Document
{
    /** @param Operation[] $operations @param array<string,FragmentDef> $fragments @param string[] $duplicateFragments */
    public function __construct(public readonly array $operations, public readonly array $fragments, public readonly array $duplicateFragments = [])
    {
    }
}

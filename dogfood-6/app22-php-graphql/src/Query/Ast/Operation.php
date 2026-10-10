<?php
declare(strict_types=1);

namespace GraphqlLite\Query\Ast;

final class Operation
{
    /** @param array<string,VariableDef> $variables @param Field[]|FragmentSpread[]|InlineFragment[] $selections @param \GraphqlLite\Sdl\Directive[] $directives @param string[] $duplicateVariables */
    public function __construct(
        public readonly string $type,
        public readonly ?string $name,
        public readonly array $variables,
        public readonly array $directives,
        public readonly array $selections,
        public readonly array $duplicateVariables = [],
    ) {
    }
}

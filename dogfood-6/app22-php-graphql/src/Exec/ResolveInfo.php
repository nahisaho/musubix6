<?php
declare(strict_types=1);

namespace GraphqlLite\Exec;

use GraphqlLite\Query\Ast\Operation;
use GraphqlLite\Schema\Schema;
use GraphqlLite\Sdl\TypeRef;

final class ResolveInfo
{
    /** @param array<int,string|int> $path @param \GraphqlLite\Query\Ast\Field[] $fieldNodes */
    public function __construct(
        public readonly string $fieldName,
        public readonly array $path,
        public readonly string $parentType,
        public readonly TypeRef $returnType,
        public readonly array $fieldNodes,
        public readonly Schema $schema,
        public readonly array $variables,
        public readonly Operation $operation,
    ) {
    }
}

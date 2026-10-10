<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

final class Definition
{
    /**
     * @param string[] $interfaces
     * @param array<string,FieldDef|InputValueDef> $fields
     * @param array<string,EnumValueDef> $enumValues
     * @param string[] $members
     * @param Directive[] $directives
     */
    public function __construct(
        public readonly string $kind,
        public readonly string $name,
        public readonly ?string $description = null,
        public readonly array $interfaces = [],
        public readonly array $fields = [],
        public readonly array $enumValues = [],
        public readonly array $members = [],
        public readonly array $directives = [],
    ) {
    }
}

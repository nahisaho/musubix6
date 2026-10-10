<?php
declare(strict_types=1);

namespace GraphqlLite\Lex;

final class Token
{
    public function __construct(
        public readonly string $kind,
        public readonly string $value,
        public readonly int $line,
        public readonly int $col,
    ) {
    }

    public function is(string $kind, ?string $value = null): bool
    {
        return $this->kind === $kind && ($value === null || $this->value === $value);
    }

    public function describe(): string
    {
        return $this->kind === 'EOF' ? '<EOF>' : "{$this->kind} \"{$this->value}\"";
    }
}

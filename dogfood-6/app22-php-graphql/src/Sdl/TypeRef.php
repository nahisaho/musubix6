<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

final class TypeRef
{
    private function __construct(
        public readonly string $kind,
        public readonly ?string $name,
        public readonly ?TypeRef $of,
    ) {
    }

    public static function named(string $name): self
    {
        return new self('named', $name, null);
    }

    public static function list(TypeRef $of): self
    {
        return new self('list', null, $of);
    }

    public static function nonNull(TypeRef $of): self
    {
        if ($of->kind === 'nonnull') {
            throw new \InvalidArgumentException('non-null cannot wrap non-null');
        }
        return new self('nonnull', null, $of);
    }

    public function namedType(): string
    {
        return $this->of === null ? (string) $this->name : $this->of->namedType();
    }

    public function isNonNull(): bool
    {
        return $this->kind === 'nonnull';
    }

    public function nullable(): self
    {
        return $this->kind === 'nonnull' ? $this->of : $this;
    }

    public function __toString(): string
    {
        return match ($this->kind) {
            'named' => (string) $this->name,
            'list' => '[' . $this->of . ']',
            default => $this->of . '!',
        };
    }
}

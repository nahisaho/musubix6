<?php
declare(strict_types=1);

namespace Rbac\Engine;

final class Decision
{
    /** @param string[] $matched */
    public function __construct(public string $effect, public string $reason, public array $matched = [])
    {
    }

    public static function deny(string $reason, array $matched = []): self
    {
        return new self('deny', $reason, $matched);
    }

    public static function allow(array $matched): self
    {
        return new self('allow', 'allow-policy', $matched);
    }

    public function allowed(): bool
    {
        return $this->effect === 'allow';
    }
}

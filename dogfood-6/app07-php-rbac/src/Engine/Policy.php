<?php
declare(strict_types=1);

namespace Rbac\Engine;

class Policy
{
    public function __construct(
        public string $id,
        public string $effect,
        public array $roles,
        public array $actions,
        public array $resources,
        public string $condition = '',
    ) {}
}

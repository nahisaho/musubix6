<?php
declare(strict_types=1);

namespace Rbac\Engine;

class Request
{
    public function __construct(
        public array $roles,
        public string $action,
        public string $resource,
        public array $subject = [],
        public array $resourceAttrs = [],
        public array $env = [],
    ) {}
}

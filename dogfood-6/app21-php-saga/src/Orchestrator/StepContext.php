<?php
declare(strict_types=1);

namespace Saga\Orchestrator;

final class StepContext
{
    public function __construct(
        public readonly string $sagaId,
        public readonly string $step,
        public readonly int $attempt,
        public readonly array $results,
    ) {
    }
}

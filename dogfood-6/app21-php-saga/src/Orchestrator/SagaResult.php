<?php
declare(strict_types=1);

namespace Saga\Orchestrator;

use Saga\State\SagaInstance;
use Saga\State\SagaStatus;

final class SagaResult
{
    public readonly SagaStatus $status;
    public readonly array $results;

    public function __construct(public readonly SagaInstance $instance)
    {
        $this->status = $instance->status();
        $this->results = $instance->results();
    }
}

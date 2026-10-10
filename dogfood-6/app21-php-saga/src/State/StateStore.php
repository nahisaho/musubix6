<?php
declare(strict_types=1);

namespace Saga\State;

interface StateStore
{
    public function load(string $id): ?SagaInstance;

    /** Persists with optimistic concurrency; on success the instance's version becomes expectedVersion+1. */
    public function save(SagaInstance $instance, int $expectedVersion): void;
}

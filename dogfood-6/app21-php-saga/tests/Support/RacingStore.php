<?php
declare(strict_types=1);

namespace Saga\Tests\Support;

use Saga\State\SagaInstance;
use Saga\State\StateStore;

/** Simulates a competing writer that bumps the stored version just before the Nth save. */
final class RacingStore implements StateStore
{
    private int $saves = 0;

    public function __construct(private StateStore $inner, private int $raceOnSave)
    {
    }

    public function load(string $id): ?SagaInstance
    {
        return $this->inner->load($id);
    }

    public function save(SagaInstance $instance, int $expectedVersion): void
    {
        if (++$this->saves === $this->raceOnSave) {
            $other = $this->inner->load($instance->id());
            $this->inner->save($other, $other->version());
        }
        $this->inner->save($instance, $expectedVersion);
    }
}

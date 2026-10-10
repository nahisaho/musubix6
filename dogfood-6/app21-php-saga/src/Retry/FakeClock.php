<?php
declare(strict_types=1);

namespace Saga\Retry;

use InvalidArgumentException;

/** @id CODE-RETRY-008 @implements REQ-RETRY-008 */
final class FakeClock implements ClockInterface
{
    public function __construct(private int $now = 0)
    {
    }

    public function now(): int
    {
        return $this->now;
    }

    public function sleep(int $ms): void
    {
        if ($ms < 0) {
            throw new InvalidArgumentException('sleep must be >= 0');
        }
        $this->now += $ms;
    }
}

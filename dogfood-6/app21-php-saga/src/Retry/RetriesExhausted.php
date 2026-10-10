<?php
declare(strict_types=1);

namespace Saga\Retry;

final class RetriesExhausted extends \RuntimeException
{
    public function __construct(private int $attempts, ?\Throwable $last, string $reason = 'attempts')
    {
        parent::__construct("retries exhausted after $attempts attempt(s) ($reason)", 0, $last);
    }

    public function attempts(): int
    {
        return $this->attempts;
    }
}

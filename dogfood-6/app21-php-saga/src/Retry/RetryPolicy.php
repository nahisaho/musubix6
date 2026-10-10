<?php
declare(strict_types=1);

namespace Saga\Retry;

use InvalidArgumentException;

final class RetryPolicy
{
    /** @id CODE-RETRY-001 @implements REQ-RETRY-001 */
    public function __construct(
        public readonly int $maxAttempts,
        public readonly int $baseDelayMs,
        public readonly float $multiplier,
        public readonly int $maxDelayMs,
        public readonly float $jitter = 0.0,
        public readonly array $retryOn = [\Throwable::class],
        public readonly ?int $totalBudgetMs = null,
    ) {
        if ($maxAttempts < 1 || $baseDelayMs < 0 || $multiplier < 1.0 || $jitter < 0.0 || $jitter > 1.0 || $maxDelayMs < $baseDelayMs) {
            throw new InvalidArgumentException('invalid retry policy');
        }
        if ($totalBudgetMs !== null && $totalBudgetMs < 0) {
            throw new InvalidArgumentException('invalid retry budget');
        }
    }

    /**
     * @id CODE-RETRY-002 @implements REQ-RETRY-002
     * @id CODE-RETRY-003 @implements REQ-RETRY-003
     * @id CODE-RETRY-004 @implements REQ-RETRY-004
     * @id CODE-RETRY-005 @implements REQ-RETRY-005
     */
    public function delayFor(int $attempt, ?callable $rng = null): int
    {
        $raw = $this->baseDelayMs * ($this->multiplier ** max(0, $attempt - 1));
        $delay = (!is_finite($raw) || $raw >= (float) $this->maxDelayMs) ? $this->maxDelayMs : (int) floor($raw);
        if ($this->jitter > 0.0) {
            $r = $rng !== null ? $rng() : mt_rand() / (mt_getrandmax() + 1);
            $delay = (int) floor($delay * (1.0 - $this->jitter * $r));
        }
        return $delay;
    }

    /**
     * @id CODE-RETRY-006 @implements REQ-RETRY-006
     * @id CODE-RETRY-007 @implements REQ-RETRY-007
     */
    public function shouldRetry(\Throwable $e, int $attemptsMade): bool
    {
        if ($attemptsMade >= $this->maxAttempts || $e instanceof NonRetryableException) {
            return false;
        }
        return $this->matches($e);
    }

    public function matches(\Throwable $e): bool
    {
        foreach ($this->retryOn as $class) {
            if ($e instanceof $class) {
                return true;
            }
        }
        return false;
    }
}

<?php
declare(strict_types=1);

namespace Saga\Retry;

final class RetryExecutor
{
    /** @var callable|null */
    private $rng;

    public function __construct(private ClockInterface $clock, ?callable $rng = null)
    {
        $this->rng = $rng;
    }

    /**
     * @id CODE-RETRY-009 @implements REQ-RETRY-009
     * @id CODE-RETRY-010 @implements REQ-RETRY-010
     * @id CODE-RETRY-011 @implements REQ-RETRY-011
     * @id CODE-RETRY-012 @implements REQ-RETRY-012
     */
    public function run(RetryPolicy $policy, callable $fn): mixed
    {
        $start = $this->clock->now();
        $attempt = 1;
        while (true) {
            try {
                return $fn($attempt);
            } catch (NonRetryableException $e) {
                throw $e;
            } catch (\Throwable $e) {
                if (!$policy->shouldRetry($e, $attempt)) {
                    if ($policy->matches($e)) {
                        throw new RetriesExhausted($attempt, $e);
                    }
                    throw $e;
                }
                $delay = $policy->delayFor($attempt, $this->rng);
                if ($policy->totalBudgetMs !== null && ($this->clock->now() - $start) + $delay > $policy->totalBudgetMs) {
                    throw new RetriesExhausted($attempt, $e, 'budget');
                }
                $this->clock->sleep($delay);
                $attempt++;
            }
        }
    }
}

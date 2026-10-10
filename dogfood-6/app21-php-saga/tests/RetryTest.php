<?php
declare(strict_types=1);

namespace Saga\Tests;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Saga\Retry\FakeClock;
use Saga\Retry\NonRetryableException;
use Saga\Retry\RetriesExhausted;
use Saga\Retry\RetryExecutor;
use Saga\Retry\RetryPolicy;

final class RetryTest extends TestCase
{
    private function policy(array $o = []): RetryPolicy
    {
        return new RetryPolicy(
            $o['max'] ?? 5,
            $o['base'] ?? 100,
            $o['mult'] ?? 2.0,
            $o['cap'] ?? 1000,
            $o['jitter'] ?? 0.0,
            $o['retryOn'] ?? [\Throwable::class],
            $o['budget'] ?? null,
        );
    }

    /** @id TEST-RETRY-001 @verifies REQ-RETRY-001 */
    public function test_retry_001_ctor_validation(): void
    {
        foreach ([['max' => 0], ['base' => -1], ['mult' => 0.5], ['jitter' => 1.5], ['jitter' => -0.1], ['cap' => 50]] as $bad) {
            try {
                $this->policy($bad);
                $this->fail('expected failure for ' . json_encode($bad));
            } catch (InvalidArgumentException $e) {
                $this->assertNotSame('', $e->getMessage());
            }
        }
        $this->assertInstanceOf(RetryPolicy::class, $this->policy());
    }

    /** @id TEST-RETRY-002 @verifies REQ-RETRY-002 */
    public function test_retry_002_exponential(): void
    {
        $p = $this->policy();
        $this->assertSame([100, 200, 400, 800], [$p->delayFor(1), $p->delayFor(2), $p->delayFor(3), $p->delayFor(4)]);
        $this->assertSame(150, $this->policy(['base' => 50, 'mult' => 3.0, 'cap' => 9999])->delayFor(2));
    }

    /** @id TEST-RETRY-003 @verifies REQ-RETRY-003 */
    public function test_retry_003_cap(): void
    {
        $p = $this->policy();
        $this->assertSame(1000, $p->delayFor(5));
        $this->assertSame(1000, $p->delayFor(6));
    }

    /** @id TEST-RETRY-004 @verifies REQ-RETRY-004 */
    public function test_retry_004_jitter(): void
    {
        $p = $this->policy(['jitter' => 0.5]);
        $this->assertSame(75, $p->delayFor(1, fn(): float => 0.5));
        $this->assertSame(100, $p->delayFor(1, fn(): float => 0.0));
        $this->assertSame(50, $p->delayFor(1, fn(): float => 0.999999999));
        $calls = 0;
        $this->policy()->delayFor(2, function () use (&$calls): float {
            $calls++;
            return 0.3;
        });
        $this->assertSame(0, $calls);
    }

    /** @id TEST-RETRY-005 @verifies REQ-RETRY-005 */
    public function test_retry_005_overflow(): void
    {
        $p = $this->policy(['mult' => 10.0, 'cap' => PHP_INT_MAX]);
        $d = $p->delayFor(100000);
        $this->assertIsInt($d);
        $this->assertSame(PHP_INT_MAX, $d);
        $this->assertSame(1000, $this->policy()->delayFor(100000));
    }

    /** @id TEST-RETRY-006 @verifies REQ-RETRY-006 */
    public function test_retry_006_attempt_limit(): void
    {
        $p = $this->policy(['max' => 3]);
        $e = new RuntimeException('x');
        $this->assertTrue($p->shouldRetry($e, 1));
        $this->assertTrue($p->shouldRetry($e, 2));
        $this->assertFalse($p->shouldRetry($e, 3));
    }

    /** @id TEST-RETRY-007 @verifies REQ-RETRY-007 */
    public function test_retry_007_classification(): void
    {
        $p = $this->policy(['retryOn' => [RuntimeException::class]]);
        $this->assertTrue($p->shouldRetry(new RuntimeException('a'), 1));
        $this->assertFalse($p->shouldRetry(new \LogicException('b'), 1));
        $all = $this->policy();
        $this->assertFalse($all->shouldRetry(new NonRetryableException('c'), 1));
    }

    /** @id TEST-RETRY-008 @verifies REQ-RETRY-008 */
    public function test_retry_008_fake_clock(): void
    {
        $c = new FakeClock(10);
        $c->sleep(5);
        $c->sleep(0);
        $this->assertSame(15, $c->now());
        $this->expectException(InvalidArgumentException::class);
        $c->sleep(-1);
    }

    /** @id TEST-RETRY-009 @verifies REQ-RETRY-009 */
    public function test_retry_009_executor_retries(): void
    {
        $clock = new FakeClock(0);
        $x = new RetryExecutor($clock);
        $seen = [];
        $r = $x->run($this->policy(), function (int $attempt) use (&$seen): string {
            $seen[] = $attempt;
            if ($attempt < 3) {
                throw new RuntimeException('flaky');
            }
            return 'ok';
        });
        $this->assertSame('ok', $r);
        $this->assertSame([1, 2, 3], $seen);
        $this->assertSame(300, $clock->now());
        $c2 = new FakeClock(0);
        $this->assertSame(7, (new RetryExecutor($c2))->run($this->policy(), fn(int $a): int => 7));
        $this->assertSame(0, $c2->now());
    }

    /** @id TEST-RETRY-010 @verifies REQ-RETRY-010 */
    public function test_retry_010_exhausted(): void
    {
        $clock = new FakeClock(0);
        $x = new RetryExecutor($clock);
        $n = 0;
        try {
            $x->run($this->policy(['max' => 3]), function (int $a) use (&$n): void {
                $n++;
                throw new RuntimeException("fail$a");
            });
            $this->fail('expected exhaustion');
        } catch (RetriesExhausted $e) {
            $this->assertSame(3, $e->attempts());
            $this->assertSame('fail3', $e->getPrevious()?->getMessage());
        }
        $this->assertSame(3, $n);
        $this->assertSame(300, $clock->now());
    }

    /** @id TEST-RETRY-011 @verifies REQ-RETRY-011 */
    public function test_retry_011_non_retryable(): void
    {
        $clock = new FakeClock(0);
        $boom = new NonRetryableException('fatal');
        try {
            (new RetryExecutor($clock))->run($this->policy(), function (int $a) use ($boom): void {
                throw $boom;
            });
            $this->fail('expected throw');
        } catch (NonRetryableException $e) {
            $this->assertSame($boom, $e);
        }
        $this->assertSame(0, $clock->now());
    }

    /** @id TEST-RETRY-012 @verifies REQ-RETRY-012 */
    public function test_retry_012_budget(): void
    {
        $clock = new FakeClock(1000);
        $n = 0;
        try {
            (new RetryExecutor($clock))->run($this->policy(['max' => 10, 'budget' => 300]), function (int $a) use (&$n): void {
                $n++;
                throw new RuntimeException('f');
            });
            $this->fail('expected exhaustion');
        } catch (RetriesExhausted $e) {
            $this->assertSame(3, $e->attempts());
        }
        // delays 100 + 200 = 300 allowed (== budget); next 400 would exceed
        $this->assertSame(1300, $clock->now());
        $this->assertSame(3, $n);
    }
}

<?php
declare(strict_types=1);

namespace Saga\Tests;

use InvalidArgumentException;
use LogicException;
use PHPUnit\Framework\TestCase;
use Saga\Definition\SagaDefinition;
use Saga\Definition\StepDefinition;

final class DefinitionTest extends TestCase
{
    private function step(string $n, array $deps = [], ?callable $comp = null): StepDefinition
    {
        return new StepDefinition($n, fn() => $n, $comp, $deps);
    }

    private function saga(array $steps, string $name = 'order'): SagaDefinition
    {
        $d = new SagaDefinition($name);
        foreach ($steps as $s) {
            $d->addStep($s);
        }
        return $d;
    }

    /** @id TEST-DEF-001 @verifies REQ-DEF-001 */
    public function test_def_001_add_and_get(): void
    {
        $d = $this->saga([$this->step('b'), $this->step('a')]);
        $this->assertSame(['b', 'a'], $d->stepNames());
        $this->assertSame('a', $d->step('a')->name);
        $this->expectException(LogicException::class);
        $d->step('zzz');
    }

    /** @id TEST-DEF-002 @verifies REQ-DEF-002 */
    public function test_def_002_name_validation(): void
    {
        foreach (['', 'a b', 'a/b', "a\n", 'ü'] as $bad) {
            try {
                $this->step($bad);
                $this->fail("step name accepted: " . json_encode($bad));
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->expectException(InvalidArgumentException::class);
        new SagaDefinition('bad name');
    }

    /** @id TEST-DEF-003 @verifies REQ-DEF-003 */
    public function test_def_003_duplicate(): void
    {
        $d = $this->saga([$this->step('a')]);
        try {
            $d->addStep($this->step('a', ['x']));
            $this->fail('duplicate accepted');
        } catch (LogicException) {
            $this->assertSame(['a'], $d->stepNames());
            $this->assertSame([], $d->step('a')->dependsOn);
        }
    }

    /** @id TEST-DEF-004 @verifies REQ-DEF-004 */
    public function test_def_004_self_dependency(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->step('a', ['a']);
    }

    /** @id TEST-DEF-005 @verifies REQ-DEF-005 */
    public function test_def_005_topological_order(): void
    {
        $this->assertSame(['a', 'b', 'c'], $this->saga([$this->step('a'), $this->step('b'), $this->step('c')])->executionOrder());
        $d = $this->saga([$this->step('ship', ['pay', 'reserve']), $this->step('pay', ['reserve']), $this->step('reserve'), $this->step('email')]);
        $this->assertSame(['reserve', 'pay', 'ship', 'email'], $d->executionOrder());
        $diamond = $this->saga([$this->step('d', ['b', 'c']), $this->step('c', ['a']), $this->step('b', ['a']), $this->step('a')]);
        $this->assertSame(['a', 'c', 'b', 'd'], $diamond->executionOrder());
        $this->assertSame([], (new SagaDefinition('empty'))->executionOrder());
    }

    /** @id TEST-DEF-006 @verifies REQ-DEF-006 */
    public function test_def_006_unknown_dependency(): void
    {
        $d = $this->saga([$this->step('pay', ['ghost'])]);
        try {
            $d->executionOrder();
            $this->fail('expected LogicException');
        } catch (LogicException $e) {
            $this->assertStringContainsString('pay', $e->getMessage());
            $this->assertStringContainsString('ghost', $e->getMessage());
        }
    }

    /** @id TEST-DEF-007 @verifies REQ-DEF-007 */
    public function test_def_007_cycle(): void
    {
        $d = $this->saga([$this->step('ok'), $this->step('a', ['c']), $this->step('b', ['a']), $this->step('c', ['b'])]);
        try {
            $d->executionOrder();
            $this->fail('expected cycle');
        } catch (LogicException $e) {
            $this->assertStringContainsString('cycle', $e->getMessage());
            $this->assertMatchesRegularExpression('/a.*c.*b.*a|a.*b.*c.*a|b.*a.*c.*b|c.*b.*a.*c|b.*c.*a.*b|c.*a.*b.*c/', $e->getMessage());
            $this->assertStringNotContainsString('ok', $e->getMessage());
        }
    }

    /** @id TEST-DEF-008 @verifies REQ-DEF-008 */
    public function test_def_008_compensation_order(): void
    {
        $d = $this->saga([$this->step('c', ['b']), $this->step('b', ['a']), $this->step('a')]);
        $this->assertSame(['b', 'a'], $d->compensationOrder(['a', 'b']));
        $this->assertSame(['a'], $d->compensationOrder(['a']));
        $this->assertSame([], $d->compensationOrder([]));
        $this->expectException(InvalidArgumentException::class);
        $d->compensationOrder(['nope']);
    }

    /** @id TEST-DEF-009 @verifies REQ-DEF-009 */
    public function test_def_009_fingerprint(): void
    {
        $f = $this->saga([$this->step('a'), $this->step('b', ['a'])])->fingerprint();
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $f);
        $this->assertSame($f, $this->saga([$this->step('b', ['a']), $this->step('a')])->fingerprint());
        $this->assertNotSame($f, $this->saga([$this->step('a'), $this->step('b')])->fingerprint());
        $this->assertNotSame($f, $this->saga([$this->step('a'), $this->step('b', ['a']), $this->step('c')])->fingerprint());
        $this->assertNotSame($f, $this->saga([$this->step('a'), $this->step('b', ['a'])], 'other')->fingerprint());
        $this->assertSame($f, $this->saga([$this->step('a'), $this->step('b', ['a'])])->fingerprint());
    }
}

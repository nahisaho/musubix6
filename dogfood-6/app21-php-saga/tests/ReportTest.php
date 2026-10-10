<?php
declare(strict_types=1);

namespace Saga\Tests;

use PHPUnit\Framework\TestCase;
use Saga\Report\SagaReport;
use Saga\State\SagaInstance;
use Saga\State\SagaStatus;
use Saga\State\StepStatus;

final class ReportTest extends TestCase
{
    private function failedRun(): SagaInstance
    {
        $i = SagaInstance::create('r1', 'fp', ['pay', 'ship', 'mail']);
        $i->transitionSaga(SagaStatus::RUNNING, 100);
        $i->transitionStep('pay', StepStatus::RUNNING, 110);
        $i->transitionStep('pay', StepStatus::DONE, 120);
        $i->transitionStep('ship', StepStatus::RUNNING, 130);
        $i->transitionStep('ship', StepStatus::FAILED, 180);
        $i->transitionSaga(SagaStatus::COMPENSATING, 181);
        $i->transitionStep('pay', StepStatus::COMPENSATING, 190);
        $i->transitionStep('pay', StepStatus::COMPENSATION_FAILED, 250);
        $i->transitionSaga(SagaStatus::FAILED, 251);
        return $i;
    }

    /** @id TEST-REPORT-001 @verifies REQ-REPORT-001 */
    public function test_report_001_timeline(): void
    {
        $t = (new SagaReport($this->failedRun()))->timeline();
        $this->assertCount(9, $t);
        $this->assertSame('1 saga r1 RUNNING@100', $t[0]);
        $this->assertSame('5 step ship FAILED@180', $t[4]);
        $this->assertSame('9 saga r1 FAILED@251', $t[8]);
        $empty = new SagaReport(SagaInstance::create('e', 'fp', []));
        $this->assertSame([], $empty->timeline());
    }

    /** @id TEST-REPORT-002 @verifies REQ-REPORT-002 */
    public function test_report_002_summary(): void
    {
        $s = (new SagaReport($this->failedRun()))->summary();
        $this->assertSame(
            ['PENDING' => 1, 'RUNNING' => 0, 'DONE' => 0, 'FAILED' => 1, 'COMPENSATING' => 0, 'COMPENSATED' => 0, 'COMPENSATION_FAILED' => 1],
            $s,
        );
    }

    /** @id TEST-REPORT-003 @verifies REQ-REPORT-003 */
    public function test_report_003_duration(): void
    {
        $this->assertSame(151, (new SagaReport($this->failedRun()))->durationMs());
        $this->assertSame(0, (new SagaReport(SagaInstance::create('e', 'fp', ['a'])))->durationMs());
        $one = SagaInstance::create('o', 'fp', ['a']);
        $one->transitionSaga(SagaStatus::RUNNING, 500);
        $this->assertSame(0, (new SagaReport($one))->durationMs());
    }

    /** @id TEST-REPORT-004 @verifies REQ-REPORT-004 */
    public function test_report_004_failed_steps(): void
    {
        $this->assertSame(['pay', 'ship'], (new SagaReport($this->failedRun()))->failedSteps());
        $ok = SagaInstance::create('k', 'fp', ['a']);
        $this->assertSame([], (new SagaReport($ok))->failedSteps());
    }

    /** @id TEST-REPORT-005 @verifies REQ-REPORT-005 */
    public function test_report_005_needs_attention(): void
    {
        $this->assertTrue((new SagaReport($this->failedRun()))->needsAttention());
        $i = SagaInstance::create('c', 'fp', ['a']);
        $i->transitionSaga(SagaStatus::RUNNING, 1);
        $i->transitionStep('a', StepStatus::RUNNING, 2);
        $i->transitionStep('a', StepStatus::FAILED, 3);
        $i->transitionSaga(SagaStatus::COMPENSATING, 4);
        $i->transitionSaga(SagaStatus::COMPENSATED, 5);
        $this->assertFalse((new SagaReport($i))->needsAttention());
        $j = SagaInstance::create('d', 'fp', ['a']);
        $j->transitionSaga(SagaStatus::COMPLETED, 1);
        $this->assertFalse((new SagaReport($j))->needsAttention());
    }
}

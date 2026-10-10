<?php
declare(strict_types=1);

namespace Saga\Report;

use Saga\State\SagaInstance;
use Saga\State\SagaStatus;
use Saga\State\StepStatus;

final class SagaReport
{
    public function __construct(private SagaInstance $instance)
    {
    }

    /**
     * @id CODE-REPORT-001 @implements REQ-REPORT-001
     * @return string[]
     */
    public function timeline(): array
    {
        $events = $this->instance->events();
        usort($events, fn($a, $b) => $a['seq'] <=> $b['seq']);
        return array_map(fn($e) => "{$e['seq']} {$e['kind']} {$e['subject']} {$e['status']}@{$e['at']}", $events);
    }

    /**
     * @id CODE-REPORT-002 @implements REQ-REPORT-002
     * @return array<string,int>
     */
    public function summary(): array
    {
        $counts = [];
        foreach (StepStatus::cases() as $c) {
            $counts[$c->name] = 0;
        }
        foreach ($this->instance->stepStatuses() as $s) {
            $counts[$s->name]++;
        }
        return $counts;
    }

    /** @id CODE-REPORT-003 @implements REQ-REPORT-003 */
    public function durationMs(): int
    {
        $e = $this->instance->events();
        return count($e) < 2 ? 0 : $e[count($e) - 1]['at'] - $e[0]['at'];
    }

    /**
     * @id CODE-REPORT-004 @implements REQ-REPORT-004
     * @return string[]
     */
    public function failedSteps(): array
    {
        $out = [];
        foreach ($this->instance->stepStatuses() as $n => $s) {
            if ($s === StepStatus::FAILED || $s === StepStatus::COMPENSATION_FAILED) {
                $out[] = (string) $n;
            }
        }
        sort($out);
        return $out;
    }

    /** @id CODE-REPORT-005 @implements REQ-REPORT-005 */
    public function needsAttention(): bool
    {
        return $this->instance->status() === SagaStatus::FAILED
            || in_array(StepStatus::COMPENSATION_FAILED, $this->instance->stepStatuses(), true);
    }
}

<?php
declare(strict_types=1);

namespace Saga\State;

enum StepStatus: string
{
    case PENDING = 'PENDING';
    case RUNNING = 'RUNNING';
    case DONE = 'DONE';
    case FAILED = 'FAILED';
    case COMPENSATING = 'COMPENSATING';
    case COMPENSATED = 'COMPENSATED';
    case COMPENSATION_FAILED = 'COMPENSATION_FAILED';

    /** @id CODE-STATE-004 @implements REQ-STATE-004 */
    public static function canTransition(self $from, self $to): bool
    {
        $table = [
            'PENDING' => ['RUNNING'],
            'RUNNING' => ['DONE', 'FAILED', 'PENDING'],
            'DONE' => ['COMPENSATING'],
            'COMPENSATING' => ['COMPENSATED', 'COMPENSATION_FAILED'],
        ];
        return TransitionTable::allows($table, $from, $to);
    }
}

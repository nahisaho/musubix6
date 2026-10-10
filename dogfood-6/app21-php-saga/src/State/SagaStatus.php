<?php
declare(strict_types=1);

namespace Saga\State;

enum SagaStatus: string
{
    case PENDING = 'PENDING';
    case RUNNING = 'RUNNING';
    case COMPENSATING = 'COMPENSATING';
    case COMPLETED = 'COMPLETED';
    case COMPENSATED = 'COMPENSATED';
    case FAILED = 'FAILED';

    /** @id CODE-STATE-001 @implements REQ-STATE-001 */
    public static function canTransition(self $from, self $to): bool
    {
        $table = [
            'PENDING' => ['RUNNING', 'COMPLETED'],
            'RUNNING' => ['COMPENSATING', 'COMPLETED'],
            'COMPENSATING' => ['COMPENSATED', 'FAILED'],
        ];
        return TransitionTable::allows($table, $from, $to);
    }

    /** @id CODE-STATE-003 @implements REQ-STATE-003 */
    public function isTerminal(): bool
    {
        return match ($this) {
            self::COMPLETED, self::COMPENSATED, self::FAILED => true,
            default => false,
        };
    }
}

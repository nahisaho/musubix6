<?php
declare(strict_types=1);

namespace Saga\State;

final class TransitionTable
{
    /** @param array<string, string[]> $table */
    public static function allows(array $table, \BackedEnum $from, \BackedEnum $to): bool
    {
        return in_array($to->value, $table[$from->value] ?? [], true);
    }
}

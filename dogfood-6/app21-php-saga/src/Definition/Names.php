<?php
declare(strict_types=1);

namespace Saga\Definition;

use InvalidArgumentException;

final class Names
{
    /** @id CODE-DEF-002 @implements REQ-DEF-002 */
    public static function assertValid(string $name, string $what): void
    {
        if (preg_match('/\A[A-Za-z0-9_.-]+\z/', $name) !== 1) {
            throw new InvalidArgumentException("invalid $what name");
        }
    }
}

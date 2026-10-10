<?php
declare(strict_types=1);

namespace Saga\Idempotency;

final class KeyFactory
{
    /**
     * @id CODE-IDEM-001 @implements REQ-IDEM-001
     * @id CODE-IDEM-002 @implements REQ-IDEM-002
     */
    public static function forStep(string $sagaId, string $step, string $phase): string
    {
        $enc = '';
        foreach ([$sagaId, $step, $phase] as $part) {
            $enc .= strlen($part) . ':' . $part . '|';
        }
        return hash('sha256', $enc);
    }
}

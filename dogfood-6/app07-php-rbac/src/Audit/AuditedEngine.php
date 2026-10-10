<?php
declare(strict_types=1);

namespace Rbac\Audit;

use Rbac\Engine\Decision;
use Rbac\Engine\Engine;
use Rbac\Engine\Request;

final class AuditedEngine
{
    /** @param callable(): int $clock */
    public function __construct(private Engine $engine, private AuditLog $log, private $clock)
    {
    }

    /** @id CODE-AUD-005 @implements REQ-AUD-001 REQ-AUD-006 */
    public function decide(Request $r): Decision
    {
        try {
            $d = $this->engine->decide($r);
        } catch (\Throwable) {
            $d = Decision::deny('error');
        }
        $this->log->append([
            'ts' => ($this->clock)(),
            'subject' => (string) ($r->subject['id'] ?? ''),
            'action' => $r->action,
            'resource' => $r->resource,
            'decision' => $d->effect,
            'reason' => $d->reason,
            'matched' => $d->matched,
        ]);
        return $d;
    }
}

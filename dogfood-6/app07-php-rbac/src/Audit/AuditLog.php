<?php
declare(strict_types=1);

namespace Rbac\Audit;

final class AuditLog
{
    private const GENESIS = '0000000000000000000000000000000000000000000000000000000000000000';

    /** @var array<int, array<string, mixed>> */
    private array $entries = [];

    /** @id CODE-AUD-001 @implements REQ-AUD-002 */
    public function append(array $entry): array
    {
        $entry['prev'] = $this->entries === [] ? self::GENESIS : end($this->entries)['hash'];
        $entry['hash'] = self::hashOf($entry);
        $this->entries[] = $entry;
        return $entry;
    }

    public function entries(): array
    {
        return $this->entries;
    }

    public static function fromEntries(array $entries): self
    {
        $log = new self();
        $log->entries = $entries;
        return $log;
    }

    /** @id CODE-AUD-002 @implements REQ-AUD-003 REQ-AUD-004 */
    public function verify(): bool
    {
        $prev = self::GENESIS;
        foreach ($this->entries as $e) {
            if (($e['prev'] ?? null) !== $prev || ($e['hash'] ?? null) !== self::hashOf($e)) {
                return false;
            }
            $prev = $e['hash'];
        }
        return true;
    }

    /** @id CODE-AUD-003 @implements REQ-AUD-005 */
    public function filter(string $decision): array
    {
        return array_values(array_filter($this->entries, fn (array $e): bool => $e['decision'] === $decision));
    }

    /** @id CODE-AUD-004 @implements REQ-AUD-007 */
    public function export(int $index): string
    {
        $e = $this->entries[$index];
        ksort($e, SORT_STRING);
        return json_encode($e, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    }

    private static function hashOf(array $entry): string
    {
        $prev = $entry['prev'] ?? '';
        unset($entry['hash']);
        return hash('sha256', $prev . json_encode($entry));
    }
}

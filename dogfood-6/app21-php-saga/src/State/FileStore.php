<?php
declare(strict_types=1);

namespace Saga\State;

use InvalidArgumentException;
use JsonException;

final class FileStore implements StateStore
{
    public function __construct(private string $dir)
    {
    }

    /** @id CODE-STATE-010 @implements REQ-STATE-010 */
    private function path(string $id): string
    {
        if (preg_match('/\A[A-Za-z0-9_-][A-Za-z0-9_.-]*\z/', $id) !== 1) {
            throw new InvalidArgumentException('invalid saga id');
        }
        return rtrim($this->dir, '/') . "/$id.json";
    }

    public function load(string $id): ?SagaInstance
    {
        $p = $this->path($id);
        if (!is_file($p)) {
            return null;
        }
        try {
            return SagaInstance::fromArray(json_decode((string) file_get_contents($p), true, 512, JSON_THROW_ON_ERROR));
        } catch (JsonException | InvalidArgumentException | \TypeError $e) {
            throw new CorruptState("corrupt state file for $id", 0, $e);
        }
    }

    /** @id CODE-STATE-009 @implements REQ-STATE-009 */
    public function save(SagaInstance $instance, int $expectedVersion): void
    {
        $p = $this->path($instance->id());
        $existing = $this->load($instance->id());
        $current = $existing?->version() ?? 0;
        if ($current !== $expectedVersion) {
            throw new ConcurrencyException("stale version for {$instance->id()}: expected $expectedVersion, found $current");
        }
        $instance->setVersion($expectedVersion + 1);
        $tmp = $p . '.tmp';
        file_put_contents($tmp, json_encode($instance->toArray(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), LOCK_EX);
        rename($tmp, $p);
    }
}

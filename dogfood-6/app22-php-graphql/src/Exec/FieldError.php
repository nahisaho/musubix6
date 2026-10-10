<?php
declare(strict_types=1);

namespace GraphqlLite\Exec;

final class FieldError extends \RuntimeException
{
    /** @param array<int,string|int> $path */
    public function __construct(string $message, public readonly array $path, ?\Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }

    /** @return array{message:string,path:array} */
    public function toArray(): array
    {
        return ['message' => $this->getMessage(), 'path' => $this->path];
    }
}

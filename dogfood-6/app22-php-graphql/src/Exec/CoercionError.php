<?php
declare(strict_types=1);

namespace GraphqlLite\Exec;

final class CoercionError extends \Exception
{
    public function __construct(string $message, public readonly string $at = '')
    {
        parent::__construct($message);
    }
}

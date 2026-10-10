<?php
declare(strict_types=1);

namespace GraphqlLite\Lex;

class SyntaxError extends \Exception
{
    public int $col;

    public function __construct(string $message, int $line = 0, int $col = 0)
    {
        parent::__construct($message . ($line ? " ($line:$col)" : ''));
        $this->line = $line;
        $this->col = $col;
    }
}

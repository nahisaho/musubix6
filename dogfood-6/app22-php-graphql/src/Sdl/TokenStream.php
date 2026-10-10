<?php
declare(strict_types=1);

namespace GraphqlLite\Sdl;

use GraphqlLite\Lex\Lexer;
use GraphqlLite\Lex\SyntaxError;
use GraphqlLite\Lex\Token;

class TokenStream
{
    /** @var Token[] */
    protected array $tokens;
    protected int $i = 0;

    public function __construct(string $src)
    {
        $this->tokens = (new Lexer($src))->tokenize();
    }

    protected function peek(int $o = 0): Token
    {
        return $this->tokens[min($this->i + $o, count($this->tokens) - 1)];
    }

    protected function advance(): Token
    {
        $t = $this->peek();
        if ($t->kind !== 'EOF') {
            $this->i++;
        }
        return $t;
    }

    protected function atPunct(string $v): bool
    {
        return $this->peek()->is('Punct', $v);
    }

    protected function atName(?string $v = null): bool
    {
        return $this->peek()->is('Name', $v);
    }

    protected function eatPunct(string $v): bool
    {
        if ($this->atPunct($v)) {
            $this->i++;
            return true;
        }
        return false;
    }

    protected function expectPunct(string $v): Token
    {
        if (!$this->atPunct($v)) {
            throw $this->unexpected("\"$v\"");
        }
        return $this->advance();
    }

    protected function expectName(string $what = 'Name'): string
    {
        if (!$this->atName()) {
            throw $this->unexpected($what);
        }
        return $this->advance()->value;
    }

    protected function expectKeyword(string $kw): void
    {
        if (!$this->atName($kw)) {
            throw $this->unexpected("\"$kw\"");
        }
        $this->advance();
    }

    protected function unexpected(?string $expected = null): SyntaxError
    {
        $t = $this->peek();
        $msg = $expected !== null ? "Expected $expected but found " . $t->describe() : 'Unexpected ' . $t->describe();
        return new SyntaxError($msg, $t->line, $t->col);
    }

    protected function failAt(Token $t, string $msg): SyntaxError
    {
        return new SyntaxError($msg, $t->line, $t->col);
    }
}

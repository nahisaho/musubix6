<?php
declare(strict_types=1);

namespace Rbac\Conditions;

final class Parser
{
    private int $pos = 0;

    /** @param array<int, array{string, mixed}> $tokens */
    private function __construct(private array $tokens)
    {
    }

    /**
     * @id CODE-COND-002 @implements REQ-COND-003 REQ-COND-004 REQ-COND-006
     */
    public static function parse(array $tokens): array
    {
        $p = new self($tokens);
        $ast = $p->orExpr();
        if ($p->pos < count($tokens)) {
            throw new ParseException('unexpected token ' . $tokens[$p->pos][0]);
        }
        return $ast;
    }

    private function peek(): ?string
    {
        return $this->tokens[$this->pos][0] ?? null;
    }

    private function eat(string $type): array
    {
        if ($this->peek() !== $type) {
            throw new ParseException("expected $type, got " . ($this->peek() ?? 'end'));
        }
        return $this->tokens[$this->pos++];
    }

    private function orExpr(): array
    {
        $l = $this->andExpr();
        while ($this->peek() === '||') {
            $this->pos++;
            $l = ['or', $l, $this->andExpr()];
        }
        return $l;
    }

    private function andExpr(): array
    {
        $l = $this->unary();
        while ($this->peek() === '&&') {
            $this->pos++;
            $l = ['and', $l, $this->unary()];
        }
        return $l;
    }

    private function unary(): array
    {
        if ($this->peek() === '!') {
            $this->pos++;
            return ['not', $this->unary()];
        }
        return $this->comparison();
    }

    private function comparison(): array
    {
        $l = $this->operand();
        $t = $this->peek();
        if (in_array($t, ['==', '!=', '<', '<=', '>', '>='], true)) {
            $this->pos++;
            return ['cmp', $t, $l, $this->operand()];
        }
        if ($t === 'in') {
            $this->pos++;
            $this->eat('[');
            $items = [];
            while ($this->peek() !== ']') {
                $items[] = $this->operand();
                if ($this->peek() === ',') {
                    $this->pos++;
                } elseif ($this->peek() !== ']') {
                    throw new ParseException('expected , or ] in list');
                }
            }
            $this->eat(']');
            return ['in', $l, $items];
        }
        return $l;
    }

    private function operand(): array
    {
        $t = $this->peek();
        if ($t === '(') {
            $this->pos++;
            $e = $this->orExpr();
            $this->eat(')');
            return $e;
        }
        if ($t === 'str' || $t === 'num') {
            return ['lit', $this->tokens[$this->pos++][1]];
        }
        if ($t === 'true' || $t === 'false') {
            $this->pos++;
            return ['lit', $t === 'true'];
        }
        if ($t === 'path') {
            return ['path', $this->tokens[$this->pos++][1]];
        }
        throw new ParseException('unexpected ' . ($t ?? 'end of input'));
    }
}

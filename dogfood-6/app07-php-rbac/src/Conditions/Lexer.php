<?php
declare(strict_types=1);

namespace Rbac\Conditions;

final class Lexer
{
    /**
     * @id CODE-COND-001 @implements REQ-COND-006
     * @return array<int, array{string, mixed}> tokens as [type, value]
     */
    public static function tokenize(string $src): array
    {
        $tokens = [];
        $i = 0;
        $n = strlen($src);
        while ($i < $n) {
            $c = $src[$i];
            if (ctype_space($c)) {
                $i++;
            } elseif ($c === '"') {
                $end = strpos($src, '"', $i + 1);
                if ($end === false) {
                    throw new ParseException('unterminated string');
                }
                $tokens[] = ['str', substr($src, $i + 1, $end - $i - 1)];
                $i = $end + 1;
            } elseif (preg_match('/\G-?\d+(?:\.\d+)?/', $src, $m, 0, $i) === 1) {
                $tokens[] = ['num', $m[0] + 0];
                $i += strlen($m[0]);
            } elseif (preg_match('/\G[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/', $src, $m, 0, $i) === 1) {
                $w = $m[0];
                $tokens[] = in_array($w, ['true', 'false', 'in'], true) ? [$w, $w] : ['path', $w];
                $i += strlen($w);
            } elseif (preg_match('/\G(==|!=|<=|>=|&&|\|\||[<>!()\[\],])/', $src, $m, 0, $i) === 1) {
                $tokens[] = [$m[0], $m[0]];
                $i += strlen($m[0]);
            } else {
                throw new ParseException("unexpected character '$c' at $i");
            }
        }
        return $tokens;
    }
}

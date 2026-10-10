<?php
declare(strict_types=1);

namespace GraphqlLite\Lex;

final class Lexer
{
    private int $pos = 0;
    private int $line = 1;
    private int $col = 1;
    private int $len;

    public function __construct(private readonly string $src)
    {
        $this->len = strlen($src);
    }

    /**
     * @id CODE-LEX-001 @implements REQ-LEX-001 REQ-LEX-002 REQ-LEX-003 REQ-LEX-004 REQ-LEX-005 REQ-LEX-006 REQ-LEX-007 REQ-LEX-008 REQ-LEX-009 REQ-LEX-010
     * @return Token[]
     */
    public function tokenize(): array
    {
        $tokens = [];
        while (true) {
            $this->skipIgnored();
            if ($this->pos >= $this->len) {
                $tokens[] = new Token('EOF', '', $this->line, $this->col);
                return $tokens;
            }
            $tokens[] = $this->next();
        }
    }

    private function peek(int $o = 0): string
    {
        return $this->src[$this->pos + $o] ?? '';
    }

    private function advance(): string
    {
        $c = $this->src[$this->pos++];
        if ($c === "\n" || ($c === "\r" && $this->peek() !== "\n")) {
            $this->line++;
            $this->col = 1;
        } elseif ($c !== "\r") {
            // count UTF-8 lead bytes only so columns are in characters
            if ((ord($c) & 0xC0) !== 0x80) {
                $this->col++;
            }
        }
        return $c;
    }

    private function skipIgnored(): void
    {
        while ($this->pos < $this->len) {
            $c = $this->peek();
            if ($c === ' ' || $c === "\t" || $c === ',' || $c === "\n" || $c === "\r") {
                $this->advance();
            } elseif ($c === '#') {
                while ($this->pos < $this->len && $this->peek() !== "\n" && $this->peek() !== "\r") {
                    $this->advance();
                }
            } else {
                return;
            }
        }
    }

    private function next(): Token
    {
        $line = $this->line;
        $col = $this->col;
        $c = $this->peek();
        if (strpos('!$&()[]{}:=@|', $c) !== false) {
            $this->advance();
            return new Token('Punct', $c, $line, $col);
        }
        if ($c === '.') {
            if ($this->peek(1) === '.' && $this->peek(2) === '.') {
                $this->advance();
                $this->advance();
                $this->advance();
                return new Token('Punct', '...', $line, $col);
            }
            throw new SyntaxError('Unexpected "."; did you mean "..."?', $line, $col);
        }
        if (ctype_alpha($c) || $c === '_') {
            $start = $this->pos;
            while ($this->pos < $this->len && (ctype_alnum($this->peek()) || $this->peek() === '_')) {
                $this->advance();
            }
            return new Token('Name', substr($this->src, $start, $this->pos - $start), $line, $col);
        }
        if ($c === '-' || ctype_digit($c)) {
            return $this->number($line, $col);
        }
        if ($c === '"') {
            return $this->peek(1) === '"' && $this->peek(2) === '"' ? $this->blockString($line, $col) : $this->string($line, $col);
        }
        throw new SyntaxError('Unexpected character ' . json_encode($c), $line, $col);
    }

    private function digits(int $line, int $col): void
    {
        if (!ctype_digit($this->peek())) {
            throw new SyntaxError('Invalid number, expected digit', $line, $col);
        }
        while (ctype_digit($this->peek())) {
            $this->advance();
        }
    }

    private function number(int $line, int $col): Token
    {
        $start = $this->pos;
        $float = false;
        if ($this->peek() === '-') {
            $this->advance();
        }
        if ($this->peek() === '0') {
            $this->advance();
            if (ctype_digit($this->peek())) {
                throw new SyntaxError('Invalid number, unexpected digit after 0', $line, $col);
            }
        } else {
            $this->digits($line, $col);
        }
        if ($this->peek() === '.') {
            $float = true;
            $this->advance();
            $this->digits($line, $col);
        }
        if ($this->peek() === 'e' || $this->peek() === 'E') {
            $float = true;
            $this->advance();
            if ($this->peek() === '+' || $this->peek() === '-') {
                $this->advance();
            }
            $this->digits($line, $col);
        }
        $n = $this->peek();
        if ($n === '.' || $n === '_' || ctype_alpha($n)) {
            throw new SyntaxError('Invalid number, expected digit but got ' . json_encode($n), $line, $col);
        }
        return new Token($float ? 'Float' : 'Int', substr($this->src, $start, $this->pos - $start), $line, $col);
    }

    private function string(int $line, int $col): Token
    {
        $this->advance();
        $out = '';
        while (true) {
            if ($this->pos >= $this->len) {
                throw new SyntaxError('Unterminated string', $line, $col);
            }
            $c = $this->peek();
            if ($c === "\n" || $c === "\r") {
                throw new SyntaxError('Unterminated string', $line, $col);
            }
            if ($c === '"') {
                $this->advance();
                return new Token('String', $out, $line, $col);
            }
            if ($c !== '\\') {
                $out .= $this->advance();
                continue;
            }
            $ecol = $this->col;
            $this->advance();
            $e = $this->peek();
            $map = ['n' => "\n", 't' => "\t", 'r' => "\r", 'b' => "\x08", 'f' => "\x0c", '"' => '"', '\\' => '\\', '/' => '/'];
            if ($e !== '' && isset($map[$e])) {
                $this->advance();
                $out .= $map[$e];
            } elseif ($e === 'u') {
                $this->advance();
                $hex = substr($this->src, $this->pos, 4);
                if (!preg_match('/^[0-9A-Fa-f]{4}$/', $hex)) {
                    throw new SyntaxError('Invalid unicode escape', $line, $ecol);
                }
                for ($i = 0; $i < 4; $i++) {
                    $this->advance();
                }
                $cp = $this->codePoint(hexdec($hex), $line, $ecol);
                $out .= mb_chr($cp, 'UTF-8');
            } else {
                throw new SyntaxError('Invalid escape sequence', $line, $ecol);
            }
        }
    }

    private function codePoint(int $cp, int $line, int $col): int
    {
        if ($cp >= 0xDC00 && $cp <= 0xDFFF) {
            throw new SyntaxError('Invalid surrogate pair escape', $line, $col);
        }
        if ($cp < 0xD800 || $cp > 0xDBFF) {
            return $cp;
        }
        if (!preg_match('/^\\\\u([dD][c-fC-F][0-9A-Fa-f]{2})$/', substr($this->src, $this->pos, 6), $m)) {
            throw new SyntaxError('Invalid surrogate pair escape', $line, $col);
        }
        for ($i = 0; $i < 6; $i++) {
            $this->advance();
        }
        return 0x10000 + (($cp - 0xD800) << 10) + (hexdec($m[1]) - 0xDC00);
    }

    private function blockString(int $line, int $col): Token
    {
        $this->advance();
        $this->advance();
        $this->advance();
        $raw = '';
        while (true) {
            if ($this->pos >= $this->len) {
                throw new SyntaxError('Unterminated block string', $line, $col);
            }
            if ($this->peek() === '"' && $this->peek(1) === '"' && $this->peek(2) === '"') {
                $this->advance();
                $this->advance();
                $this->advance();
                break;
            }
            if ($this->peek() === '\\' && substr($this->src, $this->pos + 1, 3) === '"""') {
                $this->advance();
                $this->advance();
                $this->advance();
                $this->advance();
                $raw .= '"""';
                continue;
            }
            $raw .= $this->advance();
        }
        return new Token('BlockString', self::dedent($raw), $line, $col);
    }

    public static function dedent(string $raw): string
    {
        $lines = preg_split('/\r\n|\n|\r/', $raw);
        $common = null;
        foreach ($lines as $i => $l) {
            if ($i === 0) {
                continue;
            }
            $indent = strlen($l) - strlen(ltrim($l, " \t"));
            if ($indent < strlen($l) && ($common === null || $indent < $common)) {
                $common = $indent;
            }
        }
        if ($common) {
            foreach ($lines as $i => $l) {
                if ($i > 0) {
                    $lines[$i] = substr($l, min($common, strlen($l)));
                }
            }
        }
        while ($lines && trim($lines[0], " \t") === '') {
            array_shift($lines);
        }
        while ($lines && trim($lines[count($lines) - 1], " \t") === '') {
            array_pop($lines);
        }
        return implode("\n", $lines);
    }
}

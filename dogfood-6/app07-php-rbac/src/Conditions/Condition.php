<?php
declare(strict_types=1);

namespace Rbac\Conditions;

final class Condition
{
    /** @id CODE-COND-004 @implements REQ-COND-007 */
    public static function evaluate(string $expr, array $ctx): bool
    {
        if (trim($expr) === '') {
            return true;
        }
        return Evaluator::run(Parser::parse(Lexer::tokenize($expr)), $ctx);
    }
}

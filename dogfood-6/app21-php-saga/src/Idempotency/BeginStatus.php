<?php
declare(strict_types=1);

namespace Saga\Idempotency;

enum BeginStatus
{
    case NEW;
    case IN_FLIGHT;
    case REPLAY;
}

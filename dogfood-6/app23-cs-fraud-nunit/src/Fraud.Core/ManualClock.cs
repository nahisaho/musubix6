namespace Fraud.Core;

public sealed class ManualClock : IClock
{
    public ManualClock(DateTimeOffset start) { Now = start; }

    public DateTimeOffset Now { get; private set; }

    /** @id CODE-VEL-001 @implements REQ-VEL-001 */
    public void Advance(TimeSpan span)
    {
        if (span < TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(span), "clock cannot move backwards");
        Now += span;
    }
}

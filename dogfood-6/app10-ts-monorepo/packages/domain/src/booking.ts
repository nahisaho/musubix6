import type { BookingStatus } from './status';
import type { Money } from './money';

export interface Booking { id: string; resource: string; start: number; end: number; status: BookingStatus; price: Money }

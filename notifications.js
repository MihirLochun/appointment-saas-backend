// notifications.js
//
// This module is intentionally isolated from the booking logic in index.js.
// Per our architecture decision: the booking flow (validate -> check
// availability -> save to Postgres -> return success) must NEVER depend on
// this succeeding. This is called a "fire-and-forget" side effect.
//
// Right now this just logs to the console (v1). Later, this is the ONLY
// file that needs to change to send real push notifications, emails, or
// SMS -- the booking route in index.js never needs to know how notifications
// are actually delivered, only that it should ask this module to send one.
 
export async function notifyNewAppointment(appointment) {
  try {
    // Placeholder for v1. In a future version, this is where we'd call a
    // push notification service (e.g. web-push) using a subscription token
    // stored for the business owner's installed PWA.
    console.log(
      `[NOTIFICATION] New appointment #${appointment.appointment_id}: ` +
      `${appointment.customer.name} booked "${appointment.service.name}" ` +
      `on ${appointment.start_time}`
    );
  } catch (err) {
    // Deliberately swallow errors here. A failed notification must NEVER
    // affect the booking's success -- the appointment is already saved
    // in Postgres by the time this function is even called.
    console.error('[NOTIFICATION] Failed to send notification:', err);
  }
}
 
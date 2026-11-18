/**
 * The server's telephone rule (clubfindr `$lib/validators/barValidators.isValidTelephone`):
 * ignore formatting, 7 to 15 digits. The app used to check a US-shaped pattern capped at 12
 * digits, so a German mobile with +49 (13 digits) could not register a venue
 * (DEVICE_CHECKLIST 2026-11-18). Keep this in line with the server's rule, not stricter.
 */
export function isValidTelephone(telephone: string): boolean {
    const digitsOnly = telephone.replace(/\D/g, '');
    return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

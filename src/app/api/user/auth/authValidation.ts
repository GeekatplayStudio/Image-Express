import { z } from 'zod';

/**
 * Shared field shapes for the auth routes.
 *
 * These routes previously cast the parsed body with `as LoginPayload` — a
 * compile-time assertion with no runtime check at all — so a caller could send
 * a number, an object, or a megabyte of text and it reached the password hasher
 * and the user store untouched.
 *
 * The fields are kept **optional** on purpose. Each route already answers
 * missing input with its own message ("Email and password are required."), and
 * the UI keys on those. The schema's job here is to reject the wrong *type* and
 * absurd *length*, not to take over the route's own required-field handling.
 */

/** Auth bodies are small. Google's credential is a JWT, the largest at ~2 KB. */
export const AUTH_BODY_LIMIT_BYTES = 16 * 1024;

/** An email or username. 320 is the maximum length of a valid email address. */
export const identifierField = z.string().max(320);

/**
 * A password or token. Capped generously rather than tightly: the limit exists
 * to stop absurd payloads, not to constrain what a password manager generates.
 */
export const credentialField = z.string().max(1024);

/** A user-visible name. */
export const displayNameField = z.string().max(200);

/** An OAuth credential or reset token — longer, since JWTs are not short. */
export const tokenField = z.string().max(8192);

# Student roster registration

Students can register only when their ID number and `@ctu.edu.ph` email match an unclaimed roster row, and the registration code matches the stored hash. Name, course, and year level are copied from that row. The student is not signed in automatically; they continue to the login page.

## Admin

Sign in as an administrator and open **Roster**.

- Add one student. The 8-character code is shown once. Copy it before leaving the page.
- Import a CSV with the header `id_number,email,first_name,last_name,course,year_level`. The preview marks invalid rows. Only valid rows are saved, in one transaction. Download the code CSV immediately. Those codes are not stored in plaintext and cannot be downloaded again.
- Filter the list by Unclaimed, Claimed, Expired, or Revoked.
- Regenerate a code for an unclaimed or expired row. The previous code stops working.
- Revoke or delete a row that has not been claimed. Claimed rows stay in the list for reference.

Every add, import, regenerate, revoke, and delete writes `registration_audit_log`. The log stores the event type, admin id, student id, IP address, and time. It never stores the code or the password.

## Student

Open the registration page and enter:

- 7-digit student ID
- institutional email
- registration code
- password and confirmation (at least 8 characters, with a letter and a number)

A mismatch, an expired code, or an already-claimed row all return: "Your details don't match our records. Please check them or contact the registrar/admin."

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| `PRISM_ROSTER_CODE_DAYS` | 14 | Days before an unused code expires. Clamped from 1 to 365. |
| Registration rate limit | 5 failures / 15 minutes | Counted separately per IP address and per student ID. The next attempt returns HTTP 429. Format errors are not counted. |
| `PRISM_EMAIL_VERIFY` | off (`0`) | Set to `1`, `true`, or `yes` to require a verification link before a new student can sign in. |

When email verification is off, `email_verified_at` is set at account creation so turning the flag on later does not lock existing students. When it is on, a single-use token is hashed with SHA-256, expires in 24 hours, and the account stays inactive until `verify.html` is opened. Resend is `POST api/auth.php?action=resend_verification` and uses the same 5-per-15-minutes limit per IP. `prism_send_verification_email()` is a stub until a mail service is connected. It does not log the link.

## Existing students

Run once, from the project folder:

```
C:\xampp\php\php.exe scripts\backfill_student_roster.php
```

Students who already have an account are copied into the roster as **claimed**. They do not register again. If an account has no `@ctu.edu.ph` email, the script stores `legacy.{id}@ctu.edu.ph` and prints that id so an administrator can replace it.

## Database

- New install: `prism_database.sql`
- Existing database: `prism_student_roster_migration.sql`
- Reverse the migration: `prism_student_roster_migration_down.sql`

`users.id` stays a string. `claimed_by_user_id` and `created_by_admin_id` reference that string and are cleared if the user row is removed. The password column remains `users.password` and is a bcrypt hash. `id_number` is required for students and is null for teachers and administrators. Revoked rows use `revoked_at`.

## Checks

```
C:\xampp\php\php.exe tests\roster_registration_test.php
```

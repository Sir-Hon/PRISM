# Roster accounts

Administrators create student and teacher accounts from **Roster**. There is no public student registration. `register.html` only explains that, and `POST api/auth.php?action=register` returns 403.

## Students

Add a student with ID, CTU email, name, college, program, year, section, and password. The account is created immediately and can sign in. The password is hashed and is not shown again. The profile section is stored as `PROGRAM YEAR-LETTER`, for example `BSIT 1-A`.

Colleges and programs:

- CoED: BEEd, BSEd-Mathematics, BTLEd-HE
- CoTE: BSFI, BSIE, BSIT, BSHM, BIT-ELEC, BIT-COMPTECH, BIT-AUTO

Year is 1–4. Section is A–F. The list is grouped by college, program, year, and section, and those four filters narrow it.

CSV header: `id_number,email,first_name,last_name,college,program,year,section,password`. The preview marks invalid rows and never shows passwords. Only valid rows are saved, in one transaction.

Deleting a student removes the roster row and that student login.

## Teachers

The Teachers tab stores college, department, and subjects taught, and creates the teacher login with the password entered there. Subjects are comma-separated. The list is grouped by college and department. Deleting a teacher removes that login.

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| `PRISM_EMAIL_VERIFY` | off (`0`) | Set to `1`, `true`, or `yes` to require a verification link before a new student can sign in. |

When email verification is off, `email_verified_at` is set at account creation so turning the flag on later does not lock existing students. When it is on, a single-use token is hashed with SHA-256, expires in 24 hours, and the account stays inactive until `verify.html` is opened. Resend is `POST api/auth.php?action=resend_verification` and uses the same 5-per-15-minutes limit per IP. `prism_send_verification_email()` is a stub until a mail service is connected. It does not log the link.

## Existing students

Run once, from the project folder:

```
C:\xampp\php\php.exe scripts\backfill_student_roster.php
```

Students who already have an account are copied into the roster. They keep the same login. If an account has no `@ctu.edu.ph` email, the script stores `legacy.{id}@ctu.edu.ph` and prints that id so an administrator can replace it. College and section are taken from a section such as `BSIT 1-A` when it matches a known program.

## Database

- New install: `prism_database.sql`
- Existing database: `prism_student_roster_migration.sql`
- Reverse the migration: `prism_student_roster_migration_down.sql`

`users.id` stays a string. `claimed_by_user_id` and `created_by_admin_id` reference that string and are cleared if the user row is removed. The password column remains `users.password` and is a bcrypt hash. `id_number` is required for students and is null for teachers and administrators. Revoked rows use `revoked_at`.

## Checks

```
C:\xampp\php\php.exe tests\roster_registration_test.php
```

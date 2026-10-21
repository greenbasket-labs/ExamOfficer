# ExamOfficer Product Specification

**Status:** Working specification based on the product owner's requirements.  
**Product goal:** Reduce repetitive manual work in school examination administration by keeping a durable student record and collecting marks from several input methods.

## 1. Product principles

1. **Student-centred:** Every student's permanent school ID is the primary human-readable identifier. Existing IDs may be entered; otherwise, the app can generate one. IDs must be unique within the school database.
2. **Offline-first:** Core workflows must function without internet access or a required email/cloud account.
3. **Local by default:** School data stays on the device unless the school deliberately exports or shares it.
4. **Multiple ways to collect data:** Manual entry, objective answer marking, and reviewed imports/scans should feed the same underlying records.
5. **No silent guesses:** If OCR or matching cannot confidently identify a student, subject, date, or score, show a review step.
6. **Configurable schools:** Schools configure subjects, grading boundaries, and aggregation/report rules rather than being locked into one universal scheme.
7. **Recoverable data:** A backup must include a restorable structured copy as well as a human-readable PDF.
8. **Honest feature claims:** A workflow is not considered complete until its acceptance checks pass on the target device.

## 2. Intended users

- School administrator or proprietor configuring the school's identity and academic structure.
- Teacher or examination officer entering marks, preparing objective answer keys, and reviewing imports.
- School staff producing and checking reports.
- Optional device user who protects local access with a PIN.

The first release should prioritize a single school database on one device. Multi-device synchronisation is not part of the initial offline scope.

## 3. Core data concepts

- **School profile:** Name, abbreviation/code, optional school ID, contact details, current academic session and term.
- **Sections and classes:** Configurable school sections and class records.
- **Students:** Unique student ID, full name, gender, class, and relevant admission details. The UI may capture the name in separate fields while presenting the full name together.
- **Subjects and class-subject assignments:** A school-wide subject catalogue plus the subjects taught to each class.
- **Mark record:** Student, subject when known, score, maximum score when known, date/time, optional assessment label, source method, import/batch identity, and review status.
- **Objective assessment:** Assessment title, subject, class, question count, per-question options/correct answer, marks per question or scoring rule, and answer-sheet format.
- **Attendance record:** Student, relevant date or period, attendance state, and source.
- **Grading configuration:** School-defined score boundaries, grade labels, and optional remarks.
- **Backup manifest:** Format/schema version, creation time, school identity, record counts, and integrity/checksum metadata where applicable.

All database changes must preserve existing school, class, subject, and student records. Use explicit, versioned migrations for schema changes.

## 4. Mark collection workflow

### 4.1 Manual entry
A user selects the class and subject, sees the registered students, enters scores, validates score ranges, and saves. The UI should minimize repeated navigation and clearly indicate incomplete or invalid entries.

### 4.2 Objective marking
A teacher creates an answer key and chooses the number of questions, answer choices, and scoring rule. A student's answers are compared with the key and the score is calculated deterministically. Blank responses, invalid responses, and any negative-marking rule must be explicit configuration, not guesses.

### 4.3 Structured answer sheets
Provide a clearly defined answer-sheet layout with student ID and machine-readable response marks. This is the preferred initial scanning path because its layout can be controlled. Image rotation, blur, missing identifiers, ambiguous bubbles, and unreadable responses must be detected or flagged. Users must be able to review uncertain reads before saving scores.

### 4.4 Ordinary scripts and handwritten scores
Treat this as a later, experimental workflow. OCR/handwriting recognition can propose student identity and score, but it must show the source image and extracted values for confirmation. Do not promise reliable reading of arbitrary handwriting until tested on real, consented examples and supported device cameras/scanners.

### 4.5 Imports and duplicate protection
All collection methods should converge on the same mark-record workflow. An import batch should keep a stable fingerprint and record provenance. Detect a repeated file or repeated batch and flag likely duplicate rows. Do not reject a legitimate new assessment merely because the student earned the same score on another date. Where identity, subject, date, or assessment is uncertain, ask the user to review it.

Assessment labels such as CA1, CA2, or Examination may be optional during initial capture, but retaining an optional label and provenance is important for later aggregation and auditability.

## 5. Calculations and reporting

- Validate that scores are numeric and within the configured maximum.
- Keep raw scores and maximum scores; do not silently overwrite the original mark when deriving percentages or grades.
- Allow school-configured grading boundaries with validation against overlaps and gaps.
- Make aggregate calculations explicit and testable; do not assume that every subject, assessment, or school uses the same weighting.
- Support attendance calculations with a clearly defined denominator and date/period.
- Produce printable/exportable reports using the school's configured subjects, student identity, scores, grades, aggregate rules, attendance, and report comments where implemented.
- Show missing data distinctly from zero scores.

## 6. Backup and restore

The user-facing action should be simple: press **Backup**.

A successful backup should create:
1. A **structured, versioned backup** suitable for restoring the database and relationships accurately.
2. A **PDF summary/export** suitable for reading, printing, or sharing.

The app should choose a clear save location or show a save dialog, report success only after the files have been written, and surface errors. Restoration must validate the file version, structure, and integrity before changing the live database. Offer restore into a safe path or require confirmation before replacing existing records. Never use PDF text extraction as the sole database restoration mechanism.

Backups may contain sensitive student information. Warn users before sharing, and document whether the structured backup is encrypted. Do not claim that a plain export is encrypted.

## 7. PIN and local privacy

- No required account or internet connection.
- Optional PIN setup and unlock.
- Store a salted, slow password hash rather than the PIN itself.
- Avoid exposing student records in logs.
- Provide a recovery/reset flow that does not pretend a forgotten PIN can be recovered from plaintext. A reset may require verified local recovery or restoring a backup.
- Document that the PIN protects access within the app and does not by itself encrypt the database file or backup.

## 8. Platform strategy

The requested target is Windows computers and Android phones. Treat Windows and Android as first-release targets from the start, not as a later optional product. Build and validate incrementally:
1. Stabilize the existing Windows/Tauri app while setting up an Android build smoke test early in the project.
2. Keep database and business logic platform-neutral where practical, and run basic build checks for both platforms as the core evolves.
3. Validate Tauri Android setup, plugins, file import/export, camera/scanner permissions, SQLite paths, backup destinations, and screen layouts on a real Android device before relying on those features.
4. Maintain platform-specific tests and release instructions; desktop success does not count as Android validation.

Do not assume that desktop dialogs, file paths, or image acquisition APIs work the same way on Android. An Android release is complete only after a signed/debug build can be installed and tested on a device.

## 9. Out of initial scope unless separately approved

- Cloud account or developer-hosted student database.
- Automatic cloud syncing between different devices.
- Fully reliable OCR for arbitrary handwritten exam scripts without human review.
- Online payments, licensing, or subscription enforcement before the offline product is stable.
- Claims of production readiness before release checks pass.

## 10. Definition of a trustworthy first release

A school can configure itself, create classes and subjects, register students, enter and calculate marks, define grading, record attendance, produce reports, back up and restore all records, and protect access with an optional PIN—without internet or a required Gmail account. Every advertised workflow must pass documented tests on each supported platform.


## 11. Bulk result-list import and ranking (added requirement)

### 11.1 Teacher-prepared result lists
The app must remain useful when all marking is performed manually. A teacher may compile a list of students and their completed marks in a supported tabular format and import it in bulk. The first supported format should be a clearly documented CSV template; spreadsheet formats may follow if practical.

Before writing any imported data, show a preview and validate required columns, student IDs, class/subject context, score ranges, and duplicate rows. Match primarily by the school's unique student ID. Names and class may help resolve a match, but ambiguous matches must be shown for human confirmation. Never silently attach an imported mark to a guessed student.

Support partial imports: valid rows may be accepted only after the user reviews a summary of accepted, rejected, unmatched, and duplicate rows. Preserve the source filename, import time, and batch fingerprint for audit and duplicate detection. Re-importing the same file/batch should be detected; the same score on a genuinely different assessment must remain allowed.

### 11.2 Results compilation and class positions
After marks are compiled according to the school's configured rules, calculate totals/aggregates and rank all students in each class from first to last. Missing marks must not silently become zero unless a school explicitly configures and confirms that rule. Absent, exempt, and incomplete records should be handled distinctly where applicable.

Tie handling must be consistent and documented (recommended default: competition ranking, e.g. 1, 2, 2, 4, with tied students sharing a position). The report should make ties visible.

### 11.3 Overall school ranking
Allow the school to choose a top-N list for an overall school ranking (for example, top 3, 6, or 10). Before computing it, the app must use an explicitly selected and validated comparison scope, such as a specified set of classes/sections in the same year/term and a compatible ranking metric. Do not compare unlike totals across classes with different maximum scores or subject sets without an explicit comparable aggregate rule. Clearly label the scope used for the list.

### 11.4 Teacher and principal remarks
Provide school-configurable remark options/templates for teacher and principal/headteacher remarks. The school may define its own wording and rules. Any automatically suggested remark must be traceable to a configured rule and editable by authorized school staff before the report is finalized. Do not hardcode one school's grading or remark scheme for every school.

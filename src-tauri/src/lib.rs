use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::Manager;


fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let mut accumulator: u32 = 0;
    let mut bits: u32 = 0;
    for byte in input.bytes() {
        if byte.is_ascii_whitespace() { continue; }
        if byte == b'=' { break; }
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err("The selected PDF could not be decoded.".to_string()),
        };
        accumulator = (accumulator << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push(((accumulator >> bits) & 0xff) as u8);
        }
    }
    Ok(output)
}

#[tauri::command]
fn extract_student_pdf_text(pdf_base64: String) -> Result<String, String> {
    if pdf_base64.len() > 14 * 1024 * 1024 {
        return Err("PDF is too large. Please use a PDF smaller than 10 MB.".to_string());
    }
    let bytes = decode_base64(&pdf_base64)?;
    if !bytes.starts_with(b"%PDF-") {
        return Err("The selected file does not appear to be a valid PDF.".to_string());
    }
    let extracted = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|error| format!("Could not read PDF text: {error}"))?;
    if extracted.trim().is_empty() {
        return Err("No selectable text was found. This may be a scanned PDF; scanned-PDF OCR is not supported yet. Use a text-based PDF or CSV instead.".to_string());
    }
    Ok(extracted)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SchoolProfile {
    school_name: String,
    school_address: String,
    school_email: String,
    school_phone: String,
    session: String,
    term: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SchoolClass {
    id: i64,
    name: String,
    sort_order: i64,
    section_id: Option<i64>,
    section_name: Option<String>,
    section_code: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SchoolSection {
    id: i64,
    name: String,
    code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Subject {
    id: i64,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClassSubject {
    id: i64,
    class_id: i64,
    subject_id: i64,
    class_name: String,
    subject_name: String,
}

fn database_connection(app: &tauri::AppHandle) -> Result<Connection, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot locate application data folder: {e}"))?;

    std::fs::create_dir_all(&directory)
        .map_err(|e| format!("Cannot create application data folder: {e}"))?;

    let database_path = directory.join("examofficer.sqlite");

    let connection = Connection::open(database_path)
        .map_err(|e| format!("Cannot open local database: {e}"))?;

    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;

             CREATE TABLE IF NOT EXISTS school_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                school_name TEXT NOT NULL,
                school_address TEXT NOT NULL DEFAULT '',
                school_email TEXT NOT NULL DEFAULT '',
                school_phone TEXT NOT NULL DEFAULT '',
                session TEXT NOT NULL DEFAULT '',
                term TEXT NOT NULL DEFAULT ''
             );

             CREATE TABLE IF NOT EXISTS school_classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                sort_order INTEGER NOT NULL DEFAULT 0
             );

             CREATE TABLE IF NOT EXISTS subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE
             );

             CREATE TABLE IF NOT EXISTS class_subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER NOT NULL,
                subject_id INTEGER NOT NULL,
                UNIQUE(class_id, subject_id),
                FOREIGN KEY(class_id) REFERENCES school_classes(id)
                    ON DELETE CASCADE,
                FOREIGN KEY(subject_id) REFERENCES subjects(id)
                    ON DELETE CASCADE
             );

             CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
                first_name TEXT NOT NULL,
                middle_name TEXT NOT NULL DEFAULT '',
                last_name TEXT NOT NULL,
                gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
                class_id INTEGER NOT NULL,
                admission_date TEXT NOT NULL DEFAULT '',
                admission_number TEXT NOT NULL DEFAULT '',
                date_of_birth TEXT NOT NULL DEFAULT '',
                guardian_phone TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(class_id) REFERENCES school_classes(id)
                    ON DELETE RESTRICT
             );

             CREATE TABLE IF NOT EXISTS mark_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                subject_id INTEGER NOT NULL,
                session TEXT NOT NULL,
                term TEXT NOT NULL,
                assessment_name TEXT NOT NULL,
                score REAL NOT NULL CHECK (score >= 0),
                max_score REAL NOT NULL CHECK (max_score > 0 AND score <= max_score),
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, subject_id, session, term, assessment_name),
                FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE RESTRICT
             );

             CREATE TABLE IF NOT EXISTS grade_remark_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                minimum_score REAL NOT NULL UNIQUE CHECK (minimum_score >= 0 AND minimum_score <= 100),
                grade_label TEXT NOT NULL,
                teacher_remark TEXT NOT NULL DEFAULT '',
                principal_remark TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0
             );

             INSERT OR IGNORE INTO grade_remark_rules (minimum_score, grade_label, teacher_remark, principal_remark, sort_order) VALUES
                (80, 'A', 'Excellent performance. Keep it up.', 'An excellent result. Maintain this standard.', 1),
                (70, 'B', 'Very good performance. Continue to improve.', 'A very good result. Keep working hard.', 2),
                (60, 'C', 'Good performance. Aim higher.', 'A good result with room for further improvement.', 3),
                (50, 'D', 'Fair performance. More effort is needed.', 'Encourage more consistent study and practice.', 4),
                (0, 'F', 'Needs considerable improvement and support.', 'Please work with the student to improve performance.', 5);

             CREATE TABLE IF NOT EXISTS position_remark_rules (
                position_key TEXT PRIMARY KEY,
                position_label TEXT NOT NULL,
                remark TEXT NOT NULL DEFAULT ''
             );

             INSERT OR IGNORE INTO position_remark_rules (position_key, position_label, remark) VALUES
                ('first', '1st position', 'Congratulations! You are the top-performing student in your class. Keep up the excellent work.'),
                ('second', '2nd position', 'Excellent performance! You have achieved second position in your class. Keep striving for the top.'),
                ('third', '3rd position', 'Very good performance! You have secured third position in your class. Continue working hard.'),
                ('other', '4th position and below', 'Keep working hard and remain focused on improving your performance.');

             CREATE TABLE IF NOT EXISTS report_card_remarks (
                student_id INTEGER NOT NULL,
                session TEXT NOT NULL,
                term TEXT NOT NULL,
                teacher_remark TEXT NOT NULL DEFAULT '',
                principal_remark TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(student_id, session, term),
                FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
             );

             CREATE INDEX IF NOT EXISTS idx_students_class
                ON students(class_id);",
        )
        .map_err(|e| format!("Cannot initialize local database: {e}"))?;

    // Safely add optional student details to existing databases.
    for (column, definition) in [
        ("admission_number", "TEXT NOT NULL DEFAULT ''"),
        ("date_of_birth", "TEXT NOT NULL DEFAULT ''"),
        ("guardian_phone", "TEXT NOT NULL DEFAULT ''"),
    ] {
        let mut statement = connection.prepare("PRAGMA table_info(students)")
            .map_err(|e| format!("Cannot inspect student schema: {e}"))?;
        let columns = statement.query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| format!("Cannot inspect student columns: {e}"))?;
        let mut exists = false;
        for item in columns {
            if item.map_err(|e| format!("Cannot read student schema: {e}"))? == column {
                exists = true;
                break;
            }
        }
        drop(statement);
        if !exists {
            connection.execute_batch(&format!("ALTER TABLE students ADD COLUMN {column} {definition};"))
                .map_err(|e| format!("Cannot add student field {column}: {e}"))?;
        }
    }

    // Safely add configurable school sections to existing databases.
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS school_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            code TEXT NOT NULL COLLATE NOCASE UNIQUE
        );"
    ).map_err(|e| format!("Cannot create school sections table: {e}"))?;

    connection.execute(
        "INSERT OR IGNORE INTO school_sections (name, code) VALUES
            ('Nursery', 'NUR'),
            ('Primary', 'PRI'),
            ('Junior Secondary', 'JSS'),
            ('Senior Secondary', 'SS')",
        [],
    ).map_err(|e| format!("Cannot initialize school sections: {e}"))?;

    let has_section_id: bool = {
        let mut statement = connection
            .prepare("PRAGMA table_info(school_classes)")
            .map_err(|e| format!("Cannot inspect class schema: {e}"))?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| format!("Cannot inspect class columns: {e}"))?;
        let mut found = false;
        for column in columns {
            if column.map_err(|e| format!("Cannot read class schema: {e}"))? == "section_id" {
                found = true;
                break;
            }
        }
        found
    };

    if !has_section_id {
        connection.execute_batch(
            "ALTER TABLE school_classes ADD COLUMN section_id INTEGER
             REFERENCES school_sections(id) ON DELETE RESTRICT;"
        ).map_err(|e| format!("Cannot add class section field: {e}"))?;
    }

    connection.execute(
        "UPDATE school_classes
         SET section_id = (SELECT id FROM school_sections WHERE code = 'PRI')
         WHERE section_id IS NULL
           AND lower(name) LIKE 'primary%'",
        [],
    ).map_err(|e| format!("Cannot assign existing primary classes: {e}"))?;
    Ok(connection)
}

fn clean_name(value: String, field: &str) -> Result<String, String> {
    let value = value.trim().to_string();

    if value.is_empty() {
        return Err(format!("{field} cannot be empty."));
    }

    if value.chars().count() > 100 {
        return Err(format!("{field} must not exceed 100 characters."));
    }

    Ok(value)
}

#[tauri::command]
fn assign_class_section(
    app: tauri::AppHandle,
    class_id: i64,
    section_id: i64,
) -> Result<(), String> {
    let connection = database_connection(&app)?;

    let section_exists: bool = connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM school_sections WHERE id = ?1
            )",
            params![section_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Cannot validate school section: {e}"))?;

    if !section_exists {
        return Err("Please select a valid school section.".to_string());
    }

    let changed = connection
        .execute(
            "UPDATE school_classes SET section_id = ?1 WHERE id = ?2",
            params![section_id, class_id],
        )
        .map_err(|e| format!("Cannot assign section to class: {e}"))?;

    if changed == 0 {
        return Err("Class not found.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn get_school_sections(
    app: tauri::AppHandle,
) -> Result<Vec<SchoolSection>, String> {
    let connection = database_connection(&app)?;

    let mut statement = connection
        .prepare("SELECT id, name, code FROM school_sections ORDER BY id")
        .map_err(|e| format!("Cannot prepare school section query: {e}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(SchoolSection {
                id: row.get(0)?,
                name: row.get(1)?,
                code: row.get(2)?,
            })
        })
        .map_err(|e| format!("Cannot read school sections: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Cannot read school sections: {e}"))
}


#[tauri::command]
fn create_school_section(
    app: tauri::AppHandle,
    name: String,
    code: String,
) -> Result<i64, String> {
    let name = clean_name(name, "Section name")?;
    let code = code.trim().to_ascii_uppercase();

    if !(2..=8).contains(&code.len())
        || !code.chars().all(|character| character.is_ascii_alphanumeric())
    {
        return Err(
            "Section code must contain 2–8 letters or numbers, without spaces or slashes."
                .to_string(),
        );
    }

    let connection = database_connection(&app)?;

    connection
        .execute(
            "INSERT INTO school_sections (name, code) VALUES (?1, ?2)",
            params![name, code],
        )
        .map_err(|e| {
            format!("Cannot create section. Its name or code may already exist. Details: {e}")
        })?;

    Ok(connection.last_insert_rowid())
}


#[tauri::command]
fn get_school_profile(
    app: tauri::AppHandle,
) -> Result<Option<SchoolProfile>, String> {
    let connection = database_connection(&app)?;

    connection
        .query_row(
            "SELECT school_name, school_address, school_email,
                    school_phone, session, term
             FROM school_profile WHERE id = 1",
            [],
            |row| {
                Ok(SchoolProfile {
                    school_name: row.get(0)?,
                    school_address: row.get(1)?,
                    school_email: row.get(2)?,
                    school_phone: row.get(3)?,
                    session: row.get(4)?,
                    term: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Cannot read school profile: {e}"))
}

#[tauri::command]
fn save_school_profile(
    app: tauri::AppHandle,
    profile: SchoolProfile,
) -> Result<(), String> {
    let connection = database_connection(&app)?;

    connection
        .execute(
            "INSERT INTO school_profile
                (id, school_name, school_address, school_email,
                 school_phone, session, term)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                school_name = excluded.school_name,
                school_address = excluded.school_address,
                school_email = excluded.school_email,
                school_phone = excluded.school_phone,
                session = excluded.session,
                term = excluded.term",
            params![
                profile.school_name.trim(),
                profile.school_address.trim(),
                profile.school_email.trim(),
                profile.school_phone.trim(),
                profile.session.trim(),
                profile.term.trim()
            ],
        )
        .map_err(|e| format!("Cannot save school profile: {e}"))?;

    Ok(())
}

#[tauri::command]
fn get_classes(app: tauri::AppHandle) -> Result<Vec<SchoolClass>, String> {
    let connection = database_connection(&app)?;

    let mut statement = connection
        .prepare(
            "SELECT c.id, c.name, c.sort_order, c.section_id, s.name, s.code
             FROM school_classes c
             LEFT JOIN school_sections s ON s.id = c.section_id
             ORDER BY c.sort_order, c.name"
        )
        .map_err(|e| format!("Cannot prepare class query: {e}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(SchoolClass {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                section_id: row.get(3)?,
                section_name: row.get(4)?,
                section_code: row.get(5)?,
            })
        })
        .map_err(|e| format!("Cannot read classes: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Cannot read classes: {e}"))
}

#[tauri::command]
fn create_class(
    app: tauri::AppHandle,
    name: String,
    sort_order: Option<i64>,
) -> Result<i64, String> {
    let name = clean_name(name, "Class name")?;
    let connection = database_connection(&app)?;

    connection
        .execute(
            "INSERT INTO school_classes (name, sort_order) VALUES (?1, ?2)",
            params![name, sort_order.unwrap_or(0)],
        )
        .map_err(|e| format!("Cannot create class. It may already exist. Details: {e}"))?;

    Ok(connection.last_insert_rowid())
}

#[tauri::command]
fn rename_class(
    app: tauri::AppHandle,
    id: i64,
    name: String,
    sort_order: Option<i64>,
) -> Result<(), String> {
    let name = clean_name(name, "Class name")?;
    let connection = database_connection(&app)?;

    let changed = connection
        .execute(
            "UPDATE school_classes
             SET name = ?1, sort_order = COALESCE(?2, sort_order)
             WHERE id = ?3",
            params![name, sort_order, id],
        )
        .map_err(|e| format!("Cannot update class. The name may already exist. Details: {e}"))?;

    if changed == 0 {
        return Err("Class not found.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn delete_class(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let connection = database_connection(&app)?;

    let changed = connection
        .execute("DELETE FROM school_classes WHERE id = ?1", params![id])
        .map_err(|e| format!("Cannot delete class: {e}"))?;

    if changed == 0 {
        return Err("Class not found.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn get_subjects(app: tauri::AppHandle) -> Result<Vec<Subject>, String> {
    let connection = database_connection(&app)?;
    let mut statement = connection
        .prepare("SELECT id, name FROM subjects ORDER BY name COLLATE NOCASE")
        .map_err(|e| format!("Cannot prepare subject query: {e}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(Subject {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| format!("Cannot read subjects: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Cannot read subjects: {e}"))
}

#[tauri::command]
fn create_subject(
    app: tauri::AppHandle,
    name: String,
) -> Result<i64, String> {
    let name = clean_name(name, "Subject name")?;
    let connection = database_connection(&app)?;

    connection
        .execute("INSERT INTO subjects (name) VALUES (?1)", params![name])
        .map_err(|e| format!("Cannot create subject. It may already exist. Details: {e}"))?;

    Ok(connection.last_insert_rowid())
}

#[tauri::command]
fn rename_subject(
    app: tauri::AppHandle,
    id: i64,
    name: String,
) -> Result<(), String> {
    let name = clean_name(name, "Subject name")?;
    let connection = database_connection(&app)?;

    let changed = connection
        .execute(
            "UPDATE subjects SET name = ?1 WHERE id = ?2",
            params![name, id],
        )
        .map_err(|e| format!("Cannot update subject. The name may already exist. Details: {e}"))?;

    if changed == 0 {
        return Err("Subject not found.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn delete_subject(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let connection = database_connection(&app)?;

    let changed = connection
        .execute("DELETE FROM subjects WHERE id = ?1", params![id])
        .map_err(|e| format!("Cannot delete subject: {e}"))?;

    if changed == 0 {
        return Err("Subject not found.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn get_class_subjects(
    app: tauri::AppHandle,
    class_id: i64,
) -> Result<Vec<ClassSubject>, String> {
    let connection = database_connection(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT cs.id, cs.class_id, cs.subject_id, c.name, s.name
             FROM class_subjects cs
             JOIN school_classes c ON c.id = cs.class_id
             JOIN subjects s ON s.id = cs.subject_id
             WHERE cs.class_id = ?1
             ORDER BY s.name COLLATE NOCASE",
        )
        .map_err(|e| format!("Cannot prepare class-subject query: {e}"))?;

    let rows = statement
        .query_map(params![class_id], |row| {
            Ok(ClassSubject {
                id: row.get(0)?,
                class_id: row.get(1)?,
                subject_id: row.get(2)?,
                class_name: row.get(3)?,
                subject_name: row.get(4)?,
            })
        })
        .map_err(|e| format!("Cannot read class subjects: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Cannot read class subjects: {e}"))
}

#[tauri::command]
fn assign_subject_to_class(
    app: tauri::AppHandle,
    class_id: i64,
    subject_id: i64,
) -> Result<(), String> {
    let connection = database_connection(&app)?;

    connection
        .execute(
            "INSERT INTO class_subjects (class_id, subject_id)
             VALUES (?1, ?2)",
            params![class_id, subject_id],
        )
        .map_err(|e| format!("Cannot assign subject. Check that the class and subject exist and that the assignment is not duplicated. Details: {e}"))?;

    Ok(())
}

#[tauri::command]
fn remove_class_subject(
    app: tauri::AppHandle,
    id: i64,
) -> Result<(), String> {
    let connection = database_connection(&app)?;

    let changed = connection
        .execute("DELETE FROM class_subjects WHERE id = ?1", params![id])
        .map_err(|e| format!("Cannot remove subject assignment: {e}"))?;

    if changed == 0 {
        return Err("Subject assignment not found.".to_string());
    }

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Student {
    id: i64,
    student_id: String,
    first_name: String,
    middle_name: String,
    last_name: String,
    gender: String,
    class_id: i64,
    class_name: String,
    admission_date: String,
}

#[tauri::command]
fn get_students(app: tauri::AppHandle) -> Result<Vec<Student>, String> {
    let connection = database_connection(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT s.id, s.student_id, s.first_name, s.middle_name,
                    s.last_name, s.gender, s.class_id, c.name, s.admission_date
             FROM students s
             JOIN school_classes c ON c.id = s.class_id
             ORDER BY s.last_name COLLATE NOCASE, s.first_name COLLATE NOCASE"
        )
        .map_err(|e| format!("Cannot prepare student query: {e}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(Student {
                id: row.get(0)?,
                student_id: row.get(1)?,
                first_name: row.get(2)?,
                middle_name: row.get(3)?,
                last_name: row.get(4)?,
                gender: row.get(5)?,
                class_id: row.get(6)?,
                class_name: row.get(7)?,
                admission_date: row.get(8)?,
            })
        })
        .map_err(|e| format!("Cannot query students: {e}"))?;

    let mut students = Vec::new();
    for row in rows {
        students.push(row.map_err(|e| format!("Cannot read student: {e}"))?);
    }

    Ok(students)
}

#[tauri::command]
fn create_student(
    app: tauri::AppHandle,
    student_id: String,
    first_name: String,
    middle_name: Option<String>,
    last_name: String,
    gender: String,
    class_id: i64,
    admission_date: String,
) -> Result<i64, String> {
    let student_id = clean_name(student_id, "Student ID")?;
    let first_name = clean_name(first_name, "First name")?;
    let last_name = clean_name(last_name, "Last name")?;
    let middle_name = middle_name.unwrap_or_default().trim().to_string();
    let gender = gender.trim().to_string();
    let admission_date = admission_date.trim().to_string();

    if student_id.len() > 50 {
        return Err("Student ID must not exceed 50 characters.".to_string());
    }

    if middle_name.chars().count() > 100 {
        return Err("Middle name must not exceed 100 characters.".to_string());
    }

    if !matches!(gender.as_str(), "Male" | "Female") {
        return Err("Gender must be Male or Female.".to_string());
    }

    if admission_date.len() > 10 {
        return Err("Admission date must use YYYY-MM-DD format.".to_string());
    }

    let connection = database_connection(&app)?;

    let class_exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM school_classes WHERE id = ?1)",
            params![class_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Cannot validate class: {e}"))?;

    if !class_exists {
        return Err("Please select a valid class.".to_string());
    }

    connection
        .execute(
            "INSERT INTO students
                (student_id, first_name, middle_name, last_name, gender, class_id, admission_date)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                student_id,
                first_name,
                middle_name,
                last_name,
                gender,
                class_id,
                admission_date
            ],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE constraint failed") {
                "That student ID already exists. Please use a unique student ID.".to_string()
            } else {
                format!("Cannot register student: {e}")
            }
        })?;

    Ok(connection.last_insert_rowid())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StudentImportRow {
    first_name: String,
    middle_name: Option<String>,
    last_name: String,
    gender: String,
    class_id: i64,
    section_code: String,
    admission_date: Option<String>,
    admission_number: Option<String>,
    date_of_birth: Option<String>,
    guardian_phone: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StudentImportResult {
    created_count: usize,
    student_ids: Vec<String>,
}

#[tauri::command]
fn import_students(
    app: tauri::AppHandle,
    school_name: String,
    id_year: String,
    students: Vec<StudentImportRow>,
) -> Result<StudentImportResult, String> {
    if students.is_empty() {
        return Err("There are no students to import.".to_string());
    }
    if students.len() > 2000 {
        return Err("Import is limited to 2,000 students at a time.".to_string());
    }
    let school_name = clean_name(school_name, "School name")?;
    let id_year = id_year.trim().to_string();
    if id_year.len() != 4 || !id_year.chars().all(|c| c.is_ascii_digit()) {
        return Err("The ID year must contain four digits.".to_string());
    }
    let school_code = school_name
        .split(|c: char| !c.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.chars().next())
        .take(5)
        .collect::<String>()
        .to_uppercase();
    if school_code.is_empty() {
        return Err("Cannot create an abbreviation from the school name.".to_string());
    }

    let connection = database_connection(&app)?;
    let mut prepared = Vec::with_capacity(students.len());
    let mut names_seen = std::collections::HashSet::new();
    let mut admission_numbers_seen = std::collections::HashSet::new();

    for row in students {
        let first_name = clean_name(row.first_name, "First name")?;
        let last_name = clean_name(row.last_name, "Last name")?;
        let middle_name = row.middle_name.unwrap_or_default().trim().to_string();
        let gender = row.gender.trim().to_string();
        let section_code = row.section_code.trim().to_uppercase();
        let admission_date = row.admission_date.unwrap_or_default().trim().to_string();
        let admission_number = row.admission_number.unwrap_or_default().trim().to_string();
        let date_of_birth = row.date_of_birth.unwrap_or_default().trim().to_string();
        let guardian_phone = row.guardian_phone.unwrap_or_default().trim().to_string();

        if !matches!(gender.as_str(), "Male" | "Female") {
            return Err(format!("Invalid gender for {first_name} {last_name}. Use Male or Female."));
        }
        if middle_name.chars().count() > 100 || admission_number.chars().count() > 100
            || guardian_phone.chars().count() > 50 {
            return Err(format!("One or more fields are too long for {first_name} {last_name}."));
        }
        if !admission_date.is_empty() && (admission_date.len() != 10 || !admission_date.chars().all(|c| c.is_ascii_digit() || c == '-')) {
            return Err(format!("Invalid admission date for {first_name} {last_name}; use YYYY-MM-DD."));
        }
        if !date_of_birth.is_empty() && (date_of_birth.len() != 10 || !date_of_birth.chars().all(|c| c.is_ascii_digit() || c == '-')) {
            return Err(format!("Invalid date of birth for {first_name} {last_name}; use YYYY-MM-DD."));
        }
        let class_section: Option<String> = connection.query_row(
            "SELECT ss.code FROM school_classes c JOIN school_sections ss ON ss.id = c.section_id WHERE c.id = ?1",
            params![row.class_id],
            |dbrow| dbrow.get(0),
        ).optional().map_err(|e| format!("Cannot validate class for {first_name} {last_name}: {e}"))?;
        let actual_code = class_section.ok_or_else(|| format!("The selected class for {first_name} {last_name} has no section assigned."))?;
        if actual_code.to_uppercase() != section_code {
            return Err(format!("Section mismatch for {first_name} {last_name}. The selected class belongs to {actual_code}, not {section_code}."));
        }

        let normalized_name = format!("{}|{}|{}|{}", first_name.to_lowercase(), middle_name.to_lowercase(), last_name.to_lowercase(), row.class_id);
        if !names_seen.insert(normalized_name) {
            return Err(format!("The import file contains a duplicate student name in the same class: {first_name} {last_name}."));
        }
        if !admission_number.is_empty() && !admission_numbers_seen.insert(admission_number.to_lowercase()) {
            return Err(format!("The import file repeats admission number {admission_number}."));
        }
        prepared.push((first_name, middle_name, last_name, gender, row.class_id, section_code, admission_date, admission_number, date_of_birth, guardian_phone));
    }

    let transaction = connection.unchecked_transaction()
        .map_err(|e| format!("Cannot start student import transaction: {e}"))?;
    for (first_name, middle_name, last_name, gender, class_id, section_code, admission_date, admission_number, date_of_birth, guardian_phone) in &prepared {
        let existing_name: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM students WHERE lower(first_name) = lower(?1) AND lower(middle_name) = lower(?2) AND lower(last_name) = lower(?3) AND class_id = ?4)",
            params![first_name, middle_name, last_name, class_id],
            |row| row.get(0),
        ).map_err(|e| format!("Cannot check existing student {first_name} {last_name}: {e}"))?;
        if existing_name {
            return Err(format!("A student named {first_name} {last_name} already exists in this class. No students were imported."));
        }
        if !admission_number.is_empty() {
            let existing_admission: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM students WHERE lower(admission_number) = lower(?1))",
                params![admission_number],
                |row| row.get(0),
            ).map_err(|e| format!("Cannot check admission number: {e}"))?;
            if existing_admission {
                return Err(format!("Admission number {admission_number} already exists. No students were imported."));
            }
        }
    }

    let mut generated_ids = Vec::with_capacity(prepared.len());
    for (first_name, middle_name, last_name, gender, class_id, section_code, admission_date, admission_number, date_of_birth, guardian_phone) in &prepared {
        let mut generated_id = String::new();
        for _ in 0..100 {
            let random_number: i64 = transaction.query_row("SELECT abs(random() % 10000)", [], |row| row.get(0))
                .map_err(|e| format!("Cannot generate a student ID: {e}"))?;
            let id_section_code = if section_code == "SS" { "SSS" } else { section_code.as_str() };
            let candidate = format!("{school_code}-{id_year}-{id_section_code}-{random_number:04}");
            let used: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM students WHERE student_id = ?1)",
                params![candidate],
                |row| row.get(0),
            ).map_err(|e| format!("Cannot check generated student ID: {e}"))?;
            if !used && !generated_ids.iter().any(|id| id == &candidate) {
                generated_id = candidate;
                break;
            }
        }
        if generated_id.is_empty() {
            return Err(format!("Could not find an unused ID for {first_name} {last_name}. No students were imported."));
        }
        transaction.execute(
            "INSERT INTO students (student_id, first_name, middle_name, last_name, gender, class_id, admission_date, admission_number, date_of_birth, guardian_phone)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![generated_id, first_name, middle_name, last_name, gender, class_id, admission_date, admission_number, date_of_birth, guardian_phone],
        ).map_err(|e| format!("Cannot import {first_name} {last_name}; no students were imported: {e}"))?;
        generated_ids.push(generated_id);
    }
    transaction.commit().map_err(|e| format!("Cannot finish student import: {e}"))?;
    Ok(StudentImportResult { created_count: generated_ids.len(), student_ids: generated_ids })
}

#[tauri::command]
fn delete_student(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let connection = database_connection(&app)?;

    let changed = connection
        .execute("DELETE FROM students WHERE id = ?1", params![id])
        .map_err(|e| format!("Cannot delete student: {e}"))?;

    if changed == 0 {
        return Err("Student not found.".to_string());
    }

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClassResultRow {
    student_id: i64,
    student_code: String,
    student_name: String,
    subject_id: Option<i64>,
    subject_name: Option<String>,
    score_total: f64,
    max_total: f64,
    assessment_count: i64,
}

#[tauri::command]
fn get_class_results(
    app: tauri::AppHandle,
    class_id: i64,
    session: String,
    term: String,
) -> Result<Vec<ClassResultRow>, String> {
    let connection = database_connection(&app)?;
    let mut statement = connection.prepare(
        "SELECT s.id, s.student_id,
                trim(s.first_name || ' ' || s.middle_name || ' ' || s.last_name),
                sub.id, sub.name,
                COALESCE(SUM(m.score), 0),
                COALESCE(SUM(m.max_score), 0),
                COUNT(m.id)
         FROM students s
         LEFT JOIN class_subjects cs ON cs.class_id = s.class_id
         LEFT JOIN subjects sub ON sub.id = cs.subject_id
         LEFT JOIN mark_entries m
           ON m.student_id = s.id
          AND m.subject_id = sub.id
          AND m.session = ?2
          AND m.term = ?3
         WHERE s.class_id = ?1
         GROUP BY s.id, s.student_id, s.first_name, s.middle_name, s.last_name,
                  sub.id, sub.name
         ORDER BY s.last_name COLLATE NOCASE, s.first_name COLLATE NOCASE, s.student_id,
                  sub.name COLLATE NOCASE"
    ).map_err(|e| format!("Cannot prepare results query: {e}"))?;
    let rows = statement.query_map(
        params![class_id, session.trim(), term.trim()],
        |row| Ok(ClassResultRow {
            student_id: row.get(0)?,
            student_code: row.get(1)?,
            student_name: row.get(2)?,
            subject_id: row.get(3)?,
            subject_name: row.get(4)?,
            score_total: row.get(5)?,
            max_total: row.get(6)?,
            assessment_count: row.get(7)?,
        }),
    ).map_err(|e| format!("Cannot query class results: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Cannot read class results: {e}"))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkEntryRow {
    student_id: i64,
    student_code: String,
    student_name: String,
    score: Option<f64>,
    max_score: Option<f64>,
}

#[tauri::command]
fn get_mark_entries(
    app: tauri::AppHandle,
    class_id: i64,
    subject_id: i64,
    session: String,
    term: String,
    assessment_name: String,
) -> Result<Vec<MarkEntryRow>, String> {
    let connection = database_connection(&app)?;
    let assigned: bool = connection.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM class_subjects
            WHERE class_id = ?1 AND subject_id = ?2
         )",
        params![class_id, subject_id],
        |row| row.get(0),
    ).map_err(|e| format!("Cannot validate class subject assignment: {e}"))?;
    if !assigned {
        return Err("This subject is not assigned to the selected class. Assign it in Classes & Subjects first.".to_string());
    }
    let mut statement = connection.prepare(
        "SELECT s.id, s.student_id,
                trim(s.first_name || ' ' || s.middle_name || ' ' || s.last_name),
                m.score, m.max_score
         FROM students s
         LEFT JOIN mark_entries m
           ON m.student_id = s.id
          AND m.subject_id = ?2
          AND m.session = ?3
          AND m.term = ?4
          AND m.assessment_name = ?5
         WHERE s.class_id = ?1
         ORDER BY s.last_name COLLATE NOCASE, s.first_name COLLATE NOCASE, s.student_id"
    ).map_err(|e| format!("Cannot prepare marks query: {e}"))?;
    let rows = statement.query_map(
        params![class_id, subject_id, session.trim(), term.trim(), assessment_name.trim()],
        |row| Ok(MarkEntryRow {
            student_id: row.get(0)?,
            student_code: row.get(1)?,
            student_name: row.get(2)?,
            score: row.get(3)?,
            max_score: row.get(4)?,
        }),
    ).map_err(|e| format!("Cannot query marks: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Cannot read marks: {e}"))
}

#[tauri::command]
fn save_mark_entry(
    app: tauri::AppHandle,
    student_id: i64,
    subject_id: i64,
    session: String,
    term: String,
    assessment_name: String,
    score: f64,
    max_score: f64,
) -> Result<(), String> {
    let session = clean_name(session, "Academic session")?;
    let term = clean_name(term, "Term")?;
    let assessment_name = clean_name(assessment_name, "Assessment name")?;
    if !score.is_finite() || !max_score.is_finite() || max_score <= 0.0 || score < 0.0 || score > max_score {
        return Err("Score must be between zero and the maximum score, and the maximum must be greater than zero.".to_string());
    }
    let connection = database_connection(&app)?;
    let valid_student: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM students WHERE id = ?1)", params![student_id], |row| row.get(0)
    ).map_err(|e| format!("Cannot validate student: {e}"))?;
    if !valid_student { return Err("Student record not found.".to_string()); }
    let valid_subject_for_student: bool = connection.query_row(
        "SELECT EXISTS(
            SELECT 1
            FROM students s
            JOIN class_subjects cs ON cs.class_id = s.class_id
            WHERE s.id = ?1 AND cs.subject_id = ?2
         )",
        params![student_id, subject_id],
        |row| row.get(0),
    ).map_err(|e| format!("Cannot validate subject for student: {e}"))?;
    if !valid_subject_for_student {
        return Err("This subject is not assigned to the student's class. No mark was saved.".to_string());
    }
    connection.execute(
        "INSERT INTO mark_entries
            (student_id, subject_id, session, term, assessment_name, score, max_score, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
         ON CONFLICT(student_id, subject_id, session, term, assessment_name)
         DO UPDATE SET score = excluded.score, max_score = excluded.max_score,
                       updated_at = CURRENT_TIMESTAMP",
        params![student_id, subject_id, session, term, assessment_name, score, max_score],
    ).map_err(|e| format!("Cannot save mark: {e}"))?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportCardRemarks {
    teacher_remark: String,
    principal_remark: String,
}

#[tauri::command]
fn get_report_card_remarks(
    app: tauri::AppHandle,
    student_id: i64,
    session: String,
    term: String,
) -> Result<ReportCardRemarks, String> {
    let connection = database_connection(&app)?;
    connection.query_row(
        "SELECT teacher_remark, principal_remark
         FROM report_card_remarks
         WHERE student_id = ?1 AND session = ?2 AND term = ?3",
        params![student_id, session.trim(), term.trim()],
        |row| Ok(ReportCardRemarks {
            teacher_remark: row.get(0)?,
            principal_remark: row.get(1)?,
        }),
    ).optional()
     .map_err(|e| format!("Cannot load report-card remarks: {e}"))
     .map(|remarks| remarks.unwrap_or(ReportCardRemarks {
         teacher_remark: String::new(),
         principal_remark: String::new(),
     }))
}

#[tauri::command]
fn save_report_card_remarks(
    app: tauri::AppHandle,
    student_id: i64,
    session: String,
    term: String,
    teacher_remark: String,
    principal_remark: String,
) -> Result<(), String> {
    let session = clean_name(session, "Academic session")?;
    let term = clean_name(term, "Term")?;
    if teacher_remark.chars().count() > 500 || principal_remark.chars().count() > 500 {
        return Err("Each report-card remark must be 500 characters or fewer.".to_string());
    }
    let connection = database_connection(&app)?;
    let student_exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM students WHERE id = ?1)",
        params![student_id],
        |row| row.get(0),
    ).map_err(|e| format!("Cannot validate student: {e}"))?;
    if !student_exists {
        return Err("Student record not found.".to_string());
    }
    connection.execute(
        "INSERT INTO report_card_remarks
            (student_id, session, term, teacher_remark, principal_remark, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
         ON CONFLICT(student_id, session, term)
         DO UPDATE SET teacher_remark = excluded.teacher_remark,
                       principal_remark = excluded.principal_remark,
                       updated_at = CURRENT_TIMESTAMP",
        params![student_id, session, term, teacher_remark.trim(), principal_remark.trim()],
    ).map_err(|e| format!("Cannot save report-card remarks: {e}"))?;
    Ok(())
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GradeRemarkRule {
    minimum_score: f64,
    grade_label: String,
    teacher_remark: String,
    principal_remark: String,
    sort_order: i64,
}

#[tauri::command]
fn get_grade_remark_rules(app: tauri::AppHandle) -> Result<Vec<GradeRemarkRule>, String> {
    let connection = database_connection(&app)?;
    let mut statement = connection.prepare(
        "SELECT minimum_score, grade_label, teacher_remark, principal_remark, sort_order
         FROM grade_remark_rules ORDER BY minimum_score DESC"
    ).map_err(|e| format!("Cannot prepare grading settings query: {e}"))?;
    let rows = statement.query_map([], |row| Ok(GradeRemarkRule {
        minimum_score: row.get(0)?,
        grade_label: row.get(1)?,
        teacher_remark: row.get(2)?,
        principal_remark: row.get(3)?,
        sort_order: row.get(4)?,
    })).map_err(|e| format!("Cannot read grading settings: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Cannot read grading settings: {e}"))
}

#[tauri::command]
fn save_grade_remark_rules(app: tauri::AppHandle, rules: Vec<GradeRemarkRule>) -> Result<(), String> {
    if rules.is_empty() || rules.len() > 20 {
        return Err("Provide between 1 and 20 grading rules.".to_string());
    }
    let mut thresholds = std::collections::HashSet::new();
    for rule in &rules {
        if !rule.minimum_score.is_finite() || !(0.0..=100.0).contains(&rule.minimum_score) {
            return Err("Each minimum score must be between 0 and 100.".to_string());
        }
        if !thresholds.insert((rule.minimum_score * 100.0).round() as i64) {
            return Err("Each grading threshold must be unique.".to_string());
        }
        if rule.grade_label.trim().is_empty() || rule.grade_label.chars().count() > 10 {
            return Err("Each grade label must contain 1 to 10 characters.".to_string());
        }
        if rule.teacher_remark.chars().count() > 500 || rule.principal_remark.chars().count() > 500 {
            return Err("Each automatic remark must be 500 characters or fewer.".to_string());
        }
    }
    if !rules.iter().any(|rule| rule.minimum_score == 0.0) {
        return Err("Include a rule starting at 0% so every result has a grade and remark.".to_string());
    }
    let mut connection = database_connection(&app)?;
    let transaction = connection.transaction().map_err(|e| format!("Cannot start grading settings update: {e}"))?;
    transaction.execute("DELETE FROM grade_remark_rules", []).map_err(|e| format!("Cannot replace grading settings: {e}"))?;
    for (index, rule) in rules.iter().enumerate() {
        transaction.execute(
            "INSERT INTO grade_remark_rules (minimum_score, grade_label, teacher_remark, principal_remark, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![rule.minimum_score, rule.grade_label.trim(), rule.teacher_remark.trim(), rule.principal_remark.trim(), index as i64 + 1],
        ).map_err(|e| format!("Cannot save grading rule: {e}"))?;
    }
    transaction.commit().map_err(|e| format!("Cannot finish grading settings update: {e}"))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PositionRemarkRule {
    position_key: String,
    position_label: String,
    remark: String,
}

#[tauri::command]
fn get_position_remark_rules(app: tauri::AppHandle) -> Result<Vec<PositionRemarkRule>, String> {
    let connection = database_connection(&app)?;
    let mut statement = connection.prepare(
        "SELECT position_key, position_label, remark FROM position_remark_rules
         ORDER BY CASE position_key WHEN 'first' THEN 1 WHEN 'second' THEN 2 WHEN 'third' THEN 3 ELSE 4 END"
    ).map_err(|e| format!("Cannot prepare position remark settings query: {e}"))?;
    let rows = statement.query_map([], |row| Ok(PositionRemarkRule {
        position_key: row.get(0)?,
        position_label: row.get(1)?,
        remark: row.get(2)?,
    })).map_err(|e| format!("Cannot read position remark settings: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Cannot read position remark settings: {e}"))
}

#[tauri::command]
fn save_position_remark_rules(app: tauri::AppHandle, rules: Vec<PositionRemarkRule>) -> Result<(), String> {
    if rules.len() != 4 {
        return Err("Provide remarks for 1st, 2nd, 3rd, and 4th position and below.".to_string());
    }
    let required = ["first", "second", "third", "other"];
    for key in required {
        if rules.iter().filter(|rule| rule.position_key == key).count() != 1 {
            return Err("Each position category must appear exactly once.".to_string());
        }
    }
    for rule in &rules {
        if rule.position_label.trim().is_empty() || rule.position_label.chars().count() > 80 {
            return Err("Position labels must contain 1 to 80 characters.".to_string());
        }
        if rule.remark.chars().count() > 500 {
            return Err("Each position remark must be 500 characters or fewer.".to_string());
        }
    }
    let mut connection = database_connection(&app)?;
    let transaction = connection.transaction().map_err(|e| format!("Cannot start position remark update: {e}"))?;
    for rule in &rules {
        transaction.execute(
            "UPDATE position_remark_rules SET position_label = ?1, remark = ?2 WHERE position_key = ?3",
            params![rule.position_label.trim(), rule.remark.trim(), rule.position_key],
        ).map_err(|e| format!("Cannot save position remark: {e}"))?;
    }
    transaction.commit().map_err(|e| format!("Cannot finish position remark update: {e}"))?;
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_school_profile,
            save_school_profile,
            get_school_sections,
            create_school_section,
            get_classes,
            assign_class_section,
            create_class,
            rename_class,
            delete_class,
            get_subjects,
            create_subject,
            rename_subject,
            delete_subject,
            get_class_subjects,
            assign_subject_to_class,
            remove_class_subject,
            get_mark_entries,
            save_mark_entry,
            get_class_results,
            get_grade_remark_rules,
            save_grade_remark_rules,
            get_position_remark_rules,
            save_position_remark_rules,
            get_report_card_remarks,
            save_report_card_remarks,
            get_students,
            create_student,
            import_students,
            extract_student_pdf_text,
            delete_student
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}





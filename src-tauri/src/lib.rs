use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::Manager;

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Exam {
    id: i64,
    name: String,
    session: String,
    term: String,
    exam_date: String,
    class_id: i64,
    class_name: String,
    subject_id: i64,
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
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(class_id) REFERENCES school_classes(id)
                    ON DELETE RESTRICT
             );

             CREATE INDEX IF NOT EXISTS idx_students_class
                ON students(class_id);",
        )
        .map_err(|e| format!("Cannot initialize local database: {e}"))?;

    // Examination records are scoped to the configured academic calendar and
    // to subjects already assigned to the selected class.
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            session TEXT NOT NULL,
            term TEXT NOT NULL,
            exam_date TEXT NOT NULL DEFAULT '',
            class_id INTEGER NOT NULL,
            subject_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name COLLATE NOCASE, session, term, class_id, subject_id),
            FOREIGN KEY(class_id, subject_id)
                REFERENCES class_subjects(class_id, subject_id)
                ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_exams_class_subject
            ON exams(class_id, subject_id);"
    ).map_err(|e| format!("Cannot initialize examination tables: {e}"))?;

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

#[tauri::command]
fn get_exams(app: tauri::AppHandle) -> Result<Vec<Exam>, String> {
    let connection = database_connection(&app)?;
    let mut statement = connection.prepare(
        "SELECT e.id, e.name, e.session, e.term, e.exam_date,
                e.class_id, c.name, e.subject_id, s.name
         FROM exams e
         JOIN school_classes c ON c.id = e.class_id
         JOIN subjects s ON s.id = e.subject_id
         ORDER BY e.session DESC, e.term, e.name COLLATE NOCASE, c.name, s.name"
    ).map_err(|e| format!("Cannot prepare examination query: {e}"))?;

    let rows = statement.query_map([], |row| {
        Ok(Exam {
            id: row.get(0)?,
            name: row.get(1)?,
            session: row.get(2)?,
            term: row.get(3)?,
            exam_date: row.get(4)?,
            class_id: row.get(5)?,
            class_name: row.get(6)?,
            subject_id: row.get(7)?,
            subject_name: row.get(8)?,
        })
    }).map_err(|e| format!("Cannot read examinations: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Cannot read examination records: {e}"))
}

#[tauri::command]
fn create_exam(
    app: tauri::AppHandle,
    name: String,
    session: String,
    term: String,
    exam_date: String,
    class_id: i64,
    subject_id: i64,
) -> Result<i64, String> {
    let name = clean_name(name, "Examination name")?;
    let session = clean_name(session, "Academic session")?;
    let term = clean_name(term, "Term")?;
    let exam_date = exam_date.trim().to_string();

    if exam_date.len() > 10 || (!exam_date.is_empty() && exam_date.len() != 10) {
        return Err("Examination date must use YYYY-MM-DD format.".to_string());
    }
    if !matches!(term.as_str(), "First Term" | "Second Term" | "Third Term") {
        return Err("Select a valid academic term in School Setup.".to_string());
    }

    let connection = database_connection(&app)?;
    let assignment_exists: bool = connection.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM class_subjects
            WHERE class_id = ?1 AND subject_id = ?2
        )",
        params![class_id, subject_id],
        |row| row.get(0),
    ).map_err(|e| format!("Cannot validate class and subject: {e}"))?;

    if !assignment_exists {
        return Err("The selected subject is not assigned to this class.".to_string());
    }

    connection.execute(
        "INSERT INTO exams (name, session, term, exam_date, class_id, subject_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![name, session, term, exam_date, class_id, subject_id],
    ).map_err(|e| {
        if e.to_string().contains("UNIQUE constraint failed") {
            "An examination with this name already exists for this class, subject, session, and term.".to_string()
        } else {
            format!("Cannot create examination: {e}")
        }
    })?;

    Ok(connection.last_insert_rowid())
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
            get_students,
            create_student,
            delete_student,
            get_exams,
            create_exam
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}





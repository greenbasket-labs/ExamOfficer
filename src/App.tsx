import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type Page =
  | "Dashboard"
  | "School Setup"
  | "Students"
  | "Classes & Subjects"
  | "Marks Entry"
  | "Results & Reports"
  | "Settings";

const navigation: { label: Page; icon: string; group: string }[] = [
  { label: "Dashboard", icon: "â–¦", group: "WORKSPACE" },
  { label: "School Setup", icon: "âŒ‚", group: "SCHOOL MANAGEMENT" },
  { label: "Students", icon: "â™™", group: "SCHOOL MANAGEMENT" },
  { label: "Classes & Subjects", icon: "â–¤", group: "SCHOOL MANAGEMENT" },
  { label: "Marks Entry", icon: "âœŽ", group: "EXAMINATIONS" },
  { label: "Results & Reports", icon: "â–¥", group: "EXAMINATIONS" },
  { label: "Settings", icon: "âš™", group: "SYSTEM" },
];

type SchoolProfile = {
  schoolName: string;
  schoolAddress: string;
  schoolEmail: string;
  schoolPhone: string;
  session: string;
  term: string;
};

type SchoolSection = {
  id: number;
  name: string;
  code: string;
};

type SchoolClass = {
  id: number;
  name: string;
  sortOrder: number;
  sectionId: number | null;
  sectionName: string | null;
  sectionCode: string | null;
};

type Subject = {
  id: number;
  name: string;
};

type ClassSubject = {
  id: number;
  classId: number;
  subjectId: number;
  className: string;
  subjectName: string;
};

type Student = {
  id: number;
  studentId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  classId: number;
  className: string;
  admissionDate: string;
};

function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [schoolPhone, setSchoolPhone] = useState("");
  const [session, setSession] = useState("2026/2027");
  const [term, setTerm] = useState("First Term");
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState("");

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<SchoolSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | "">("");
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionCode, setNewSectionCode] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [newClassName, setNewClassName] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [academicError, setAcademicError] = useState("");
  const [academicMessage, setAcademicMessage] = useState("");
  const [academicBusy, setAcademicBusy] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [studentIdInput, setStudentIdInput] = useState("");
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentMiddleName, setStudentMiddleName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [studentGender, setStudentGender] = useState("Male");
  const [studentClassId, setStudentClassId] = useState<number | "">("");
  const [studentAdmissionDate, setStudentAdmissionDate] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentError, setStudentError] = useState("");
  const [studentMessage, setStudentMessage] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);

  // Keep a class selected whenever classes are available.
  useEffect(() => {
    if (selectedClassId === null && classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  useEffect(() => {
    let active = true;

    async function loadSchoolProfile() {
      try {
        const profile = await invoke<SchoolProfile | null>("get_school_profile");

        if (!active || !profile) return;

        setSchoolName(profile.schoolName);
        setSchoolAddress(profile.schoolAddress);
        setSchoolEmail(profile.schoolEmail);
        setSchoolPhone(profile.schoolPhone);
        setSession(profile.session || "2026/2027");
        setTerm(profile.term || "First Term");
        setStorageError("");
      } catch (error) {
        if (active) {
          setStorageError(`Could not load school profile: ${String(error)}`);
        }
      }
    }

    void loadSchoolProfile();

    return () => {
      active = false;
    };
  }, []);

  const loadClasses = async () => {
    const result = await invoke<SchoolClass[]>("get_classes");
    setClasses(result);
    return result;
  };

  const loadStudents = async () => {
    const result = await invoke<Student[]>("get_students");
    setStudents(result);
    return result;
  };
  
  const loadSections = async () => {
  const result = await invoke<SchoolSection[]>("get_school_sections");
  setSections(result);
  return result;
};
  const registerStudent = async () => {
    setStudentError("");
    setStudentMessage("");

    if (
      !studentIdInput.trim() ||
      !studentFirstName.trim() ||
      !studentLastName.trim() ||
      studentClassId === ""
    ) {
      setStudentError("Enter the student ID, first name, last name, and class.");
      return;
    }

    setStudentBusy(true);

    try {
      await invoke<number>("create_student", {
        studentId: studentIdInput.trim(),
        firstName: studentFirstName.trim(),
        middleName: studentMiddleName.trim() || null,
        lastName: studentLastName.trim(),
        gender: studentGender,
        classId: studentClassId,
        admissionDate: studentAdmissionDate,
      });

      await loadStudents();

      setStudentIdInput("");
      setStudentFirstName("");
      setStudentMiddleName("");
      setStudentLastName("");
      setStudentGender("Male");
      setStudentClassId("");
      setStudentAdmissionDate("");
      setStudentMessage("Student registered successfully.");
    } catch (error) {
      setStudentError(String(error));
    } finally {
      setStudentBusy(false);
    }
  };

  const removeStudent = async (id: number) => {
    const confirmed = window.confirm(
      "Delete this student record? This action cannot be undone."
    );

    if (!confirmed) return;

    setStudentError("");
    setStudentMessage("");
    setStudentBusy(true);

    try {
      await invoke("delete_student", { id });
      await loadStudents();
      setStudentMessage("Student record deleted.");
    } catch (error) {
      setStudentError(String(error));
    } finally {
      setStudentBusy(false);
    }
  };
  const loadSubjects = async () => {
    const result = await invoke<Subject[]>("get_subjects");
    setSubjects(result);
    return result;
  };

  const loadClassSubjects = async (classId: number) => {
    const result = await invoke<ClassSubject[]>("get_class_subjects", {
      classId,
    });
    setClassSubjects(result);
    return result;
  };

  const runAcademicAction = async (
    action: () => Promise<void>,
    successMessage: string
  ) => {
    setAcademicBusy(true);
    setAcademicError("");
    setAcademicMessage("");

    try {
      await action();
      setAcademicMessage(successMessage);
    } catch (error) {
      setAcademicError(String(error));
    } finally {
      setAcademicBusy(false);
    }
  };

  const createClass = async () => {
    const name = newClassName.trim();
    if (!name) {
      setAcademicError("Enter a class name first.");
      return;
    }

    await runAcademicAction(async () => {
      await invoke("create_class", {
        name,
        sortOrder: classes.length,
      });
      const updated = await loadClasses();
      setNewClassName("");
      if (updated.length > 0) {
        const created = updated.find(
          (item) => item.name.toLowerCase() === name.toLowerCase()
        );
        if (created) {
          setSelectedClassId(created.id);
          await loadClassSubjects(created.id);
        }
      }
    }, "Class created successfully.");
  };

    const createSection = async () => {
    const name = newSectionName.trim();
    const code = newSectionCode.trim().toUpperCase();

    if (!name || !code) {
      setAcademicError("Enter both a section name and a section code.");
      return;
    }

    if (sections.some((section) =>
      section.name.toLowerCase() === name.toLowerCase() ||
      section.code.toUpperCase() === code
    )) {
      setAcademicError("That section name or code already exists. Choose a different name and code.");
      return;
    }


    await runAcademicAction(async () => {
      await invoke("create_school_section", { name, code });
      const updatedSections = await loadSections();
      setNewSectionName("");
      setNewSectionCode("");
      if (updatedSections.length > 0) {
        setSelectedSectionId(updatedSections[updatedSections.length - 1].id);
      }
    }, "School section created successfully.");
  };

  const assignSectionToClass = async () => {
    if (selectedClassId === null || selectedSectionId === "") {
      setAcademicError("Select a class and a section first.");
      return;
    }

    await runAcademicAction(async () => {
      await invoke("assign_class_section", {
        classId: selectedClassId,
        sectionId: selectedSectionId,
      });
      await loadClasses();
    }, "Section assigned to class successfully.");
  };

  const renameClass = async (item: SchoolClass) => {
    const name = window.prompt("Enter the new class name:", item.name)?.trim();
    if (!name || name === item.name) return;

    await runAcademicAction(async () => {
      await invoke("rename_class", {
        id: item.id,
        name,
        sortOrder: item.sortOrder,
      });
      await loadClasses();
      if (selectedClassId === item.id) {
        await loadClassSubjects(item.id);
      }
    }, "Class renamed successfully.");
  };

  const deleteClass = async (item: SchoolClass) => {
    if (!window.confirm(`Delete class "${item.name}" and its subject assignments?`)) return;

    await runAcademicAction(async () => {
      await invoke("delete_class", { id: item.id });
      const updated = await loadClasses();
      if (selectedClassId === item.id) {
        const nextClass = updated[0];
        setSelectedClassId(nextClass?.id ?? null);
        setClassSubjects(
          nextClass
            ? await loadClassSubjects(nextClass.id)
            : []
        );
      }
    }, "Class deleted successfully.");
  };

  const createSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) {
      setAcademicError("Enter a subject name first.");
      return;
    }

    await runAcademicAction(async () => {
      await invoke("create_subject", { name });
      await loadSubjects();
      setNewSubjectName("");
    }, "Subject created successfully.");
  };

  const renameSubject = async (item: Subject) => {
    const name = window.prompt("Enter the new subject name:", item.name)?.trim();
    if (!name || name === item.name) return;

    await runAcademicAction(async () => {
      await invoke("rename_subject", { id: item.id, name });
      await loadSubjects();
      if (selectedClassId !== null) {
        await loadClassSubjects(selectedClassId);
      }
    }, "Subject renamed successfully.");
  };

  const deleteSubject = async (item: Subject) => {
    if (!window.confirm(`Delete subject "${item.name}" and its class assignments?`)) return;

    await runAcademicAction(async () => {
      await invoke("delete_subject", { id: item.id });
      await loadSubjects();
      if (selectedClassId !== null) {
        await loadClassSubjects(selectedClassId);
      }
    }, "Subject deleted successfully.");
  };

  const assignSubject = async () => {
    if (selectedClassId === null || selectedSubjectId === null) {
      setAcademicError("Select a class and a subject first.");
      return;
    }

    await runAcademicAction(async () => {
      await invoke("assign_subject_to_class", {
        classId: selectedClassId,
        subjectId: selectedSubjectId,
      });
      await loadClassSubjects(selectedClassId);
    }, "Subject assigned to class successfully.");
  };

  const removeSubjectAssignment = async (assignment: ClassSubject) => {
    if (!window.confirm(
      `Remove "${assignment.subjectName}" from "${assignment.className}"?`
    )) return;

    await runAcademicAction(async () => {
      await invoke("remove_class_subject", { id: assignment.id });
      if (selectedClassId !== null) {
        await loadClassSubjects(selectedClassId);
      }
    }, "Subject removed from class.");
  };

  useEffect(() => {
    if (page !== "Classes & Subjects") return;

    let active = true;

    async function loadAcademicData() {
      setAcademicError("");
      setAcademicMessage("");

      try {
        const [loadedClasses, loadedSubjects, loadedSections] = await Promise.all([
          invoke<SchoolClass[]>("get_classes"),
          invoke<Subject[]>("get_subjects"),
          invoke<SchoolSection[]>("get_school_sections"),
        ]);

        if (!active) return;

        setClasses(loadedClasses);
        setSubjects(loadedSubjects);
        setSections(loadedSections);

        const currentClassExists = loadedClasses.some(
          (item) => item.id === selectedClassId
        );

        const classToSelect = currentClassExists
          ? selectedClassId
          : loadedClasses[0]?.id ?? null;

        setSelectedClassId(classToSelect);

        if (classToSelect !== null) {
          const assignments = await invoke<ClassSubject[]>(
            "get_class_subjects",
            { classId: classToSelect }
          );

          if (active) setClassSubjects(assignments);
        } else {
          setClassSubjects([]);
        }
      } catch (error) {
        if (active) setAcademicError(String(error));
      }
    }

    void loadAcademicData();

    return () => {
      active = false;
    };
  }, [page]);

  useEffect(() => {
    if (page !== "Students") return;

    let active = true;

    async function loadStudentData() {
      setStudentError("");
      setStudentMessage("");

      try {
        const [loadedStudents, loadedClasses] = await Promise.all([
          invoke<Student[]>("get_students"),
          invoke<SchoolClass[]>("get_classes"),
        ]);

        if (!active) return;

        setStudents(loadedStudents);
        setClasses(loadedClasses);
      } catch (error) {
        if (active) setStudentError(String(error));
      }
    }

    void loadStudentData();

    return () => {
      active = false;
    };
  }, [page]);
  const choosePage = (next: Page) => {
    setPage(next);
    setSearch("");
  };

  const saveSchool = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setStorageError("");

    try {
      await invoke("save_school_profile", {
        profile: {
          schoolName: schoolName.trim(),
          schoolAddress: schoolAddress.trim(),
          schoolEmail: schoolEmail.trim(),
          schoolPhone: schoolPhone.trim(),
          session: session.trim(),
          term,
        },
      });

      setSchoolName((value) => value.trim());
      setSchoolAddress((value) => value.trim());
      setSchoolEmail((value) => value.trim());
      setSchoolPhone((value) => value.trim());
      setSession((value) => value.trim());
      setSaved(true);
    } catch (error) {
      setStorageError(`Could not save school profile: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };
  const filteredNavigation = navigation.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">EO</div>
          <div className="brand-copy">
            <strong>Exam Officer</strong>
            <span>Examination Management</span>
          </div>
        </div>

        <div className="school-switcher">
          <div className="school-avatar">S</div>
          <div className="school-switcher-copy">
            <span>YOUR SCHOOL</span>
            <strong>{schoolName || "School not configured"}</strong>
          </div>
          <span className="switcher-arrow">âŒ„</span>
        </div>

        <div className="nav-search">
          <span>âŒ•</span>
          <input
            aria-label="Search navigation"
            placeholder="Find a page..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd>/</kbd>
        </div>

        <nav className="navigation" aria-label="Main navigation">
          {filteredNavigation.length === 0 && (
            <p className="no-navigation">No matching pages.</p>
          )}
          {filteredNavigation.map((item, index) => {
            const previous = filteredNavigation[index - 1];
            const showGroup = !previous || previous.group !== item.group;

            return (
              <div key={item.label}>
                {showGroup && <div className="nav-group">{item.group}</div>}
                <button
                  className={`nav-item ${page === item.label ? "active" : ""}`}
                  onClick={() => choosePage(item.label)}
                  type="button"
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {page === item.label && <span className="active-indicator" />}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="offline-status">
            <span className="status-dot" />
            <div>
              <strong>Offline-ready</strong>
              <span>Local-first application</span>
            </div>
          </div>
          <div className="sidebar-version">EXAM OFFICER Â· VERSION 0.1.0</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Exam Officer</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="connection-label">
              <span className="status-dot" /> Local mode
            </span>
            <div className="profile-avatar">EO</div>
          </div>
        </header>

        <div className="page-content">
          {page === "Dashboard" && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow">EXAMINATION WORKSPACE</div>
                  <h1>Good day, Exam Officer</h1>
                  <p className="page-subtitle">
                    Manage your school records, examinations and results from one place.
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => choosePage("School Setup")}
                  type="button"
                >
                  <span>ï¼‹</span> Set up your school
                </button>
              </section>

              {!schoolName && (
                <section className="setup-banner">
                  <div className="banner-icon">âœ¦</div>
                  <div className="banner-copy">
                    <strong>Let's set up your school first</strong>
                    <p>
                      Add your school details and academic calendar before registering
                      students or entering examination marks.
                    </p>
                  </div>
                  <button
                    className="banner-button"
                    onClick={() => choosePage("School Setup")}
                    type="button"
                  >
                    Start setup <span>â†’</span>
                  </button>
                </section>
              )}

              <div className="section-heading">
                <div>
                  <h2>School overview</h2>
                  <p>Your examination workspace at a glance.</p>
                </div>
                <div className="session-chip">
                  <span className="calendar-icon">â–¦</span>
                  {session} <span className="chip-divider">Â·</span> {term}
                </div>
              </div>

              <section className="stats-grid">
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Total students</span>
                    <span className="stat-icon blue">â™™</span>
                  </div>
                  <div className="stat-value">â€”</div>
                  <div className="stat-foot">Student records</div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Classes</span>
                    <span className="stat-icon purple">â–¤</span>
                  </div>
                  <div className="stat-value">â€”</div>
                  <div className="stat-foot">Configured classes</div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Subjects</span>
                    <span className="stat-icon green">â–§</span>
                  </div>
                  <div className="stat-value">â€”</div>
                  <div className="stat-foot">Configured subjects</div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Results compiled</span>
                    <span className="stat-icon orange">âœ“</span>
                  </div>
                  <div className="stat-value">â€”</div>
                  <div className="stat-foot">Current term</div>
                </article>
              </section>

              <div className="dashboard-columns">
                <section className="panel setup-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Getting started</h2>
                      <p>Complete these steps to prepare your workspace.</p>
                    </div>
                    <span className="step-count">{schoolName ? "1 of 5" : "0 of 5"}</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: schoolName ? "20%" : "0%" }}
                    />
                  </div>

                  {[
                    {
                      number: "01",
                      title: "Configure school profile",
                      detail: "School name, address and contact details",
                      target: "School Setup" as Page,
                      complete: Boolean(schoolName),
                    },
                    {
                      number: "02",
                      title: "Set up classes and subjects",
                      detail: "Define the school's academic structure",
                      target: "Classes & Subjects" as Page,
                      complete: false,
                    },
                    {
                      number: "03",
                      title: "Register students",
                      detail: "Create student records and IDs",
                      target: "Students" as Page,
                      complete: false,
                    },
                    {
                      number: "04",
                      title: "Configure result rules",
                      detail: "Define score totals and grading",
                      target: "Settings" as Page,
                      complete: false,
                    },
                    {
                      number: "05",
                      title: "Enter examination marks",
                      detail: "Start collecting students' scores",
                      target: "Marks Entry" as Page,
                      complete: false,
                    },
                  ].map((step) => (
                    <button
                      className="checklist-item"
                      key={step.number}
                      onClick={() => choosePage(step.target)}
                      type="button"
                    >
                      <span className={`step-number ${step.complete ? "complete" : ""}`}>
                        {step.complete ? "âœ“" : step.number}
                      </span>
                      <span className="checklist-copy">
                        <strong>{step.title}</strong>
                        <span>{step.detail}</span>
                      </span>
                      <span className="step-arrow">â†’</span>
                    </button>
                  ))}
                </section>

                <section className="panel quick-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Quick actions</h2>
                      <p>Jump straight to a task.</p>
                    </div>
                  </div>
                  <button
                    className="quick-action"
                    onClick={() => choosePage("Students")}
                    type="button"
                  >
                    <span className="quick-icon blue">â™™</span>
                    <span><strong>Register a student</strong><small>Create a student profile</small></span>
                    <span className="step-arrow">â†’</span>
                  </button>
                  <button
                    className="quick-action"
                    onClick={() => choosePage("Classes & Subjects")}
                    type="button"
                  >
                    <span className="quick-icon purple">â–¤</span>
                    <span><strong>Manage classes</strong><small>Classes and subject lists</small></span>
                    <span className="step-arrow">â†’</span>
                  </button>
                  <button
                    className="quick-action"
                    onClick={() => choosePage("Marks Entry")}
                    type="button"
                  >
                    <span className="quick-icon green">âœŽ</span>
                    <span><strong>Enter examination marks</strong><small>Record student scores</small></span>
                    <span className="step-arrow">â†’</span>
                  </button>
                  <button
                    className="quick-action"
                    onClick={() => choosePage("Results & Reports")}
                    type="button"
                  >
                    <span className="quick-icon orange">â–¥</span>
                    <span><strong>View results and reports</strong><small>Prepare result documents</small></span>
                    <span className="step-arrow">â†’</span>
                  </button>
                  <div className="privacy-note">
                    <span>âŒ‘</span>
                    Your school data will be stored locally in this installation.
                  </div>
                </section>
              </div>

              <footer className="page-footer">
                <span>Exam Officer</span>
                <span>Built for reliable school examination management.</span>
              </footer>
            </>
          )}

          {page === "School Setup" && (
            <section className="inner-page">
              <div className="eyebrow">SCHOOL MANAGEMENT</div>
              <h1>School setup</h1>
              <p className="page-subtitle">
                Configure your school's identity and current academic calendar.
              </p>

              <form className="panel school-form" onSubmit={saveSchool}>
                <div className="form-section-title">
                  <div className="form-section-icon">âŒ‚</div>
                  <div>
                    <h2>School profile</h2>
                    <p>These details can appear on result sheets and report cards.</p>
                  </div>
                </div>

                <label className="field">
                  <span>School name <b>*</b></span>
                  <input
                    required
                    value={schoolName}
                    onChange={(event) => {
                      setSchoolName(event.target.value);
                      setSaved(false);
                    }}
                    placeholder="Enter the full registered school name"
                  />
                </label>

                <label className="field">
                  <span>School address</span>
                  <input
                    value={schoolAddress}
                    onChange={(event) => {
                      setSchoolAddress(event.target.value);
                      setSaved(false);
                    }}
                    placeholder="Street, town or city"
                  />
                </label>

                <div className="form-grid">
                  <label className="field">
                    <span>Phone number</span>
                    <input
                      value={schoolPhone}
                      onChange={(event) => {
                        setSchoolPhone(event.target.value);
                        setSaved(false);
                      }}
                      placeholder="School contact number"
                    />
                  </label>
                  <label className="field">
                    <span>Email address</span>
                    <input
                      type="email"
                      value={schoolEmail}
                      onChange={(event) => {
                        setSchoolEmail(event.target.value);
                        setSaved(false);
                      }}
                      placeholder="school@example.com"
                    />
                  </label>
                </div>

                <div className="form-section-title calendar-section">
                  <div className="form-section-icon">â–¦</div>
                  <div>
                    <h2>Academic calendar</h2>
                    <p>Select the session and term for the current examination period.</p>
                  </div>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Academic session</span>
                    <input
                      value={session}
                      onChange={(event) => {
                        setSession(event.target.value);
                        setSaved(false);
                      }}
                      placeholder="e.g. 2026/2027"
                    />
                  </label>
                  <label className="field">
                    <span>Current term</span>
                    <select
                      value={term}
                      onChange={(event) => {
                        setTerm(event.target.value);
                        setSaved(false);
                      }}
                    >
                      <option>First Term</option>
                      <option>Second Term</option>
                      <option>Third Term</option>
                    </select>
                  </label>
                </div>

                {storageError && (
                  <p role="alert" className="save-message">{storageError}</p>
                )}

                <div className="form-actions">
                  {saved && (
                    <span className="save-message">
                      âœ“ Profile saved for this session
                    </span>
                  )}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => choosePage("Dashboard")}
                  >
                    Back to dashboard
                  </button>
                  <button className="primary-button" type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save school profile"}
                  </button>
                </div>
                <p className="form-disclaimer">
                  Initial version: this form currently keeps its values in application
                  memory. Permanent local database storage is the next development step.
                </p>
              </form>
            </section>
          )}

          {page === "Classes & Subjects" && (
            <section className="inner-page">
              <div className="eyebrow">SCHOOL MANAGEMENT</div>
              <h1>Classes & Subjects</h1>
              <p className="page-subtitle">
                Create classes, manage subjects, and assign subjects to each class.
              </p>

              {academicError && (
                <div className="save-message error-message" role="alert">
                  {academicError}
                </div>
              )}
              {academicMessage && (
                <div className="save-message" role="status">
                  {academicMessage}
                </div>
              )}

              <div className="academic-grid">
                <section className="panel academic-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Classes</h2>
                      <p>Create and manage school classes.</p>
                    </div>
                    <span className="academic-count">{classes.length}</span>
                  </div>

                  <form className="academic-create-form" onSubmit={(event) => {
                    event.preventDefault();
                    void createClass();
                  }}>
                    <label className="field">
                      <span>New class name</span>
                      <input
                        value={newClassName}
                        onChange={(event) => setNewClassName(event.target.value)}
                        placeholder="e.g. Primary 1"
                        maxLength={100}
                        disabled={academicBusy}
                      />
                    </label>
                    <button className="primary-button" type="submit" disabled={academicBusy}>
                      Add class
                    </button>
                  </form>

                  <div className="academic-list">
                    {classes.length === 0 ? (
                      <p className="empty-state">No classes yet. Add your first class above.</p>
                    ) : classes.map((item) => (
                      <div
                        className={`academic-list-item ${selectedClassId === item.id ? "selected" : ""}`}
                        key={item.id}
                      >
                        <button className="academic-select" type="button" onClick={() => {
                          setSelectedClassId(item.id);
                          setAcademicError("");
                          setAcademicMessage("");
                          void loadClassSubjects(item.id).catch((error) => setAcademicError(String(error)));
                        }}>
                          <strong>{item.name}</strong>
                          <span>{selectedClassId === item.id ? "Selected class" : "Select class"}</span>
                        </button>
                        <div className="academic-item-actions">
                          <button className="secondary-button compact-button" type="button" disabled={academicBusy} onClick={() => void renameClass(item)}>Rename</button>
                          <button className="secondary-button compact-button danger-button" type="button" disabled={academicBusy} onClick={() => void deleteClass(item)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel academic-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Subjects</h2>
                      <p>Maintain the school's subject catalogue.</p>
                    </div>
                    <span className="academic-count">{subjects.length}</span>
                  </div>

                  <form className="academic-create-form" onSubmit={(event) => {
                    event.preventDefault();
                    void createSubject();
                  }}>
                    <label className="field">
                      <span>New subject name</span>
                      <input
                        value={newSubjectName}
                        onChange={(event) => setNewSubjectName(event.target.value)}
                        placeholder="e.g. Mathematics"
                        maxLength={100}
                        disabled={academicBusy}
                      />
                    </label>
                    <button className="primary-button" type="submit" disabled={academicBusy}>
                      Add subject
                    </button>
                  </form>

                  <div className="academic-list">
                    {subjects.length === 0 ? (
                      <p className="empty-state">No subjects yet. Add your first subject above.</p>
                    ) : subjects.map((item) => (
                      <div className="academic-list-item" key={item.id}>
                        <div className="academic-subject-name"><strong>{item.name}</strong></div>
                        <div className="academic-item-actions">
                          <button className="secondary-button compact-button" type="button" disabled={academicBusy} onClick={() => void renameSubject(item)}>Rename</button>
                          <button className="secondary-button compact-button danger-button" type="button" disabled={academicBusy} onClick={() => void deleteSubject(item)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="panel academic-panel">
                <div className="section-heading">
                  <div>
                    <h2>School Sections</h2>
                    <p>Create sections such as Nursery, Primary, and Secondary, then assign classes to them.</p>
                  </div>
                </div>

                <form className="assignment-form" onSubmit={(event) => {
                  event.preventDefault();
                  void createSection();
                }}>
                  <label className="field">
                    <span>Section name *</span>
                    <input value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} placeholder="e.g. Nursery" required />
                  </label>
                  <label className="field">
                    <span>Section code *</span>
                    <input value={newSectionCode} onChange={(event) => setNewSectionCode(event.target.value.toUpperCase())} placeholder="e.g. NUR" maxLength={8} required />
                  </label>
                  <button className="primary-button" type="submit">Create section</button>
                </form>

                <div className="academic-list">
                  {sections.map((section) => (
                    <div className="academic-list-item" key={section.id}>
                      <div>
                        <strong>{section.name}</strong>
                        <p>Code: {section.code}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <form className="assignment-form" onSubmit={(event) => {
                  event.preventDefault();
                  void assignSectionToClass();
                }}>
                  <label className="field">
                    <span>Class *</span>
                    <select value={selectedClassId ?? ""} onChange={(event) => setSelectedClassId(event.target.value ? Number(event.target.value) : null)} required>
                      <option value="">Select a class</option>
                      {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Section *</span>
                    <select value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value ? Number(event.target.value) : "")} required>
                      <option value="">Select a section</option>
                      {sections.map((section) => <option key={section.id} value={section.id}>{section.name} ({section.code})</option>)}
                    </select>
                  </label>
                  <button className="primary-button" type="submit" disabled={!classes.length || !sections.length}>Assign section to class</button>
                </form>
              </section>
              <section className="panel academic-panel assignment-panel">
                <div className="section-heading">
                  <div>
                    <h2>Assign subjects to a class</h2>
                    <p>Choose which subjects are taught in the selected class.</p>
                  </div>
                </div>

                <div className="assignment-form">
                  <label className="field">
                    <span>Class *</span>
                    <select
                      value={selectedClassId ?? ""}
                      onChange={(event) => {
                        const classId = event.target.value ? Number(event.target.value) : null;
                        setSelectedClassId(classId);
                        setClassSubjects([]);
                        setAcademicError("");
                        setAcademicMessage("");
                        if (classId !== null) {
                          void loadClassSubjects(classId).catch((error) => setAcademicError(String(error)));
                        }
                      }}
                      disabled={academicBusy || classes.length === 0}
                    >
                      <option value="">Select a class</option>
                      {classes.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {selectedClassId === null ? (
                  <p className="empty-state">Create a class first, then select it above to assign subjects.</p>
                ) : (
                  <>
                    <p className="selected-class-label">
                      Selected class: <strong>{classes.find((item) => item.id === selectedClassId)?.name ?? "Class"}</strong>
                    </p>
                    <form className="assignment-form" onSubmit={(event) => {
                      event.preventDefault();
                      void assignSubject();
                    }}>
                      <label className="field">
                        <span>Choose subject</span>
                        <select
                          value={selectedSubjectId ?? ""}
                          onChange={(event) => setSelectedSubjectId(event.target.value ? Number(event.target.value) : null)}
                          disabled={academicBusy || subjects.length === 0}
                        >
                          <option value="">Select a subject</option>
                          {subjects.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                      </label>
                      <button className="primary-button" type="submit" disabled={academicBusy || subjects.length === 0}>
                        Assign subject
                      </button>
                    </form>

                    <div className="academic-list assignment-list">
                      <h3>Assigned subjects ({classSubjects.length})</h3>
                      {classSubjects.length === 0 ? (
                        <p className="empty-state">No subjects assigned to this class yet.</p>
                      ) : classSubjects.map((assignment) => (
                        <div className="academic-list-item" key={assignment.id}>
                          <div className="academic-subject-name"><strong>{assignment.subjectName}</strong></div>
                          <button className="secondary-button compact-button danger-button" type="button" disabled={academicBusy} onClick={() => void removeSubjectAssignment(assignment)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </section>
          )}

          {/* STUDENT_SCREEN_STEP26 */}
          {page === "Students" && (
            <section className="inner-page">
              <div className="eyebrow">SCHOOL MANAGEMENT</div>
              <h1>Students</h1>
              <p className="page-subtitle">Register, identify and manage students in your school.</p>

              <section className="panel academic-panel">
                <div className="section-heading">
                  <div>
                    <h2>Register a student</h2>
                    <p>Enter the student's details below.</p>
                  </div>
                  <span className="academic-count">{students.length}</span>
                </div>

                {studentError && <p role="alert">{studentError}</p>}
                {studentMessage && <p role="status">{studentMessage}</p>}

                <form className="academic-create-form" onSubmit={(event) => {
                  event.preventDefault();
                  void registerStudent();
                }}>
                  <label className="field">
                    <span>Student ID *</span>
                    <input value={studentIdInput} onChange={(event) => setStudentIdInput(event.target.value)} maxLength={50} required disabled={studentBusy} placeholder="e.g. BFA/2026/001" />
                  </label>

                  <label className="field">
                    <span>First name *</span>
                    <input value={studentFirstName} onChange={(event) => setStudentFirstName(event.target.value)} maxLength={100} required disabled={studentBusy} />
                  </label>

                  <label className="field">
                    <span>Middle name</span>
                    <input value={studentMiddleName} onChange={(event) => setStudentMiddleName(event.target.value)} maxLength={100} disabled={studentBusy} />
                  </label>

                  <label className="field">
                    <span>Last name *</span>
                    <input value={studentLastName} onChange={(event) => setStudentLastName(event.target.value)} maxLength={100} required disabled={studentBusy} />
                  </label>

                  <label className="field">
                    <span>Gender *</span>
                    <select value={studentGender} onChange={(event) => setStudentGender(event.target.value)} disabled={studentBusy}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Class *</span>
                    <select value={studentClassId} onChange={(event) => setStudentClassId(event.target.value ? Number(event.target.value) : "")} required disabled={studentBusy || classes.length === 0}>
                      <option value="">Select a class</option>
                      {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>

                  <label className="field">
                    <span>Admission date</span>
                    <input type="date" value={studentAdmissionDate} onChange={(event) => setStudentAdmissionDate(event.target.value)} disabled={studentBusy} />
                  </label>

                  <button className="primary-button" type="submit" disabled={studentBusy || classes.length === 0}>
                    {studentBusy ? "Please wait..." : "Register student"}
                  </button>
                </form>

                {classes.length === 0 && <p className="empty-state">Create a class in Classes & Subjects before registering students.</p>}
              </section>

              <section className="panel academic-panel">
                <div className="section-heading">
                  <div>
                    <h2>Student register</h2>
                    <p>Search registered students by ID, name, or class.</p>
                  </div>
                </div>

                <label className="field">
                  <span>Search students</span>
                  <input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Enter student ID, name, or class" />
                </label>

                <div className="academic-list">
                  {students.filter((student) => {
                    const query = studentSearch.trim().toLowerCase();
                    return !query || [
                      student.studentId,
                      student.firstName,
                      student.middleName,
                      student.lastName,
                      student.className
                    ].some((value) => value.toLowerCase().includes(query));
                  }).length === 0 ? (
                    <p className="empty-state">No matching students found.</p>
                  ) : students.filter((student) => {
                    const query = studentSearch.trim().toLowerCase();
                    return !query || [
                      student.studentId,
                      student.firstName,
                      student.middleName,
                      student.lastName,
                      student.className
                    ].some((value) => value.toLowerCase().includes(query));
                  }).map((student) => (
                    <div className="academic-list-item" key={student.id}>
                      <div>
                        <strong>{student.lastName}, {student.firstName} {student.middleName}</strong>
                        <p>{student.studentId} · {student.className} · {student.gender}</p>
                        {student.admissionDate && <p>Admission date: {student.admissionDate}</p>}
                      </div>
                      <div className="academic-item-actions">
                        <button className="secondary-button compact-button danger-button" type="button" disabled={studentBusy} onClick={() => void removeStudent(student.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          )}
          {page !== "Dashboard" && page !== "School Setup" && page !== "Classes & Subjects" && page !== "Students" && (
            <section className="inner-page">
              <div className="eyebrow">
                {page === "Settings" ? "SYSTEM CONFIGURATION" : "EXAMINATION WORKSPACE"}
              </div>
              <h1>{page}</h1>
              <p className="page-subtitle">
                                {page === "Marks Entry" && "Record student scores with their correct maximum marks."}
                {page === "Results & Reports" && "Compile results and prepare printable report cards."}
                {page === "Settings" && "Configure grading rules and application preferences."}
              </p>
              <div className="panel coming-panel">
                <div className="coming-icon">
                  {page === "Marks Entry" ? "✎" : page === "Results & Reports" ? "▤" : "⚙"}
                </div>
                <h2>{page} workspace</h2>
                <p>This section will be implemented in the next stages.</p>
                <button className="primary-button" onClick={() => choosePage("School Setup")} type="button">
                  Configure school first <span>→</span>
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;




















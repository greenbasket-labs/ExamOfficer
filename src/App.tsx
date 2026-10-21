import { Fragment, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type Page =
  | "Dashboard"
  | "School Setup"
  | "Students"
  | "Classes & Subjects"
  | "Marks Entry"
  | "Results & Reports"
  | "Report Cards"
  | "Settings";

const navigation: { label: Page; icon: string; group: string }[] = [
  { label: "Dashboard", icon: "â–¦", group: "WORKSPACE" },
  { label: "School Setup", icon: "âŒ‚", group: "SCHOOL MANAGEMENT" },
  { label: "Students", icon: "â™™", group: "SCHOOL MANAGEMENT" },
  { label: "Classes & Subjects", icon: "â–¤", group: "SCHOOL MANAGEMENT" },
  { label: "Marks Entry", icon: "âœŽ", group: "EXAMINATIONS" },
  { label: "Results & Reports", icon: "â–¥", group: "EXAMINATIONS" },
  { label: "Report Cards", icon: "▤", group: "EXAMINATIONS" },
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

type MarkEntryRow = {
  studentId: number;
  studentCode: string;
  studentName: string;
  score: number | null;
  maxScore: number | null;
};

type ClassResultRow = {
  studentId: number;
  studentCode: string;
  studentName: string;
  subjectId: number | null;
  subjectName: string | null;
  scoreTotal: number;
  maxTotal: number;
  assessmentCount: number;
};

type StudentResultSummary = {
  studentId: number;
  studentCode: string;
  studentName: string;
  subjects: { subjectId: number; subjectName: string; scoreTotal: number; maxTotal: number; assessmentCount: number }[];
  average: number | null;
  position: number;
};

function summarizeClassResults(rows: ClassResultRow[]): StudentResultSummary[] {
  const grouped = new Map<number, Omit<StudentResultSummary, "average" | "position">>();
  for (const row of rows) {
    let student = grouped.get(row.studentId);
    if (!student) {
      student = {
        studentId: row.studentId,
        studentCode: row.studentCode,
        studentName: row.studentName,
        subjects: [],
      };
      grouped.set(row.studentId, student);
    }
    if (row.subjectId !== null && row.subjectName !== null) {
      student.subjects.push({
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        scoreTotal: row.scoreTotal,
        maxTotal: row.maxTotal,
        assessmentCount: row.assessmentCount,
      });
    }
  }

  const summaries = Array.from(grouped.values()).map((student) => {
    const percentages = student.subjects
      .filter((subject) => subject.assessmentCount > 0 && subject.maxTotal > 0)
      .map((subject) => (subject.scoreTotal / subject.maxTotal) * 100);
    const average = percentages.length
      ? Math.round((percentages.reduce((sum, value) => sum + value, 0) / percentages.length) * 100) / 100
      : null;
    return { ...student, average, position: 0 };
  });

  summaries.sort((a, b) => {
    if (a.average === null && b.average !== null) return 1;
    if (a.average !== null && b.average === null) return -1;
    if (a.average !== null && b.average !== null && a.average !== b.average) return b.average - a.average;
    return a.studentName.localeCompare(b.studentName);
  });

  let lastAverage: number | null | undefined = undefined;
  let lastPosition = 0;
  summaries.forEach((student, index) => {
    if (index === 0 || student.average !== lastAverage) {
      lastPosition = index + 1;
      lastAverage = student.average;
    }
    student.position = lastPosition;
  });
  return summaries;
}

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
  const [markClassId, setMarkClassId] = useState<number | "">("");
  const [markSubjectId, setMarkSubjectId] = useState<number | "">("");
  const [markClassSubjects, setMarkClassSubjects] = useState<ClassSubject[]>([]);
  const [markAssessment, setMarkAssessment] = useState("Examination");
  const [markMaxScore, setMarkMaxScore] = useState("100");
  const [markRows, setMarkRows] = useState<MarkEntryRow[]>([]);
  const [markInputs, setMarkInputs] = useState<Record<number, string>>({});
  const [markError, setMarkError] = useState("");
  const [markMessage, setMarkMessage] = useState("");
  const [markBusy, setMarkBusy] = useState(false);
  const [resultClassId, setResultClassId] = useState<number | "">("");
  const [resultRows, setResultRows] = useState<ClassResultRow[]>([]);
  const [resultError, setResultError] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [resultBusy, setResultBusy] = useState(false);
  const [reportStudents, setReportStudents] = useState<Student[]>([]);
  const [reportClassId, setReportClassId] = useState<number | "">("");
  const [reportStudentId, setReportStudentId] = useState<number | "">("");
  const [reportRows, setReportRows] = useState<ClassResultRow[]>([]);
  const [reportTeacherRemark, setReportTeacherRemark] = useState("");
  const [reportPrincipalRemark, setReportPrincipalRemark] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

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
    if (page !== "Marks Entry") return;
    let active = true;
    async function loadMarkSetup() {
      setMarkError("");
      try {
        const [loadedClasses, loadedSubjects] = await Promise.all([
          invoke<SchoolClass[]>("get_classes"),
          invoke<Subject[]>("get_subjects"),
        ]);
        if (!active) return;
        setClasses(loadedClasses);
        setSubjects(loadedSubjects);
        setMarkClassId((current) =>
          current !== "" && loadedClasses.some((item) => item.id === current)
            ? current
            : loadedClasses[0]?.id ?? ""
        );
        setMarkSubjectId((current) =>
          current !== "" && loadedSubjects.some((item) => item.id === current)
            ? current
            : loadedSubjects[0]?.id ?? ""
        );
      } catch (error) {
        if (active) setMarkError(String(error));
      }
    }
    void loadMarkSetup();
    return () => { active = false; };
  }, [page]);

  const loadMarkRows = async () => {
    setMarkError("");
    setMarkMessage("");
    if (markClassId === "" || markSubjectId === "") {
      setMarkError("Create/select a class and subject before loading marks.");
      return;
    }
    if (!markAssessment.trim()) {
      setMarkError("Enter an assessment name, such as CA1 or Examination.");
      return;
    }
    setMarkBusy(true);
    try {
      const rows = await invoke<MarkEntryRow[]>("get_mark_entries", {
        classId: markClassId,
        subjectId: markSubjectId,
        session: session.trim(),
        term,
        assessmentName: markAssessment.trim(),
      });
      setMarkRows(rows);
      const savedMaximum = rows.find((row) => row.maxScore !== null)?.maxScore;
      if (savedMaximum !== undefined) setMarkMaxScore(String(savedMaximum));
      setMarkInputs(Object.fromEntries(rows.map((row) => [
        row.studentId, row.score === null ? "" : String(row.score)
      ])));
      if (rows.length === 0) setMarkMessage("No students are registered in this class yet.");
    } catch (error) {
      setMarkError(String(error));
    } finally {
      setMarkBusy(false);
    }
  };

  const saveStudentMark = async (row: MarkEntryRow) => {
    setMarkError("");
    setMarkMessage("");
    const rawScore = markInputs[row.studentId]?.trim() ?? "";
    const score = Number(rawScore);
    const maxScore = Number(markMaxScore);
    if (rawScore === "" || !Number.isFinite(score) || !Number.isFinite(maxScore) ||
        maxScore <= 0 || score < 0 || score > maxScore) {
      setMarkError(`Enter a valid score for ${row.studentCode} between 0 and the maximum mark.`);
      return;
    }
    setMarkBusy(true);
    try {
      await invoke("save_mark_entry", {
        studentId: row.studentId,
        subjectId: markSubjectId,
        session: session.trim(),
        term,
        assessmentName: markAssessment.trim(),
        score,
        maxScore,
      });
      setMarkRows((current) => current.map((item) =>
        item.studentId === row.studentId ? { ...item, score, maxScore } : item
      ));
      setMarkMessage(`Saved mark for ${row.studentCode}.`);
    } catch (error) {
      setMarkError(String(error));
    } finally {
      setMarkBusy(false);
    }
  };

  const loadReportCard = async () => {
    setReportError("");
    setReportMessage("");
    if (reportClassId === "" || reportStudentId === "") {
      setReportError("Select a class and a student first.");
      return;
    }
    setReportBusy(true);
    try {
      const rows = await invoke<ClassResultRow[]>("get_class_results", {
        classId: reportClassId,
        session: session.trim(),
        term,
      });
      setReportRows(rows);
      const remarks = await invoke<{ teacherRemark: string; principalRemark: string }>(
        "get_report_card_remarks",
        { studentId: reportStudentId, session: session.trim(), term },
      );
      setReportTeacherRemark(remarks.teacherRemark);
      setReportPrincipalRemark(remarks.principalRemark);
      setReportMessage("Report card loaded from saved marks for the selected academic period.");
    } catch (error) {
      setReportError(String(error));
      setReportRows([]);
    } finally {
      setReportBusy(false);
    }
  };

  const saveReportCardRemarks = async () => {
    if (reportStudentId === "") {
      setReportError("Select a student before saving remarks.");
      return;
    }
    setReportBusy(true);
    setReportError("");
    setReportMessage("");
    try {
      await invoke("save_report_card_remarks", {
        studentId: reportStudentId,
        session: session.trim(),
        term,
        teacherRemark: reportTeacherRemark,
        principalRemark: reportPrincipalRemark,
      });
      setReportMessage("Report-card remarks saved.");
    } catch (error) {
      setReportError(String(error));
    } finally {
      setReportBusy(false);
    }
  };

  useEffect(() => {
    if (page !== "Report Cards") return;
    let active = true;
    async function loadReportSetup() {
      setReportError("");
      try {
        const [loadedClasses, loadedStudents] = await Promise.all([
          invoke<SchoolClass[]>("get_classes"),
          invoke<Student[]>("get_students"),
        ]);
        if (!active) return;
        setClasses(loadedClasses);
        setReportStudents(loadedStudents);
        const nextClassId = loadedClasses[0]?.id ?? "";
        setReportClassId((current) => current !== "" && loadedClasses.some((item) => item.id === current) ? current : nextClassId);
        setReportStudentId((current) => current !== "" && loadedStudents.some((item) => item.id === current) ? current : "");
        setReportRows([]);
      } catch (error) {
        if (active) setReportError(String(error));
      }
    }
    void loadReportSetup();
    return () => { active = false; };
  }, [page]);

  useEffect(() => {
    if (reportClassId === "") {
      setReportStudentId("");
      return;
    }
    const studentsInClass = reportStudents.filter((student) => student.classId === reportClassId);
    if (!studentsInClass.some((student) => student.id === reportStudentId)) {
      setReportStudentId(studentsInClass[0]?.id ?? "");
      setReportRows([]);
    }
  }, [reportClassId, reportStudents, reportStudentId]);

  const loadClassResults = async () => {
    setResultError("");
    setResultMessage("");
    if (resultClassId === "") {
      setResultError("Select a class before generating results.");
      return;
    }
    setResultBusy(true);
    try {
      const rows = await invoke<ClassResultRow[]>("get_class_results", {
        classId: resultClassId,
        session: session.trim(),
        term,
      });
      setResultRows(rows);
      if (rows.length === 0) {
        setResultMessage("No students are registered in this class yet.");
      } else if (!rows.some((row) => row.assessmentCount > 0)) {
        setResultMessage("Students are listed, but no marks have been saved for this period yet.");
      } else {
        setResultMessage("Results calculated from saved marks for the selected academic period.");
      }
    } catch (error) {
      setResultError(String(error));
      setResultRows([]);
    } finally {
      setResultBusy(false);
    }
  };

  useEffect(() => {
    if (page !== "Results & Reports") return;
    let active = true;
    async function loadResultSetup() {
      setResultError("");
      try {
        const loadedClasses = await invoke<SchoolClass[]>("get_classes");
        if (!active) return;
        setClasses(loadedClasses);
        setResultClassId((current) =>
          current !== "" && loadedClasses.some((item) => item.id === current)
            ? current
            : loadedClasses[0]?.id ?? ""
        );
      } catch (error) {
        if (active) setResultError(String(error));
      }
    }
    void loadResultSetup();
    return () => { active = false; };
  }, [page]);

  useEffect(() => {
    if (page !== "Marks Entry" || markClassId === "") {
      setMarkClassSubjects([]);
      return;
    }
    let active = true;
    async function loadAssignedSubjects() {
      try {
        const assigned = await invoke<ClassSubject[]>("get_class_subjects", { classId: markClassId });
        if (!active) return;
        setMarkClassSubjects(assigned);
        setMarkSubjectId((current) =>
          current !== "" && assigned.some((item) => item.subjectId === current)
            ? current
            : assigned[0]?.subjectId ?? ""
        );
        setMarkRows([]);
      } catch (error) {
        if (active) {
          setMarkClassSubjects([]);
          setMarkSubjectId("");
          setMarkError(String(error));
        }
      }
    }
    void loadAssignedSubjects();
    return () => { active = false; };
  }, [page, markClassId]);

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
          {page === "Marks Entry" && (
            <section className="inner-page">
              <div className="eyebrow">EXAMINATION WORKSPACE</div>
              <h1>Marks Entry</h1>
              <p className="page-subtitle">Enter marks against each student's permanent record. Scores are saved locally on this computer.</p>
              {markError && <div className="save-message error-message" role="alert">{markError}</div>}
              {markMessage && <div className="save-message" role="status">{markMessage}</div>}
              <section className="panel academic-panel">
                <div className="section-heading"><div><h2>Assessment details</h2><p>Choose the class, subject and assessment being marked.</p></div></div>
                <div className="assignment-form">
                  <label className="field"><span>Class *</span>
                    <select value={markClassId} onChange={(event) => { setMarkClassId(event.target.value ? Number(event.target.value) : ""); setMarkRows([]); }} disabled={markBusy}>
                      <option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>Subject *</span>
                    <select value={markSubjectId} onChange={(event) => { setMarkSubjectId(event.target.value ? Number(event.target.value) : ""); setMarkRows([]); }} disabled={markBusy}>
                      <option value="">Select subject</option>{markClassSubjects.map((item) => <option key={item.subjectId} value={item.subjectId}>{item.subjectName}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>Assessment label *</span>
                    <input value={markAssessment} onChange={(event) => { setMarkAssessment(event.target.value); setMarkRows([]); }} maxLength={60} placeholder="e.g. CA1 or Examination" disabled={markBusy} />
                  </label>
                  <label className="field"><span>Maximum mark *</span>
                    <input type="number" min="1" step="any" value={markMaxScore} onChange={(event) => setMarkMaxScore(event.target.value)} disabled={markBusy} />
                  </label>
                </div>
                <p className="page-subtitle">Current period: <strong>{session}</strong> · <strong>{term}</strong>. Change these in School Setup before loading marks for another period.</p>
                <button className="primary-button" type="button" onClick={() => void loadMarkRows()} disabled={markBusy || markClassId === "" || markSubjectId === ""}>
                  {markBusy ? "Please wait..." : "Load class register"}
                </button>
              </section>
              {markRows.length > 0 && (
                <section className="panel academic-panel">
                  <div className="section-heading"><div><h2>Student marks</h2><p>{markRows.length} student(s). Save each score to update that student's record.</p></div><span className="academic-count">{markRows.filter((row) => row.score !== null).length}/{markRows.length} saved</span></div>
                  <div className="academic-list">
                    {markRows.map((row) => (
                      <div className="academic-list-item" key={row.studentId}>
                        <div><strong>{row.studentName}</strong><p>{row.studentCode}{row.score !== null && row.maxScore !== null ? ` · Saved: ${row.score}/${row.maxScore}` : " · No mark saved yet"}</p></div>
                        <div className="academic-item-actions">
                          <input aria-label={`Score for ${row.studentCode}`} type="number" min="0" max={markMaxScore} step="any" value={markInputs[row.studentId] ?? ""} onChange={(event) => setMarkInputs((current) => ({ ...current, [row.studentId]: event.target.value }))} placeholder="Score" disabled={markBusy} style={{ width: "100px" }} />
                          <button className="secondary-button compact-button" type="button" onClick={() => void saveStudentMark(row)} disabled={markBusy}>Save mark</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </section>
          )}
          {page === "Results & Reports" && (
            <section className="inner-page">
              <div className="eyebrow">EXAMINATION WORKSPACE</div>
              <h1>Results & Reports</h1>
              <p className="page-subtitle">Calculate class results from saved marks for the selected academic session and term.</p>
              {resultError && <div className="save-message error-message" role="alert">{resultError}</div>}
              {resultMessage && <div className="save-message" role="status">{resultMessage}</div>}
              <section className="panel academic-panel">
                <div className="section-heading"><div><h2>Class results</h2><p>Choose a class to calculate subject totals, averages and positions.</p></div></div>
                <div className="assignment-form">
                  <label className="field"><span>Class *</span>
                    <select value={resultClassId} onChange={(event) => { setResultClassId(event.target.value ? Number(event.target.value) : ""); setResultRows([]); setResultMessage(""); }} disabled={resultBusy}>
                      <option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <div className="field"><span>Academic session</span><strong>{session}</strong></div>
                  <div className="field"><span>Term</span><strong>{term}</strong></div>
                </div>
                <button className="primary-button" type="button" onClick={() => void loadClassResults()} disabled={resultBusy || resultClassId === ""}>
                  {resultBusy ? "Calculating..." : "Generate class results"}
                </button>
              </section>
              {resultRows.length > 0 && (
                <section className="panel academic-panel">
                  <div className="section-heading"><div><h2>Class ranking</h2><p>Average is calculated from each student's subjects that have saved marks. Each subject has equal weight.</p></div><span className="academic-count">{summarizeClassResults(resultRows).length} students</span></div>
                  <div className="academic-list">
                    {summarizeClassResults(resultRows).map((student) => (
                      <div className="academic-list-item" key={student.studentId} style={{ alignItems: "flex-start" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong>{student.position}. {student.studentName}</strong>
                          <p>{student.studentCode} · {student.average === null ? "No marks recorded" : `Average: ${student.average.toFixed(2)}%`}</p>
                          {student.subjects.length > 0 && (
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1fr) auto auto", gap: "6px 14px", marginTop: "10px", fontSize: "0.9rem" }}>
                              {student.subjects.map((subject) => (
                                <Fragment key={subject.subjectId}>
                                  <span>{subject.subjectName}</span>
                                  <span>{subject.assessmentCount > 0 ? `${Number(subject.scoreTotal.toFixed(2))}/${Number(subject.maxTotal.toFixed(2))}` : "—"}</span>
                                  <span>{subject.assessmentCount > 0 && subject.maxTotal > 0 ? `${((subject.scoreTotal / subject.maxTotal) * 100).toFixed(1)}%` : "—"}</span>
                                </Fragment>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="academic-item-actions"><span className="academic-count">Position {student.position}</span></div>
                      </div>
                    ))}
                  </div>
                  <p className="page-subtitle">Tied averages share the same competition rank (for example, 1, 2, 2, 4). Students without marks appear after students with results. Grades, teacher/principal remarks, printable report cards and PDF export are not yet implemented.</p>
                </section>
              )}
            </section>
          )}
          {page === "Report Cards" && (
            <section className="inner-page">
              <div className="eyebrow">INDIVIDUAL STUDENT REPORT</div>
              <h1>Report Cards</h1>
              <p className="page-subtitle">Prepare an individual student's report card from saved marks. This page is separate from class results and rankings.</p>
              {reportError && <div className="save-message error-message" role="alert">{reportError}</div>}
              {reportMessage && <div className="save-message" role="status">{reportMessage}</div>}
              <section className="panel academic-panel no-print">
                <div className="section-heading"><div><h2>Select student</h2><p>Choose the class and student for the report card.</p></div></div>
                <div className="assignment-form">
                  <label className="field"><span>Class *</span>
                    <select value={reportClassId} onChange={(event) => { setReportClassId(event.target.value ? Number(event.target.value) : ""); setReportRows([]); setReportMessage(""); }} disabled={reportBusy}>
                      <option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>Student *</span>
                    <select value={reportStudentId} onChange={(event) => { setReportStudentId(event.target.value ? Number(event.target.value) : ""); setReportRows([]); setReportMessage(""); }} disabled={reportBusy || reportClassId === ""}>
                      <option value="">Select student</option>{reportStudents.filter((student) => student.classId === reportClassId).map((student) => <option key={student.id} value={student.id}>{student.lastName}, {student.firstName} {student.middleName} ({student.studentId})</option>)}
                    </select>
                  </label>
                  <div className="field"><span>Academic session</span><strong>{session}</strong></div>
                  <div className="field"><span>Term</span><strong>{term}</strong></div>
                </div>
                <button className="primary-button" type="button" onClick={() => void loadReportCard()} disabled={reportBusy || reportClassId === "" || reportStudentId === ""}>
                  {reportBusy ? "Loading..." : "Load report card"}
                </button>
              </section>
              {reportRows.length > 0 && reportStudentId !== "" && (() => {
                const summary = summarizeClassResults(reportRows).find((item) => item.studentId === reportStudentId);
                const student = reportStudents.find((item) => item.id === reportStudentId);
                if (!summary || !student) return null;
                const gradedSubjects = summary.subjects.filter((subject) => subject.assessmentCount > 0 && subject.maxTotal > 0);
                const totalScore = gradedSubjects.reduce((sum, subject) => sum + subject.scoreTotal, 0);
                const totalMaximum = gradedSubjects.reduce((sum, subject) => sum + subject.maxTotal, 0);
                return (
                  <>
                    <section className="panel academic-panel report-card-paper">
                      <div style={{ textAlign: "center", borderBottom: "2px solid #222", paddingBottom: "16px", marginBottom: "18px" }}>
                        <h1 style={{ margin: 0 }}>{schoolName || "YOUR SCHOOL"}</h1>
                        {schoolAddress && <p>{schoolAddress}</p>}
                        {(schoolPhone || schoolEmail) && <p>{[schoolPhone, schoolEmail].filter(Boolean).join(" · ")}</p>}
                        <h2 style={{ marginBottom: 0 }}>STUDENT REPORT CARD</h2>
                        <p>{session} · {term}</p>
                      </div>
                      <div className="assignment-form" style={{ marginBottom: "18px" }}>
                        <div><strong>Student name</strong><p>{student.firstName} {student.middleName} {student.lastName}</p></div>
                        <div><strong>Student ID</strong><p>{student.studentId}</p></div>
                        <div><strong>Class</strong><p>{student.className}</p></div>
                        <div><strong>Gender</strong><p>{student.gender}</p></div>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "18px" }}>
                          <thead><tr><th style={{ textAlign: "left", borderBottom: "1px solid #777", padding: "8px" }}>Subject</th><th style={{ textAlign: "right", borderBottom: "1px solid #777", padding: "8px" }}>Total score</th><th style={{ textAlign: "right", borderBottom: "1px solid #777", padding: "8px" }}>Maximum</th><th style={{ textAlign: "right", borderBottom: "1px solid #777", padding: "8px" }}>Percentage</th></tr></thead>
                          <tbody>{summary.subjects.map((subject) => <tr key={subject.subjectId}><td style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>{subject.subjectName}</td><td style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>{subject.assessmentCount > 0 ? Number(subject.scoreTotal.toFixed(2)) : "—"}</td><td style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>{subject.assessmentCount > 0 ? Number(subject.maxTotal.toFixed(2)) : "—"}</td><td style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>{subject.assessmentCount > 0 && subject.maxTotal > 0 ? `${((subject.scoreTotal / subject.maxTotal) * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody>
                        </table>
                      </div>
                      <div className="assignment-form" style={{ marginBottom: "18px" }}>
                        <div><strong>Total</strong><p>{Number(totalScore.toFixed(2))} / {Number(totalMaximum.toFixed(2))}</p></div>
                        <div><strong>Average</strong><p>{summary.average === null ? "—" : `${summary.average.toFixed(2)}%`}</p></div>
                        <div><strong>Class position</strong><p>{summary.average === null ? "Not ranked" : `${summary.position}`}</p></div>
                      </div>
                      <div style={{ marginTop: "18px" }}><strong>Class teacher's remark</strong><p style={{ whiteSpace: "pre-wrap", minHeight: "36px" }}>{reportTeacherRemark || "—"}</p></div>
                      <div style={{ marginTop: "18px" }}><strong>Principal's remark</strong><p style={{ whiteSpace: "pre-wrap", minHeight: "36px" }}>{reportPrincipalRemark || "—"}</p></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px", marginTop: "36px" }}><div style={{ borderTop: "1px solid #777", paddingTop: "8px" }}>Class teacher's signature</div><div style={{ borderTop: "1px solid #777", paddingTop: "8px" }}>Principal's signature</div></div>
                    </section>
                    <section className="panel academic-panel no-print">
                      <div className="section-heading"><div><h2>Remarks</h2><p>Remarks are saved for this student, session and term.</p></div></div>
                      <label className="field"><span>Class teacher's remark (max 500 characters)</span><textarea value={reportTeacherRemark} onChange={(event) => setReportTeacherRemark(event.target.value)} maxLength={500} rows={3} disabled={reportBusy} placeholder="Enter the class teacher's remark" /></label>
                      <label className="field"><span>Principal's remark (max 500 characters)</span><textarea value={reportPrincipalRemark} onChange={(event) => setReportPrincipalRemark(event.target.value)} maxLength={500} rows={3} disabled={reportBusy} placeholder="Enter the principal's remark" /></label>
                      <div className="academic-item-actions"><button className="primary-button" type="button" onClick={() => void saveReportCardRemarks()} disabled={reportBusy}>Save remarks</button><button className="secondary-button" type="button" onClick={() => window.print()}>Print / Save as PDF</button></div>
                      <p className="page-subtitle">Use the print dialog's “Save as PDF” option to create a PDF. Automatic PDF generation and grade labels are not implemented yet.</p>
                    </section>
                  </>
                );
              })()}
              {reportClassId !== "" && reportStudentId === "" && <p className="empty-state">No students are registered in this class yet.</p>}
            </section>
          )}
          {page === "Settings" && (
            <section className="inner-page">
              <div className="eyebrow">SYSTEM CONFIGURATION</div><h1>Settings</h1>
              <p className="page-subtitle">Grading rules, remarks, backup and privacy controls will be added in later stages.</p>
              <div className="panel coming-panel"><div className="coming-icon">⚙</div><h2>Settings</h2><p>These settings are not yet implemented.</p></div>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;




















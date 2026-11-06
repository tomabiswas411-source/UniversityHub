/**
 * Grade scale & performance computation — Bangladesh UGC 4.00 scale.
 * Pure functions, shared by analytics APIs and UI.
 *
 * NOTE (Day 49 audit): all functions are total (no throw), handle
 * empty inputs and zero maxMarks defensively.
 */

export interface GradeBand {
  min: number; // inclusive percentage lower bound
  letter: string;
  gpa: number;
}

/** UGC uniform grading scale (Bangladesh) */
export const UGC_SCALE: GradeBand[] = [
  { min: 80, letter: "A+", gpa: 4.0 },
  { min: 75, letter: "A", gpa: 3.75 },
  { min: 70, letter: "A-", gpa: 3.5 },
  { min: 65, letter: "B+", gpa: 3.25 },
  { min: 60, letter: "B", gpa: 3.0 },
  { min: 55, letter: "B-", gpa: 2.75 },
  { min: 50, letter: "C+", gpa: 2.5 },
  { min: 45, letter: "C", gpa: 2.25 },
  { min: 40, letter: "D", gpa: 2.0 },
  { min: 0, letter: "F", gpa: 0.0 },
];

export function percentToGrade(pct: number): GradeBand {
  // UGC rounding: 79.5 → 80 rounds up into the A+ band, so fractional
  // averages never strand a student just below a band edge.
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return UGC_SCALE.find((b) => clamped >= b.min) ?? UGC_SCALE[UGC_SCALE.length - 1];
}

export interface RawResult {
  marks: number;
  maxMarks: number;
  examType: string;
  createdAt?: string | Date;
}

/** Safe percentage of a single result (0 when maxMarks <= 0) */
export function resultPct(r: { marks: number; maxMarks: number }): number {
  if (!r.maxMarks || r.maxMarks <= 0) return 0;
  return Math.max(0, Math.min(100, (r.marks / r.maxMarks) * 100));
}

export interface CoursePerformance {
  courseCode: string;
  courseName: string;
  avgPct: number;
  grade: string;
  gpaPoint: number;
  examCount: number;
  creditHours: number;
}

/**
 * Average percentage across all exam entries of one course,
 * mapped to a letter grade + GPA point.
 */
export function computeCoursePerformance(
  courseCode: string,
  courseName: string,
  results: RawResult[],
  creditHours = 3
): CoursePerformance {
  if (results.length === 0) {
    return {
      courseCode,
      courseName,
      avgPct: 0,
      grade: "—",
      gpaPoint: 0,
      examCount: 0,
      creditHours,
    };
  }
  const avg = results.reduce((acc, r) => acc + resultPct(r), 0) / results.length;
  const band = percentToGrade(avg);
  return {
    courseCode,
    courseName,
    avgPct: Math.round(avg * 100) / 100,
    grade: band.letter,
    gpaPoint: band.gpa,
    examCount: results.length,
    creditHours,
  };
}

/**
 * Credit-weighted GPA across courses. Courses with zero exam
 * entries are excluded so the GPA reflects entered marks only.
 */
export function computeGPA(courses: CoursePerformance[]): number {
  const graded = courses.filter((c) => c.examCount > 0);
  if (graded.length === 0) return 0;
  const totalCredits = graded.reduce((acc, c) => acc + (c.creditHours ?? 3), 0);
  if (totalCredits <= 0) return 0;
  const weighted = graded.reduce(
    (acc, c) => acc + c.gpaPoint * (c.creditHours ?? 3),
    0
  );
  return Math.round((weighted / totalCredits) * 100) / 100;
}

export interface GradeDistribution {
  letter: string;
  count: number;
}

/** Bucket raw results into UGC letters (for dept-wide charts) */
export function gradeDistribution(results: RawResult[]): GradeDistribution[] {
  const counts = new Map<string, number>();
  for (const band of UGC_SCALE) counts.set(band.letter, 0);
  for (const r of results) {
    const band = percentToGrade(resultPct(r));
    counts.set(band.letter, (counts.get(band.letter) ?? 0) + 1);
  }
  return UGC_SCALE.map((b) => ({ letter: b.letter, count: counts.get(b.letter) ?? 0 }));
}

/** Pass rate: percentage of results at D or above (>= 40%) */
export function passRate(results: RawResult[]): number {
  if (results.length === 0) return 0;
  const passed = results.filter((r) => resultPct(r) >= 40).length;
  return Math.round((passed / results.length) * 100);
}

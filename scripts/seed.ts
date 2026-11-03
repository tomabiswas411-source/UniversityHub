/**
 * UniversityHub — Database Seed Script
 * Seeds the remote Turso database with realistic demo data.
 * Usage: bun scripts/seed.ts
 *
 * WARNING: This wipes all existing data first (idempotent re-seed).
 */
import { PrismaClient, type User, type Course, type Room, type TimeSlot } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

// ---------- DB client (same logic as src/lib/db.ts) ----------
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = url && authToken
  ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken }) })
  : (() => {
      console.warn("[seed] TURSO env vars not set — seeding local SQLite file.");
      return new PrismaClient();
    })();

const PW_STAFF = await bcrypt.hash("Admin@2025", 10); // super admin
const PW_HEAD = await bcrypt.hash("Head@2025", 10);
const PW_TEACHER = await bcrypt.hash("Teacher@2025", 10);

const DAYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];

async function wipe() {
  // FK-safe order
  await db.notification.deleteMany();
  await db.result.deleteMany();
  await db.assignment.deleteMany();
  await db.scheduleChange.deleteMany();
  await db.schedule.deleteMany();
  await db.notice.deleteMany();
  await db.academicCalendar.deleteMany();
  await db.siteSettings.deleteMany();
  await db.course.deleteMany();
  await db.room.deleteMany();
  await db.timeSlot.deleteMany();
  await db.program.deleteMany();
  await db.user.deleteMany();
  await db.department.deleteMany();
  await db.university.deleteMany();
  await db.plan.deleteMany();
  console.log("✓ Wiped existing data");
}

async function seedPlans() {
  const plans = [
    {
      name: "Free",
      slug: "free",
      tagline: "Perfect for getting started",
      priceMonthly: 0,
      priceYearly: 0,
      maxDepartments: 2,
      maxStudents: 100,
      maxTeachers: 10,
      sortOrder: 1,
      features: JSON.stringify([
        "Up to 2 departments",
        "100 students",
        "Class routines & notices",
        "Basic notifications",
        "Community support",
      ]),
    },
    {
      name: "Basic",
      slug: "basic",
      tagline: "For small universities",
      priceMonthly: 49,
      priceYearly: 490,
      maxDepartments: 5,
      maxStudents: 1000,
      maxTeachers: 50,
      sortOrder: 2,
      features: JSON.stringify([
        "Up to 5 departments",
        "1,000 students",
        "Everything in Free",
        "PWA mobile app",
        "Real-time notifications + sound",
        "Assignments & results",
        "Email support",
      ]),
    },
    {
      name: "Standard",
      slug: "standard",
      tagline: "Most popular choice",
      priceMonthly: 99,
      priceYearly: 990,
      maxDepartments: 15,
      maxStudents: 5000,
      maxTeachers: 200,
      sortOrder: 3,
      features: JSON.stringify([
        "Up to 15 departments",
        "5,000 students",
        "Everything in Basic",
        "Academic calendar",
        "Advanced analytics",
        "Priority support",
        "Custom branding",
      ]),
    },
    {
      name: "Premium",
      slug: "premium",
      tagline: "For large institutions",
      priceMonthly: 199,
      priceYearly: 1990,
      maxDepartments: -1,
      maxStudents: -1,
      maxTeachers: -1,
      sortOrder: 4,
      features: JSON.stringify([
        "Unlimited departments",
        "Unlimited students",
        "Everything in Standard",
        "Dedicated account manager",
        "Custom integrations",
        "24/7 phone support",
        "SLA guarantee",
      ]),
    },
  ];
  for (const p of plans) await db.plan.create({ data: p });
  console.log("✓ 4 subscription plans created");
}

async function seedUniversityAndDepartments() {
  const standard = await db.plan.findUnique({ where: { slug: "standard" } });

  const ru = await db.university.create({
    data: {
      name: "University of Rajshahi",
      slug: "ru",
      shortName: "RU",
      address: "Rajshahi-6205, Bangladesh",
      contactEmail: "info@ru.ac.bd",
      contactPhone: "+880-741-7550",
      websiteURL: "https://www.ru.ac.bd",
      aboutText:
        "University of Rajshahi is one of the largest and premier public universities in Bangladesh, known for excellence in education and research.",
      planId: standard?.id,
    },
  });

  const ice = await db.department.create({
    data: {
      universityId: ru.id,
      name: "Information & Communication Engineering",
      shortName: "ICE",
      code: "ICE",
      building: "ICE Building, Dean Complex",
      contactEmail: "ice@ru.ac.bd",
      contactPhone: "+880-1521706294",
      description:
        "The Department of Information & Communication Engineering blends computer science, electronics and communication technologies to produce skilled engineers.",
    },
  });

  const cse = await db.department.create({
    data: {
      universityId: ru.id,
      name: "Computer Science & Engineering",
      shortName: "CSE",
      code: "CSE",
      building: "CSE Building, Science Complex",
      contactEmail: "cse@ru.ac.bd",
      description:
        "The Department of CSE offers modern computing education covering software engineering, AI, and systems.",
    },
  });

  const math = await db.department.create({
    data: {
      universityId: ru.id,
      name: "Mathematics",
      shortName: "MATH",
      code: "MATH",
      building: "Science Building",
      contactEmail: "math@ru.ac.bd",
      description:
        "The Department of Mathematics is dedicated to pure and applied mathematics research and teaching.",
    },
  });

  // Programs
  const iceBsc = await db.program.create({
    data: { departmentId: ice.id, name: "Bachelor of Science (Honours)", shortName: "BSc", semesterCount: 8 },
  });
  const iceMsc = await db.program.create({
    data: { departmentId: ice.id, name: "Master of Science", shortName: "MSc", semesterCount: 3 },
  });
  const cseBsc = await db.program.create({
    data: { departmentId: cse.id, name: "Bachelor of Science (Honours)", shortName: "BSc", semesterCount: 8 },
  });
  const mathBsc = await db.program.create({
    data: { departmentId: math.id, name: "Bachelor of Science (Honours)", shortName: "BSc", semesterCount: 8 },
  });

  console.log("✓ University (RU) + 3 departments + 4 programs created");
  return { ru, ice, cse, math, iceBsc, iceMsc, cseBsc, mathBsc };
}

async function seedUsers(ctx: Awaited<ReturnType<typeof seedUniversityAndDepartments>>) {
  const { ru, ice, cse, math, iceBsc, cseBsc, mathBsc } = ctx;

  // ---- Platform Super Admin (no university) ----
  await db.user.create({
    data: {
      role: "super_admin",
      fullName: "System Manager",
      email: "admin@universityhub.com",
      password: PW_STAFF,
      designation: "Platform Administrator",
    },
  });

  // ---- Department Heads ----
  await db.user.create({
    data: {
      universityId: ru.id,
      departmentId: ice.id,
      role: "dept_admin",
      fullName: "Prof. Dr. Ahsan Habib",
      email: "head.ice@ru.ac.bd",
      password: PW_HEAD,
      designation: "Department Head & Professor",
      officeRoom: "ICE-501",
      phone: "+8801711000001",
    },
  });
  await db.user.create({
    data: {
      universityId: ru.id,
      departmentId: cse.id,
      role: "dept_admin",
      fullName: "Prof. Dr. Nurul Islam",
      email: "head.cse@ru.ac.bd",
      password: PW_HEAD,
      designation: "Department Head & Professor",
      officeRoom: "CSE-401",
    },
  });
  await db.user.create({
    data: {
      universityId: ru.id,
      departmentId: math.id,
      role: "dept_admin",
      fullName: "Dr. Salma Khatun",
      email: "head.math@ru.ac.bd",
      password: PW_HEAD,
      designation: "Department Head & Associate Professor",
      officeRoom: "MATH-202",
    },
  });

  // ---- ICE Teachers ----
  const iceTeachersData = [
    { fullName: "Dr. Md. Abdur Rahman", designation: "Professor", officeRoom: "ICE-401" },
    { fullName: "Dr. Samira Begum", designation: "Associate Professor", officeRoom: "ICE-402" },
    { fullName: "Tanvir Ahmed", designation: "Assistant Professor", officeRoom: "ICE-403" },
    { fullName: "Nusrat Jahan", designation: "Lecturer", officeRoom: "ICE-404" },
    { fullName: "Mahmudul Hasan", designation: "Lecturer", officeRoom: "ICE-405" },
  ];
  const iceTeachers: User[] = [];
  for (let i = 0; i < iceTeachersData.length; i++) {
    const t = iceTeachersData[i];
    iceTeachers.push(
      await db.user.create({
        data: {
          universityId: ru.id,
          departmentId: ice.id,
          role: "teacher",
          fullName: t.fullName,
          email: `teacher${i + 1}.ice@ru.ac.bd`,
          password: PW_TEACHER,
          designation: t.designation,
          officeRoom: t.officeRoom,
          bio: `${t.designation} at ICE, University of Rajshahi.`,
        },
      })
    );
  }

  // ---- CSE Teachers ----
  const cseTeachers: User[] = [];
  const cseTeachersData = [
    { fullName: "Dr. Kamrul Hasan", designation: "Professor" },
    { fullName: "Rashida Akter", designation: "Assistant Professor" },
    { fullName: "Imran Kabir", designation: "Lecturer" },
  ];
  for (let i = 0; i < cseTeachersData.length; i++) {
    const t = cseTeachersData[i];
    cseTeachers.push(
      await db.user.create({
        data: {
          universityId: ru.id,
          departmentId: cse.id,
          role: "teacher",
          fullName: t.fullName,
          email: `teacher${i + 1}.cse@ru.ac.bd`,
          password: PW_TEACHER,
          designation: t.designation,
        },
      })
    );
  }

  // ---- MATH Teachers ----
  const mathTeachers: User[] = [];
  for (let i = 0; i < 2; i++) {
    mathTeachers.push(
      await db.user.create({
        data: {
          universityId: ru.id,
          departmentId: math.id,
          role: "teacher",
          fullName: i === 0 ? "Dr. Farhana Yasmin" : "Abdul Karim",
          email: `teacher${i + 1}.math@ru.ac.bd`,
          password: PW_TEACHER,
          designation: i === 0 ? "Professor" : "Assistant Professor",
        },
      })
    );
  }

  // ---- Students (ICE: 6, CSE: 3, MATH: 2) ----
  const students: User[] = [];
  const studentPlan = [
    { dept: ice, program: iceBsc, count: 6, prefix: 21, idBase: 2103001, rollBase: 2103001, section: "A" },
    { dept: cse, program: cseBsc, count: 3, prefix: 21, idBase: 2105001, rollBase: 2105001, section: "A" },
    { dept: math, program: mathBsc, count: 2, prefix: 21, idBase: 2107001, rollBase: 2107001, section: "B" },
  ];
  const studentNames = [
    "Topu Biswas", "Sadia Afrin", "Rakib Hossain", "Mehedi Hasan",
    "Tasnim Rahman", "Arif Chowdhury", "Lima Akter", "Sohan Mahmud",
    "Jannatul Ferdous", "Rasel Mia", "Priya Sarker", "Naeem Uddin",
  ];
  let nameIdx = 0;
  for (const sp of studentPlan) {
    for (let i = 0; i < sp.count; i++) {
      const idNumber = String(sp.idBase + i);
      const roll = String(sp.rollBase + i);
      students.push(
        await db.user.create({
          data: {
            universityId: ru.id,
            departmentId: sp.dept.id,
            role: "student",
            fullName: studentNames[nameIdx++ % studentNames.length],
            studentIdNumber: idNumber,
            rollNumber: roll,
            programId: sp.program.id,
            semester: 1,
            section: sp.section,
            designation: "Student",
          },
        })
      );
    }
  }

  console.log(
    `✓ Users created: 1 super admin, 3 heads, ${iceTeachers.length + cseTeachers.length + mathTeachers.length} teachers, ${students.length} students`
  );
  return { iceTeachers, cseTeachers, mathTeachers, students };
}

async function seedAcademics(
  ctx: Awaited<ReturnType<typeof seedUniversityAndDepartments>>,
  users: Awaited<ReturnType<typeof seedUsers>>
) {
  const { ice, cse, math, iceBsc, iceMsc, cseBsc, mathBsc } = ctx;

  // ---- Courses ----
  const iceCoursesData = [
    { code: "ICE-1101", name: "Digital Electronics", creditHours: 3, type: "theory", semester: 1, programId: iceBsc.id },
    { code: "ICE-1102", name: "Programming Fundamentals", creditHours: 3, type: "theory", semester: 1, programId: iceBsc.id },
    { code: "ICE-1103", name: "Electrical Circuits", creditHours: 3, type: "theory", semester: 1, programId: iceBsc.id },
    { code: "ICE-1104", name: "Programming Lab", creditHours: 1.5, type: "lab", semester: 1, programId: iceBsc.id },
    { code: "ICE-2101", name: "Data Structures", creditHours: 3, type: "theory", semester: 2, programId: iceBsc.id },
    { code: "ICE-2102", name: "Digital Logic Design", creditHours: 3, type: "theory", semester: 2, programId: iceBsc.id },
    { code: "ICE-5101", name: "Advanced Algorithms", creditHours: 3, type: "theory", semester: 1, programId: iceMsc.id },
    { code: "ICE-5102", name: "Machine Learning", creditHours: 3, type: "theory", semester: 1, programId: iceMsc.id },
  ];
  const iceCourses: Course[] = [];
  for (const c of iceCoursesData) {
    iceCourses.push(await db.course.create({ data: { ...c, departmentId: ice.id } }));
  }

  const cseCoursesData = [
    { code: "CSE-1101", name: "Introduction to Computing", creditHours: 3, type: "theory", semester: 1, programId: cseBsc.id },
    { code: "CSE-1102", name: "Structured Programming", creditHours: 3, type: "theory", semester: 1, programId: cseBsc.id },
    { code: "CSE-1104", name: "Programming Lab", creditHours: 1.5, type: "lab", semester: 1, programId: cseBsc.id },
  ];
  const cseCourses: Course[] = [];
  for (const c of cseCoursesData) {
    cseCourses.push(await db.course.create({ data: { ...c, departmentId: cse.id } }));
  }

  const mathCourses: Course[] = [];
  const mathCoursesData = [
    { code: "MATH-1101", name: "Calculus", creditHours: 4, type: "theory", semester: 1, programId: mathBsc.id },
    { code: "MATH-1102", name: "Linear Algebra", creditHours: 3, type: "theory", semester: 1, programId: mathBsc.id },
  ];
  for (const c of mathCoursesData) {
    mathCourses.push(await db.course.create({ data: { ...c, departmentId: math.id } }));
  }

  // ---- Rooms ----
  const iceRoomsData = [
    { roomNumber: "301", type: "classroom", capacity: 50 },
    { roomNumber: "302", type: "classroom", capacity: 50 },
    { roomNumber: "Lab-1", type: "lab", capacity: 30 },
    { roomNumber: "Lab-2", type: "lab", capacity: 30 },
  ];
  const iceRooms: Room[] = [];
  for (const r of iceRoomsData) {
    iceRooms.push(await db.room.create({ data: { ...r, departmentId: ice.id, building: "ICE Building" } }));
  }
  const cseRooms: Room[] = [];
  for (const r of [
    { roomNumber: "201", type: "classroom", capacity: 45 },
    { roomNumber: "Lab-1", type: "lab", capacity: 35 },
  ]) {
    cseRooms.push(await db.room.create({ data: { ...r, departmentId: cse.id, building: "CSE Building" } }));
  }
  const mathRooms = [
    await db.room.create({ data: { roomNumber: "105", type: "classroom", capacity: 60, departmentId: math.id, building: "Science Building" } }),
  ];

  // ---- TimeSlots (shared pattern per department) ----
  async function makeSlots(departmentId: string) {
    const slotDefs = [
      { label: "1st Period", startTime: "08:00", endTime: "08:50", slotOrder: 1 },
      { label: "2nd Period", startTime: "09:00", endTime: "09:50", slotOrder: 2 },
      { label: "3rd Period", startTime: "10:00", endTime: "10:50", slotOrder: 3 },
      { label: "4th Period", startTime: "11:00", endTime: "11:50", slotOrder: 4 },
      { label: "Lunch Break", startTime: "12:00", endTime: "13:00", slotOrder: 5, isBreak: true },
      { label: "5th Period", startTime: "13:00", endTime: "13:50", slotOrder: 6 },
      { label: "6th Period", startTime: "14:00", endTime: "14:50", slotOrder: 7 },
    ];
    const slots: TimeSlot[] = [];
    for (const s of slotDefs) slots.push(await db.timeSlot.create({ data: { ...s, departmentId } }));
    return slots;
  }
  const iceSlots = await makeSlots(ice.id);
  const cseSlots = await makeSlots(cse.id);
  const mathSlots = await makeSlots(math.id);

  console.log("✓ Courses, rooms & time slots created");

  return { iceCourses, cseCourses, mathCourses, iceRooms, cseRooms, mathRooms, iceSlots, cseSlots, mathSlots };
}

async function seedSchedules(
  ctx: Awaited<ReturnType<typeof seedUniversityAndDepartments>>,
  users: Awaited<ReturnType<typeof seedUsers>>,
  academics: Awaited<ReturnType<typeof seedAcademics>>
) {
  const { ice, cse, math, iceBsc, iceMsc, cseBsc, mathBsc } = ctx;
  const { iceTeachers, cseTeachers, mathTeachers } = users;
  const { iceCourses, cseCourses, mathCourses, iceRooms, cseRooms, mathRooms, iceSlots, cseSlots, mathSlots } = academics;

  let total = 0;
  const busyTeacher = new Set<string>(); // `${teacherId}|${day}|${slotIdx}`
  const busyRoom = new Set<string>(); // `${roomId}|${day}|${slotIdx}`

  async function place(
    departmentId: string,
    programId: string,
    semester: number,
    course: { id: string; code: string; name: string; type: string },
    teachers: { id: string; fullName: string }[],
    rooms: { id: string; roomNumber: string }[],
    slots: { id: string; startTime: string; endTime: string; isBreak: boolean }[],
    day: string,
    slotIdx: number,
    createdById: string
  ): Promise<boolean> {
    const slot = slots[slotIdx];
    if (!slot || slot.isBreak) return false;

    // find free teacher (prefer one whose subject area fits by round robin)
    let chosenTeacher: { id: string; fullName: string } | null = null;
    for (const t of teachers) {
      const key = `${t.id}|${day}|${slotIdx}`;
      if (!busyTeacher.has(key)) {
        chosenTeacher = t;
        break;
      }
    }
    if (!chosenTeacher) return false;

    // find free room — labs need lab rooms
    let chosenRoom: { id: string; roomNumber: string } | null = null;
    for (const r of rooms) {
      const key = `${r.id}|${day}|${slotIdx}`;
      const isLabRoom = r.roomNumber.toLowerCase().includes("lab");
      if (course.type === "lab" && !isLabRoom) continue;
      if (course.type !== "lab" && isLabRoom) continue;
      if (!busyRoom.has(key)) {
        chosenRoom = r;
        break;
      }
    }
    if (!chosenRoom) return false;

    busyTeacher.add(`${chosenTeacher.id}|${day}|${slotIdx}`);
    busyRoom.add(`${chosenRoom.id}|${day}|${slotIdx}`);

    await db.schedule.create({
      data: {
        departmentId,
        programId,
        semester,
        courseId: course.id,
        teacherId: chosenTeacher.id,
        roomId: chosenRoom.id,
        timeSlotId: slot.id,
        courseCode: course.code,
        courseName: course.name,
        teacherName: chosenTeacher.fullName,
        roomNumber: chosenRoom.roomNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        dayOfWeek: day,
        classType: course.type === "lab" ? "lab" : "theory",
        createdBy: createdById,
      },
    });
    total++;
    return true;
  }

  // ICE heads create their own schedules
  const iceHead = await db.user.findFirst({ where: { departmentId: ice.id, role: "dept_admin" } });
  const cseHead = await db.user.findFirst({ where: { departmentId: cse.id, role: "dept_admin" } });
  const mathHead = await db.user.findFirst({ where: { departmentId: math.id, role: "dept_admin" } });

  // --- ICE BSc 1st semester: 3 classes/day on 5 days ---
  const ice1 = iceCourses.filter((c) => c.semester === 1 && c.programId === iceBsc.id);
  const ice1Grid: [number, number][] = [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 2], [1, 3],
    [2, 1], [2, 2],
    [3, 0], [3, 1], [3, 3],
    [4, 0], [4, 2],
  ];
  let ci = 0;
  for (const [dayIdx, slotIdx] of ice1Grid) {
    const course = ice1[ci % ice1.length];
    await place(ice.id, iceBsc.id, 1, course, iceTeachers, iceRooms, iceSlots, DAYS[dayIdx], slotIdx, iceHead!.id);
    ci++;
  }

  // --- ICE BSc 2nd semester ---
  const ice2 = iceCourses.filter((c) => c.semester === 2);
  const ice2Grid: [number, number][] = [
    [0, 1], [0, 3], [1, 1], [2, 0], [2, 3], [3, 2], [4, 1],
  ];
  ci = 0;
  for (const [dayIdx, slotIdx] of ice2Grid) {
    const course = ice2[ci % ice2.length];
    await place(ice.id, iceBsc.id, 2, course, iceTeachers, iceRooms, iceSlots, DAYS[dayIdx], slotIdx, iceHead!.id);
    ci++;
  }

  // --- ICE MSc 1st semester ---
  const iceM = iceCourses.filter((c) => c.programId === iceMsc.id);
  const iceMGrid: [number, number][] = [[0, 0], [0, 2], [1, 3], [3, 0], [4, 3]];
  ci = 0;
  for (const [dayIdx, slotIdx] of iceMGrid) {
    const course = iceM[ci % iceM.length];
    await place(ice.id, iceMsc.id, 1, course, iceTeachers, iceRooms, iceSlots, DAYS[dayIdx], slotIdx, iceHead!.id);
    ci++;
  }

  // --- CSE BSc 1st semester ---
  const cseGrid: [number, number][] = [[0, 0], [0, 1], [1, 2], [2, 0], [3, 1], [4, 0]];
  ci = 0;
  for (const [dayIdx, slotIdx] of cseGrid) {
    const course = cseCourses[ci % cseCourses.length];
    await place(cse.id, cseBsc.id, 1, course, cseTeachers, cseRooms, cseSlots, DAYS[dayIdx], slotIdx, cseHead!.id);
    ci++;
  }

  // --- MATH BSc 1st semester ---
  const mathGrid: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
  ci = 0;
  for (const [dayIdx, slotIdx] of mathGrid) {
    const course = mathCourses[ci % mathCourses.length];
    await place(math.id, mathBsc.id, 1, course, mathTeachers, mathRooms, mathSlots, DAYS[dayIdx], slotIdx, mathHead!.id);
    ci++;
  }

  console.log(`✓ ${total} schedules created (conflict-free)`);
  return total;
}

async function seedContent(
  ctx: Awaited<ReturnType<typeof seedUniversityAndDepartments>>,
  users: Awaited<ReturnType<typeof seedUsers>>,
  academics: Awaited<ReturnType<typeof seedAcademics>>
) {
  const { ru, ice, cse, math, iceBsc } = ctx;
  const { iceTeachers, students } = users;
  const { iceCourses } = academics;

  const iceHead = await db.user.findFirst({ where: { departmentId: ice.id, role: "dept_admin" } });
  const cseHead = await db.user.findFirst({ where: { departmentId: cse.id, role: "dept_admin" } });

  // ---- Site settings ----
  await db.siteSettings.create({
    data: {
      universityId: ru.id,
      siteName: "UniversityHub",
      heroText: "One platform for every department — classes, notices, results and more.",
      academicSession: "Academic Session 2025",
      contactEmail: "info@ru.ac.bd",
      contactPhone: "+880-741-7550",
      address: "Rajshahi-6205, Bangladesh",
      aboutText:
        "UniversityHub is the official academic management platform of University of Rajshahi — bringing every department's routine, notices and academic services into one place.",
      developerName: "Topu Biswas (AI)",
    },
  });

  // ---- Notices ----
  await db.notice.create({
    data: {
      departmentId: ice.id,
      title: "Welcome to the New Academic Session 2025",
      content:
        "All students and teachers of the ICE Department are warmly welcomed to the academic session 2025. Classes begin from Saturday. Please check your weekly routine on this platform regularly.",
      category: "general",
      audience: "all",
      postedBy: iceHead!.id,
      postedByName: iceHead!.fullName,
      isPinned: true,
    },
  });
  await db.notice.create({
    data: {
      departmentId: ice.id,
      title: "Mid-Term Examination Schedule Published",
      content:
        "The mid-term examination for 1st semester BSc will start from next Sunday. Exam schedule: 10:00 AM - 11:30 AM. Detailed seat plan will be published soon on the notice board.",
      category: "exam",
      audience: "students",
      programId: iceBsc.id,
      semester: 1,
      postedBy: iceHead!.id,
      postedByName: iceHead!.fullName,
    },
  });
  await db.notice.create({
    data: {
      departmentId: ice.id,
      title: "ICE-1104 Lab Class Moved to Lab-2",
      content: "This week's Programming Lab (ICE-1104) will be held in Lab-2 instead of Lab-1 due to maintenance work.",
      category: "academic",
      audience: "students",
      programId: iceBsc.id,
      semester: 1,
      postedBy: iceHead!.id,
      postedByName: iceHead!.fullName,
    },
  });
  await db.notice.create({
    data: {
      departmentId: cse.id,
      title: "CSE Freshers' Orientation Program",
      content: "The orientation program for newly admitted CSE students will be held next Thursday at 10 AM in the CSE seminar hall.",
      category: "event",
      audience: "all",
      postedBy: cseHead!.id,
      postedByName: cseHead!.fullName,
    },
  });

  // ---- Academic calendar ----
  const now = new Date();
  const cal = [
    { title: "Mid-Term Examination Begins", days: 7, eventType: "exam" },
    { title: "Eid-ul-Fitr Holiday (University Closed)", days: 21, eventType: "holiday" },
    { title: "Final Examination Form Fill-up Deadline", days: 35, eventType: "exam" },
    { title: "Annual Sports Competition", days: 45, eventType: "event" },
  ];
  for (const c of cal) {
    const d = new Date(now.getTime() + c.days * 24 * 60 * 60 * 1000);
    await db.academicCalendar.create({
      data: {
        universityId: ru.id,
        title: c.title,
        date: d,
        eventType: c.eventType,
        description: `${c.eventType === "exam" ? "Examination" : "Event"} scheduled for the session 2025.`,
      },
    });
  }

  // ---- Assignments ----
  const progCourse = iceCourses.find((c) => c.code === "ICE-1102")!;
  await db.assignment.create({
    data: {
      departmentId: ice.id,
      courseId: progCourse.id,
      teacherId: iceTeachers[1].id,
      title: "Assignment 1: Basic C Programs",
      description:
        "Write C programs for the following problems: 1) Fibonacci series, 2) Prime number check, 3) Matrix multiplication. Submit printed hard copy in class.",
      dueDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
      maxMarks: 20,
    },
  });
  await db.assignment.create({
    data: {
      departmentId: ice.id,
      courseId: progCourse.id,
      teacherId: iceTeachers[1].id,
      title: "Lab Report: Loop Programs",
      description: "Submit lab report covering all loop-based experiments performed in weeks 1-3.",
      dueDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      maxMarks: 15,
    },
  });

  // ---- Results (CT1 for ICE-1101) ----
  const digitalCourse = iceCourses.find((c) => c.code === "ICE-1101")!;
  const iceStudents = students.filter((s) => s.departmentId === ice.id);
  const marks = [17.5, 15, 19, 12.5, 16, 18];
  for (let i = 0; i < Math.min(iceStudents.length, marks.length); i++) {
    const m = marks[i];
    await db.result.create({
      data: {
        departmentId: ice.id,
        courseId: digitalCourse.id,
        studentId: iceStudents[i].id,
        enteredBy: iceTeachers[0].id,
        examType: "ct1",
        marks: m,
        maxMarks: 20,
        grade: m >= 16 ? "A" : m >= 14 ? "A-" : m >= 12 ? "B" : "B-",
      },
    });
  }

  // ---- Notifications for ICE students ----
  for (const s of iceStudents.slice(0, 4)) {
    await db.notification.create({
      data: {
        userId: s.id,
        title: "Welcome to UniversityHub 🎓",
        body: "Your department's routine, notices and updates are now in one place. You will get instant notifications here.",
        type: "general",
      },
    });
    await db.notification.create({
      data: {
        userId: s.id,
        title: "New Assignment: Basic C Programs",
        body: "ICE-1102 — Assignment 1 has been published. Due in 10 days. Check your dashboard for details.",
        type: "assignment",
      },
    });
  }

  console.log("✓ Settings, notices, calendar, assignments, results & notifications seeded");
}

async function main() {
  console.log("🌱 Seeding UniversityHub (Turso)...");
  await wipe();
  await seedPlans();
  const ctx = await seedUniversityAndDepartments();
  const users = await seedUsers(ctx);
  const academics = await seedAcademics(ctx, users);
  await seedSchedules(ctx, users, academics);
  await seedContent(ctx, users, academics);

  const counts = {
    universities: await db.university.count(),
    departments: await db.department.count(),
    users: await db.user.count(),
    courses: await db.course.count(),
    schedules: await db.schedule.count(),
    notices: await db.notice.count(),
    notifications: await db.notification.count(),
  };
  console.log("📊 Final counts:", counts);
  console.log("✅ Seed complete!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

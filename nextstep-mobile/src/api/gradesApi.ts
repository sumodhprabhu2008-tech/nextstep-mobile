import { apiFetch } from '../utils/api'

export interface GradeData {
  letterGrade: string
  percentage: number
  gradingPeriod: string
}

export interface CourseWithGrade {
  id: number
  name: string
  teacher: string
  period: number
  courseType: string
  creditHours: number
  semester: string
  grade: GradeData | null
}

export interface GpaData {
  weighted: number
  unweighted: number
}

interface GradesApiResponse {
  data: {
    gpa: GpaData | null
    courses: CourseWithGrade[]
  }
}

export async function fetchGrades(): Promise<GradesApiResponse['data']> {
  const res = await apiFetch<GradesApiResponse>('/grades')
  return res.data
}

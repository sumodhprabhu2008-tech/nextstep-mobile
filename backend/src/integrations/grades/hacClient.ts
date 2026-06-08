/**
 * HAC (Home Access Center) scraping client.
 * Adapted from https://github.com/ruskcoder/gradexis-api (hac/ and hac-v2/ folders).
 * All Gradexis-specific branding, push notifications, and referral logic removed.
 */
import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import * as cheerio from 'cheerio'
import { saveSession, getSessionByToken, StoredSession } from './sessionStore'

export interface HACClass {
  name: string
  period: string
  teacher: string
  room: string
  average: string | null
  scores: HACScore[]
}

export interface HACScore {
  name: string
  category: string
  score: number | null
  totalPoints: number | null
  percentage: string
  dateDue: string
}

export interface HACStudentInfo {
  name: string
  grade: string
  school: string
  district: string
  counselor: string
  cohortYear: string
}

export interface HACTranscriptEntry {
  year: string
  semester: string
  courses: Array<{ name: string; grade: string; credits: string }>
}

export interface HACTranscript {
  semesters: HACTranscriptEntry[]
  cumulativeGPA: string | null
  classRank: string | null
}

// ── Session helpers ────────────────────────────────────────────────────────────


function makeAxiosSession() {
  const jar = new CookieJar()

  return {
    jar,
    http: wrapper(
      axios.create({
        withCredentials: true,
        jar,
        timeout: 20_000,
        maxRedirects: 10,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      })
    ),
  }
}

function serializeJar(jar: CookieJar): string {
  return JSON.stringify(jar.toJSON())
}

function deserializeJar(raw: string): CookieJar {
  return CookieJar.fromJSON(JSON.parse(raw)) as CookieJar
}

function restoreSession(stored: StoredSession) {
  const jar = deserializeJar(stored.sessionData)

  const http = wrapper(
    axios.create({
      withCredentials: true,
      jar,
      timeout: 20_000,
      maxRedirects: 10,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })
  )

  return { jar, http }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : url + '/'
}

// ── Auth ───────────────────────────────────────────────────────────────────────

/**
 * Log in to a HAC instance.
 * @param baseUrl  e.g. "https://hac.mydistrict.edu/"
 * @param username Student portal username
 * @param password Student portal password  (never stored — only the resulting session cookie is kept)
 * @param clsessionCookie Optional ClassLink session token (see classLinkHelper.ts)
 * @param userId NextStep user ID — used to key the server-side session
 * @returns sessionToken — a short-lived UUID that represents this school session
 */
export async function loginHAC(
  baseUrl: string,
  username: string,
  password: string,
  userId: number,
  clsessionCookie?: string
): Promise<string> {
  const link = normalizeBaseUrl(baseUrl)
  const { jar, http } = makeAxiosSession()

  // Inject ClassLink cookie before hitting the HAC login page when the district
  // uses ClassLink SSO. The browser extension in gradexis-login extracts this
  // cookie; we just inject it into the request jar.
  if (clsessionCookie) {
    await jar.setCookie(`clsession=${clsessionCookie}; Domain=.classlink.com; Path=/`, 'https://classlink.com')
  }

  // Step 1 — fetch the login page to get the CSRF verification token
  const loginPageUrl = `${link}HomeAccess/Account/LogOn`
  let loginPageHtml: string
  try {
    const res = await http.get(loginPageUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    })
    loginPageHtml = res.data as string
  } catch (err: unknown) {
    const detail = err instanceof Error ? ` (${err.message})` : ''
    const code = (err as { code?: string }).code ?? ''
    if (code === 'ENOTFOUND') {
      throw new Error(`Cannot reach ${baseUrl} — the district URL does not exist. Check the URL is correct.`)
    }
    if (code === 'ECONNREFUSED') {
      throw new Error(`Connection refused at ${baseUrl} — district URL may be incorrect`)
    }
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
      throw new Error(`Connection timed out reaching ${baseUrl} — HAC server may be slow or down`)
    }
    throw new Error(`Could not reach HAC at ${baseUrl}${detail}`)
  }

  const $ = cheerio.load(loginPageHtml)
  const verificationToken = $("input[name='__RequestVerificationToken']").val() as string | undefined
  if (!verificationToken) {
    throw new Error('Could not find login form on the HAC page — district URL may be wrong')
  }

  // Step 2 — submit credentials
  const formData = new URLSearchParams({
    __RequestVerificationToken: verificationToken,
    SCKTY00328510CustomEnabled: 'False',
    SCKTY00436568CustomEnabled: 'False',
    Database: '10',
    VerificationOption: 'UsernamePassword',
    LogOnDetails_UserName: username,
    LogOnDetails_Password: password,
  })

  try {
    await http.post(loginPageUrl, formData.toString())
  } catch (err: unknown) {
    throw new Error('Login request failed — network error')
  }

  // Step 3 — verify the session by visiting a protected page
  try {
    const check = await http.get(`${link}HomeAccess/Content/Student/Registration.aspx`)
    const body = check.data as string
    if (body.includes('Welcome to') || body.includes('LogOn')) {
      throw new Error('Invalid credentials — login was rejected by HAC')
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Invalid credentials')) throw err
    // Some districts redirect differently; treat a non-error response as success
  }

  const sessionToken = saveSession(userId, 'HAC', link, serializeJar(jar))
  return sessionToken
}

// ── Data fetchers ──────────────────────────────────────────────────────────────

export async function getGrades(sessionToken: string): Promise<HACClass[]> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired or not found — please log in again')

  const { http } = restoreSession(stored)
  const link = stored.baseUrl

  const res = await http.get(`${link}HomeAccess/Content/Student/Assignments.aspx`)
  const $ = cheerio.load(res.data as string)

  const classes: HACClass[] = []

  $('.AssignmentClass').each((_i, el) => {
    const header = $(el).find('.sg-header .sg-header-heading').text().trim()
    const parts = header.split(' - ')
    const name = parts[0]?.trim() ?? header
    const period = $(el).find('.sg-header .sg-header-heading .sg-header-period').text().replace('Period', '').trim()
    const average = $(el).find('.sg-header .sg-header-heading .sg-header-average').text().replace('Student Avg:', '').trim() || null

    const scores: HACScore[] = []
    $(el).find('tr.sg-asp-table-data-row').each((_j, row) => {
      const cells = $(row).find('td')
      scores.push({
        name: cells.eq(0).text().trim(),
        dateDue: cells.eq(1).text().trim(),
        category: cells.eq(3).text().trim(),
        score: parseFloat(cells.eq(5).text()) || null,
        totalPoints: parseFloat(cells.eq(6).text()) || null,
        percentage: cells.eq(7).text().trim(),
      })
    })

    if (name) {
      classes.push({ name, period, teacher: '', room: '', average, scores })
    }
  })

  // Enrich with teacher/room from schedule page
  try {
    const schedRes = await http.get(`${link}HomeAccess/Content/Student/Classes.aspx`)
    const $s = cheerio.load(schedRes.data as string)
    $s('tr.sg-asp-table-data-row').each((_i, row) => {
      const cells = $s(row).find('td')
      const cn = cells.eq(1).text().trim()
      const teacher = cells.eq(3).find('a').text().trim() || cells.eq(3).text().trim()
      const room = cells.eq(4).text().trim()
      const match = classes.find(c => c.name === cn)
      if (match) { match.teacher = teacher; match.room = room }
    })
  } catch { /* schedule enrichment is best-effort */ }

  return classes
}

export async function getTranscript(sessionToken: string): Promise<HACTranscript> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired or not found — please log in again')

  const { http } = restoreSession(stored)
  const link = stored.baseUrl

  const res = await http.get(`${link}HomeAccess/Content/Student/Transcript.aspx`)
  const $ = cheerio.load(res.data as string)

  const semesters: HACTranscriptEntry[] = []

  $('td.sg-transcript-group').each((_i, group) => {
    const header = $(group).find('.sg-transcript-group-heading').text().trim()
    const yearMatch = header.match(/(\d{4})/)
    const semMatch = header.match(/Semester\s*(\d)/i)
    const courses: Array<{ name: string; grade: string; credits: string }> = []

    $(group).find('tr.sg-asp-table-data-row').each((_j, row) => {
      const cells = $(row).find('td')
      courses.push({
        name: cells.eq(0).text().trim(),
        grade: cells.eq(1).text().trim(),
        credits: cells.eq(2).text().trim(),
      })
    })

    semesters.push({
      year: yearMatch?.[1] ?? '',
      semester: semMatch?.[1] ?? '',
      courses,
    })
  })

  const gpaText = $('#plnMain_rpTranscriptGroup_tblCumGPAInfo').text()
  const gpaMatch = gpaText.match(/[\d.]+/)

  return {
    semesters,
    cumulativeGPA: gpaMatch?.[0] ?? null,
    classRank: null,
  }
}

export async function getSchedule(sessionToken: string): Promise<object[]> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired or not found — please log in again')

  const { http } = restoreSession(stored)
  const link = stored.baseUrl

  const res = await http.get(`${link}HomeAccess/Content/Student/Classes.aspx`)
  const $ = cheerio.load(res.data as string)

  const headers: string[] = []
  $('tr.sg-asp-table-header-row th').each((_i, th) => { headers.push($(th).text().trim()) })

  const schedule: object[] = []
  $('tr.sg-asp-table-data-row').each((_i, row) => {
    const entry: Record<string, string> = {}
    $(row).find('td').each((j, td) => {
      if (headers[j]) entry[headers[j]] = $(td).text().trim()
    })
    schedule.push(entry)
  })

  return schedule
}

export async function getStudentInfo(sessionToken: string): Promise<HACStudentInfo> {
  const stored = getSessionByToken(sessionToken)
  if (!stored) throw new Error('School session expired or not found — please log in again')

  const { http } = restoreSession(stored)
  const link = stored.baseUrl

  const res = await http.get(`${link}HomeAccess/Content/Student/Registration.aspx`)
  const $ = cheerio.load(res.data as string)

  return {
    name: $('#plnMain_lblRegStudentName').text().trim(),
    grade: $('#plnMain_lblGrade').text().trim(),
    school: $('#plnMain_lblBuildingName').text().trim(),
    district: $('span.sg-banner-text').first().text().trim(),
    counselor: $('#plnMain_lblCounselor').text().trim(),
    cohortYear: $('#plnMain_lblCohortYear').text().trim(),
  }
}

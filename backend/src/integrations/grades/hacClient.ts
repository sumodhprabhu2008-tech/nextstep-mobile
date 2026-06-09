/**
 * HAC (Home Access Center) scraping client.
 * Debug-friendly version for NextStep local beta.
 */

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
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

// ── Error helper ──────────────────────────────────────────────────────────────

function getAxiosErrorDetails(err: unknown): {
  message: string
  code?: string
  status?: number
  responseData?: unknown
  url?: string
  method?: string
} {
  const anyErr = err as {
    message?: string
    code?: string
    response?: {
      status?: number
      data?: unknown
    }
    config?: {
      url?: string
      method?: string
    }
  }

  return {
    message: anyErr?.message ?? 'Unknown error',
    code: anyErr?.code,
    status: anyErr?.response?.status,
    responseData: anyErr?.response?.data,
    url: anyErr?.config?.url,
    method: anyErr?.config?.method,
  }
}

function throwDetailedAxiosError(label: string, err: unknown): never {
  const details = getAxiosErrorDetails(err)

  console.error(`[HAC CLIENT] ${label} failed`, {
    message: details.message,
    code: details.code,
    status: details.status,
    url: details.url,
    method: details.method,
    responsePreview:
      typeof details.responseData === 'string'
        ? details.responseData.slice(0, 1000)
        : details.responseData,
  })

  if (details.code === 'ENOTFOUND') {
    throw new Error(`Cannot reach HAC URL. DNS lookup failed for ${details.url ?? 'unknown URL'}`)
  }

  if (details.code === 'ECONNREFUSED') {
    throw new Error(`Connection refused by HAC at ${details.url ?? 'unknown URL'}`)
  }

  if (details.code === 'ETIMEDOUT' || details.code === 'ECONNABORTED') {
    throw new Error(`Connection timed out while contacting HAC at ${details.url ?? 'unknown URL'}`)
  }

  if (details.status) {
    throw new Error(
      `HAC request failed with HTTP ${details.status} at ${details.url ?? 'unknown URL'}`,
    )
  }

  throw new Error(
    `HAC request failed: ${details.message}${details.code ? ` (${details.code})` : ''}`,
  )
}

// ── Session helpers ───────────────────────────────────────────────────────────

function attachCookieJar(client: AxiosInstance, jar: CookieJar): void {
  client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? ''
    const cookies = await jar.getCookies(url)
    if (cookies.length > 0) {
      config.headers['Cookie'] = cookies.map(c => `${c.key}=${c.value}`).join('; ')
    }
    return config
  })

  client.interceptors.response.use(async response => {
    const setCookieHeader = response.headers['set-cookie']
    const url = (response.config as { url?: string }).url ?? ''
    if (setCookieHeader) {
      const entries = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
      for (const raw of entries) {
        try { await jar.setCookie(raw, url) } catch { /* ignore invalid cookies */ }
      }
    }
    return response
  })
}

function makeAxiosSession(): { jar: CookieJar; http: AxiosInstance } {
  const jar = new CookieJar()

  const client = axios.create({
    timeout: 30_000,
    maxRedirects: 10,
    validateStatus: status => status >= 200 && status < 500,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  attachCookieJar(client, jar)
  return { jar, http: client }
}

function serializeJar(jar: CookieJar): string {
  return JSON.stringify(jar.toJSON())
}

function deserializeJar(raw: string): CookieJar {
  return CookieJar.fromJSON(JSON.parse(raw)) as CookieJar
}

function restoreSession(stored: StoredSession): { jar: CookieJar; http: AxiosInstance } {
  const jar = deserializeJar(stored.sessionData)

  const client = axios.create({
    timeout: 30_000,
    maxRedirects: 10,
    validateStatus: status => status >= 200 && status < 500,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  attachCookieJar(client, jar)
  return { jar, http: client }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function getFormAction($: cheerio.CheerioAPI, fallbackUrl: string, link: string): string {
  const action = $('form').first().attr('action')

  if (!action) return fallbackUrl

  if (action.startsWith('http://') || action.startsWith('https://')) {
    return action
  }

  if (action.startsWith('/')) {
    return `${link.replace(/\/$/, '')}${action}`
  }

  return `${link}${action}`
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export async function loginHAC(
  baseUrl: string,
  username: string,
  password: string,
  userId: number,
  clsessionCookie?: string,
): Promise<string> {
  const link = normalizeBaseUrl(baseUrl)
  const { jar, http } = makeAxiosSession()

  console.log('[HAC CLIENT] loginHAC started', {
    baseUrl,
    link,
    userId,
    usernameExists: Boolean(username),
    passwordExists: Boolean(password),
    hasClSessionCookie: Boolean(clsessionCookie),
  })

  if (clsessionCookie) {
    await jar.setCookie(
      `clsession=${clsessionCookie}; Domain=.classlink.com; Path=/`,
      'https://classlink.com',
    )
  }

  const loginPageUrl = `${link}HomeAccess/Account/LogOn`

  let loginPageHtml: string

  try {
    console.log('[HAC CLIENT] Fetching login page:', loginPageUrl)

    const res = await http.get(loginPageUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
    })

    console.log('[HAC CLIENT] Login page fetched', {
      status: res.status,
      finalUrl: res.request?.res?.responseUrl,
      htmlLength: typeof res.data === 'string' ? res.data.length : 0,
    })

    loginPageHtml = res.data as string
  } catch (err: unknown) {
    throwDetailedAxiosError('fetch login page', err)
  }

  const $ = cheerio.load(loginPageHtml)

  const verificationToken =
    $("input[name='__RequestVerificationToken']").val() as string | undefined

  console.log('[HAC CLIENT] Verification token found:', Boolean(verificationToken))

  if (!verificationToken) {
    const title = $('title').text().trim()
    const bodyPreview = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 500)

    console.error('[HAC CLIENT] Login form not found', {
      title,
      bodyPreview,
    })

    throw new Error(
      `Could not find login form on HAC page. Page title: ${title || 'unknown'}. The district may use SSO/ClassLink or a different login URL.`,
    )
  }

  const formData = new URLSearchParams()

  $('form input').each((_i, input) => {
    const name = $(input).attr('name')
    const value = $(input).attr('value') ?? ''

    if (name) {
      formData.set(name, value)
    }
  })

  formData.set('__RequestVerificationToken', verificationToken)
  formData.set('VerificationOption', 'UsernamePassword')
  // Set both dot-notation (ASP.NET MVC model binding) and underscore-notation (HTML ID form)
  formData.set('LogOnDetails.UserName', username)
  formData.set('LogOnDetails.Password', password)
  formData.set('LogOnDetails_UserName', username)
  formData.set('LogOnDetails_Password', password)
  // Some HAC implementations use tempUN/tempPW as intermediate fields
  if (formData.has('tempUN')) formData.set('tempUN', username)
  if (formData.has('tempPW')) formData.set('tempPW', password)

  if (!formData.has('Database')) {
    formData.set('Database', '10')
  }

  console.log('[HAC CLIENT] Login form fields:', Array.from(formData.keys()))

  const loginPostUrl = getFormAction($, loginPageUrl, link)

  try {
    console.log('[HAC CLIENT] Posting HAC login form:', loginPostUrl)

    const postRes = await http.post(loginPostUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: link.replace(/\/$/, ''),
        Referer: loginPageUrl,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      maxRedirects: 10,
      validateStatus: status => status >= 200 && status < 500,
    })

    const postFinalUrl: string =
      (postRes.request as { res?: { responseUrl?: string } })?.res?.responseUrl ?? loginPostUrl
    const postHtml = postRes.data as string
    const $post = cheerio.load(postHtml)
    const postTitle = $post('title').text().trim()
    const postBodyPreview = $post('body').text().replace(/\s+/g, ' ').trim().slice(0, 500)

    console.log('[HAC CLIENT] Login POST completed', {
      status: postRes.status,
      finalUrl: postFinalUrl,
      htmlLength: typeof postHtml === 'string' ? postHtml.length : 0,
      title: postTitle,
      bodyPreview: postBodyPreview,
    })

    if (postRes.status >= 500) {
      throw new Error(`HAC login POST returned HTTP ${postRes.status}. Title: ${postTitle || 'unknown'}.`)
    }

    // Explicit text-based credential rejection
    if (
      postHtml.includes('Invalid user name or password') ||
      postHtml.includes('Invalid username or password') ||
      postHtml.includes('The user name or password is incorrect') ||
      postHtml.includes('Login was unsuccessful')
    ) {
      throw new Error('Invalid credentials — HAC rejected the username or password')
    }

    // Primary check: successful HAC login always sets the .ASPXAUTH cookie.
    // A failed login only sets ASP.NET_SessionId. Check the jar right now.
    const hacDomainCheck = link.replace(/\/$/, '')
    const cookiesAfterPost = jar.getCookiesSync(hacDomainCheck)
    const hasAuthCookie = cookiesAfterPost.some(c => c.key === '.ASPXAUTH')

    console.log('[HAC CLIENT] Cookies after POST:', cookiesAfterPost.map(c => c.key))

    if (!hasAuthCookie) {
      // No auth cookie — login failed. Double-check via Home.aspx content as fallback.
      const homeUrl = `${link}HomeAccess/Home.aspx`
      const homeRes = await http.get(homeUrl, {
        headers: { Referer: loginPostUrl },
        validateStatus: s => s < 500,
      })
      const homeBody = homeRes.data as string
      const $home = cheerio.load(homeBody)
      const homeHasLoginForm = $home("input[name='__RequestVerificationToken']").length > 0
      const homeHasAuthCookie = jar.getCookiesSync(hacDomainCheck).some(c => c.key === '.ASPXAUTH')

      console.log('[HAC CLIENT] Home.aspx fallback check', {
        hasLoginForm: homeHasLoginForm,
        hasAuthCookieAfterHome: homeHasAuthCookie,
      })

      if (homeHasLoginForm || !homeHasAuthCookie) {
        throw new Error('Invalid credentials — HAC rejected the username or password')
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Invalid credentials')) {
      throw err
    }
    if (err instanceof Error && err.message.includes('HAC login POST returned HTTP')) {
      throw err
    }
    throwDetailedAxiosError('submit login form', err)
  }

  const hacDomain = link.replace(/\/$/, '')
  const allCookies = jar.getCookiesSync(hacDomain)
  console.log('[HAC CLIENT] Cookies in jar after login:', allCookies.map(c => c.key))

  const sessionToken = saveSession(userId, 'HAC', link, serializeJar(jar))

  console.log('[HAC CLIENT] HAC session saved', {
    userId,
    hasSessionToken: Boolean(sessionToken),
  })

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
    const period = $(el)
      .find('.sg-header .sg-header-heading .sg-header-period')
      .text()
      .replace('Period', '')
      .trim()
    const average =
      $(el)
        .find('.sg-header .sg-header-heading .sg-header-average')
        .text()
        .replace('Student Avg:', '')
        .trim() || null

    const scores: HACScore[] = []

    $(el)
      .find('tr.sg-asp-table-data-row')
      .each((_j, row) => {
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
      classes.push({
        name,
        period,
        teacher: '',
        room: '',
        average,
        scores,
      })
    }
  })

  try {
    const schedRes = await http.get(`${link}HomeAccess/Content/Student/Classes.aspx`)
    const $s = cheerio.load(schedRes.data as string)

    $s('tr.sg-asp-table-data-row').each((_i, row) => {
      const cells = $s(row).find('td')
      const cn = cells.eq(1).text().trim()
      const teacher = cells.eq(3).find('a').text().trim() || cells.eq(3).text().trim()
      const room = cells.eq(4).text().trim()
      const match = classes.find(c => c.name === cn)

      if (match) {
        match.teacher = teacher
        match.room = room
      }
    })
  } catch {
    // schedule enrichment is best-effort
  }

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

    $(group)
      .find('tr.sg-asp-table-data-row')
      .each((_j, row) => {
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

  $('tr.sg-asp-table-header-row th').each((_i, th) => {
    headers.push($(th).text().trim())
  })

  const schedule: object[] = []

  $('tr.sg-asp-table-data-row').each((_i, row) => {
    const entry: Record<string, string> = {}

    $(row)
      .find('td')
      .each((j, td) => {
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
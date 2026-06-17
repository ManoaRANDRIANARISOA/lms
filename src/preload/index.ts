/**
 * preload/index.ts — Preload Bridge (Secure IPC API)
 *
 * Exposes a type-safe API from the main process to the renderer
 * via Electron's contextBridge. All IPC channels are defined here.
 *
 * Security: Only the channels explicitly listed here are accessible
 * from the renderer process. No direct access to Node.js or Electron APIs.
 *
 * @module Preload
 */

import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// --------------------------------------------
// Custom API for Renderer
// --------------------------------------------
const api = {
  // --------------------------------------------
  // Student Management
  // --------------------------------------------
  student: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('student:create', data),
    list: (filters?: Record<string, unknown>) => ipcRenderer.invoke('student:list', filters),
    get: (id: string) => ipcRenderer.invoke('student:get', id),
    update: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('student:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('student:delete', id),
    reEnroll: (id: string, newClass: string, targetYear: string, framPaid?: boolean, initialPayment?: number) =>
      ipcRenderer.invoke('student:reEnroll', id, newClass, targetYear, framPaid, initialPayment),
    getServiceStats: () => ipcRenderer.invoke('student:serviceStats'),
    repair: (targetYear: string) => ipcRenderer.invoke('student:repair', targetYear),
    resetDatabase: (includeRemote: boolean) => ipcRenderer.invoke('db:reset', includeRemote)
  },

  // --------------------------------------------
  // Payment Management
  // --------------------------------------------
  payment: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('payment:create', data),
    getByStudent: (studentId: string) => ipcRenderer.invoke('payment:getByStudent', studentId),
    getAll: (filters?: Record<string, unknown>) => ipcRenderer.invoke('payment:getAll', filters),
    getTuitionStatus: (studentId: string, schoolYear: string) =>
      ipcRenderer.invoke('payment:getTuitionStatus', studentId, schoolYear),
    getUnpaidAlerts: (schoolYear: string) =>
      ipcRenderer.invoke('payment:getUnpaidAlerts', schoolYear),
    getExpectedRevenue: (schoolYear: string) =>
      ipcRenderer.invoke('payment:getExpectedRevenue', schoolYear),
    checkFramFratrie: (studentId: string, schoolYear: string) =>
      ipcRenderer.invoke('payment:checkFramFratrie', studentId, schoolYear)
  },

  // --------------------------------------------
  // Attendance (Bus & Canteen)
  // --------------------------------------------
  attendance: {
    recordBus: (date: string, records: Array<Record<string, unknown>>) =>
      ipcRenderer.invoke('attendance:recordBus', date, records),
    recordCanteen: (date: string, records: Array<Record<string, unknown>>) =>
      ipcRenderer.invoke('attendance:recordCanteen', date, records),
    getBusSubscribers: (date: string) => ipcRenderer.invoke('attendance:getBusSubscribers', date),
    getCanteenSubscribers: (date: string) =>
      ipcRenderer.invoke('attendance:getCanteenSubscribers', date),
    getBusAttendance: (date: string) => ipcRenderer.invoke('attendance:getBusAttendance', date),
    getCanteenAttendance: (date: string) =>
      ipcRenderer.invoke('attendance:getCanteenAttendance', date)
  },

  // --------------------------------------------
  // Events
  // --------------------------------------------
  event: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('event:create', data),
    list: () => ipcRenderer.invoke('event:list'),
    getById: (id: string) => ipcRenderer.invoke('event:getById', id),
    update: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('event:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('event:delete', id),
    addParticipants: (eventId: string, studentIds: string[], amountDue?: number) =>
      ipcRenderer.invoke('event:addParticipants', eventId, studentIds, amountDue),
    recordPayment: (eventId: string, studentId: string, amount: number, paymentMethod?: string) =>
      ipcRenderer.invoke('event:recordPayment', eventId, studentId, amount, paymentMethod),
    getByStudent: (studentId: string) => ipcRenderer.invoke('event:getByStudent', studentId)
  },

  // --------------------------------------------
  // Settings
  // --------------------------------------------
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },

  // --------------------------------------------
  // Authentication & User Management
  // --------------------------------------------
  auth: {
    // Public channels (no prior auth required)
    login: (username: string, password: string) =>
      ipcRenderer.invoke('auth:login', username, password),
    checkSession: (token: string) => ipcRenderer.invoke('auth:checkSession', token),

    // Authenticated channels
    logout: (token?: string) => ipcRenderer.invoke('auth:logout', token),
    getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
    getPermissions: () => ipcRenderer.invoke('auth:getPermissions'),
    activity: (token: string) => ipcRenderer.invoke('auth:activity', token),

    // User management (admin only)
    listUsers: () => ipcRenderer.invoke('auth:listUsers'),
    createUser: (userData: Record<string, unknown>) =>
      ipcRenderer.invoke('auth:createUser', userData),
    updateUser: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('auth:updateUser', id, updates),
    deactivateUser: (id: string) => ipcRenderer.invoke('auth:deactivateUser', id),

    // Password management
    changePassword: (userId: string, currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', userId, currentPassword, newPassword),
    resetPassword: (userId: string, newPassword: string) =>
      ipcRenderer.invoke('auth:resetPassword', userId, newPassword),

    // Audit logs (admin + direction read)
    getAuditLogs: (filters?: Record<string, unknown>) =>
      ipcRenderer.invoke('auth:getAuditLogs', filters)
  },

  // --------------------------------------------
  // Personnel Management
  // --------------------------------------------
  personnel: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('personnel:create', data),
    list: (filters?: Record<string, unknown>) => ipcRenderer.invoke('personnel:list', filters),
    get: (id: string) => ipcRenderer.invoke('personnel:get', id),
    update: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('personnel:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('personnel:delete', id),
    setTimeTracking: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('personnel:setTimeTracking', data),
    getTimeTracking: (personnelId: string) =>
      ipcRenderer.invoke('personnel:getTimeTracking', personnelId),
    createAbsence: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('personnel:createAbsence', data),
    getAbsences: (personnelId: string) => ipcRenderer.invoke('personnel:getAbsences', personnelId),
    deleteAbsence: (id: string) => ipcRenderer.invoke('personnel:deleteAbsence', id),
    createAdvance: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('personnel:createAdvance', data),
    getAdvances: (personnelId: string) => ipcRenderer.invoke('personnel:getAdvances', personnelId),
    markAdvanceRepaid: (id: string, repaymentDate: string) =>
      ipcRenderer.invoke('personnel:markAdvanceRepaid', id, repaymentDate),
    createDeduction: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('personnel:createDeduction', data),
    getDeductions: (personnelId: string, month?: string) =>
      ipcRenderer.invoke('personnel:getDeductions', personnelId, month),
    deleteDeduction: (id: string) => ipcRenderer.invoke('personnel:deleteDeduction', id),
    calculateSalary: (personnelId: string, month: string) =>
      ipcRenderer.invoke('personnel:calculateSalary', personnelId, month),
    getMonthlyAttendance: (personnelId: string, year: number, month: number) =>
      ipcRenderer.invoke('personnel:getMonthlyAttendance', personnelId, year, month),
    getDailyAttendance: (date: string) => ipcRenderer.invoke('personnel:getDailyAttendance', date),
    setBulkAttendance: (records: Record<string, unknown>[]) =>
      ipcRenderer.invoke('personnel:setBulkAttendance', records),
    setAttendance: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('personnel:setAttendance', data),
    deleteAttendance: (id: string) => ipcRenderer.invoke('personnel:deleteAttendance', id),
    createSalaryExpense: (
      personnelId: string,
      month: string,
      netAmount: number,
      description?: string
    ) =>
      ipcRenderer.invoke(
        'personnel:createSalaryExpense',
        personnelId,
        month,
        netAmount,
        description
      )
  },

  // --------------------------------------------
  // Grades & Subjects
  // --------------------------------------------
  grade: {
    createSubject: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('grade:createSubject', data),
    listSubjects: () => ipcRenderer.invoke('grade:listSubjects'),
    updateSubject: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('grade:updateSubject', id, updates),
    deleteSubject: (id: string) => ipcRenderer.invoke('grade:deleteSubject', id),
    createGrade: (data: Record<string, unknown>) => ipcRenderer.invoke('grade:createGrade', data),
    updateGrade: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('grade:updateGrade', id, updates),
    deleteGrade: (id: string) => ipcRenderer.invoke('grade:deleteGrade', id),
    getGradesByStudent: (studentId: string, schoolYear: string, term?: number) =>
      ipcRenderer.invoke('grade:getGradesByStudent', studentId, schoolYear, term),
    getGradesByClass: (className: string, schoolYear: string, term: number) =>
      ipcRenderer.invoke('grade:getGradesByClass', className, schoolYear, term),
    getStudentAverage: (studentId: string, schoolYear: string, term: number) =>
      ipcRenderer.invoke('grade:getStudentAverage', studentId, schoolYear, term),
    getClassAverages: (className: string, schoolYear: string, term: number) =>
      ipcRenderer.invoke('grade:getClassAverages', className, schoolYear, term),
    getClassRanking: (className: string, schoolYear: string, term: number) =>
      ipcRenderer.invoke('grade:getClassRanking', className, schoolYear, term),
    // Class Subjects (Phase 3)
    getClassSubjects: (className: string) =>
      ipcRenderer.invoke('grade:getClassSubjects', className),
    getAllClassSubjects: () => ipcRenderer.invoke('grade:getAllClassSubjects'),
    createClassSubject: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('grade:createClassSubject', data),
    updateClassSubject: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('grade:updateClassSubject', id, updates),
    deleteClassSubject: (id: string) => ipcRenderer.invoke('grade:deleteClassSubject', id),
    getClassesWithSubjects: () => ipcRenderer.invoke('grade:getClassesWithSubjects'),
    getClassSubjectAverages: (className: string, schoolYear: string, term: number) =>
      ipcRenderer.invoke('grade:getClassSubjectAverages', className, schoolYear, term)
  },

  // --------------------------------------------
  // Cash Journal
  // --------------------------------------------
  cashJournal: {
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('cashjournal:create', data),
    list: (filters?: Record<string, unknown>) => ipcRenderer.invoke('cashjournal:list', filters),
    get: (id: string) => ipcRenderer.invoke('cashjournal:get', id),
    update: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('cashjournal:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('cashjournal:delete', id),
    getDailyBalance: (date: string) => ipcRenderer.invoke('cashjournal:getDailyBalance', date),
    getMonthlyBalance: (year: number, month: number) =>
      ipcRenderer.invoke('cashjournal:getMonthlyBalance', year, month),
    getBalanceSummary: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('cashjournal:getBalanceSummary', startDate, endDate),
    getTotalBalance: () => ipcRenderer.invoke('cashjournal:getTotalBalance')
  },

  // --------------------------------------------
  // Dashboard
  // --------------------------------------------
  dashboard: {
    getStats: () => ipcRenderer.invoke('dashboard:getStats')
  },

  // --------------------------------------------
  // Reports & Export
  // --------------------------------------------
  report: {
    monthlyFinance: (year: number, month: number) =>
      ipcRenderer.invoke('report:monthlyFinance', year, month),
    unpaid: (schoolYear: string) => ipcRenderer.invoke('report:unpaid', schoolYear),
    payroll: (year: number, month: number) => ipcRenderer.invoke('report:payroll', year, month),
    tuition: (schoolYear: string) => ipcRenderer.invoke('report:tuition', schoolYear)
  },
  assessment: {
    create: (data: any) => ipcRenderer.invoke('assessment:create', data),
    list: (schoolYear: string, className?: string) =>
      ipcRenderer.invoke('assessment:list', schoolYear, className),
    update: (id: string, updates: any) => ipcRenderer.invoke('assessment:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('assessment:delete', id)
  },
  export: {
    csv: (
      data: Record<string, unknown>[],
      columns: Array<{ key: string; label: string }>,
      filename: string
    ) => ipcRenderer.invoke('export:csv', data, columns, filename)
  },

  // --------------------------------------------
  // Email Service
  // --------------------------------------------
  email: {
    configure: (config: Record<string, unknown>) => ipcRenderer.invoke('email:configure', config),
    testConnection: () => ipcRenderer.invoke('email:testConnection'),
    sendNow: (to: string, subject: string, body: string) =>
      ipcRenderer.invoke('email:sendNow', to, subject, body),
    getStatus: () => ipcRenderer.invoke('email:getStatus'),
    getLogs: () => ipcRenderer.invoke('email:getLogs'),
    sendDailyReport: () => ipcRenderer.invoke('email:sendDailyReport')
  },

  // --------------------------------------------
  // PDF Generation
  // --------------------------------------------
  pdf: {
    generateReceipt: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('pdf:generateReceipt', data),
    generateCertificate: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('pdf:generateCertificate', data),
    generateReportCard: (
      studentData: Record<string, unknown>,
      grades: unknown[],
      generalAverage: number
    ) => ipcRenderer.invoke('pdf:generateReportCard', studentData, grades, generalAverage),
    generatePayslip: (
      personnelData: Record<string, unknown>,
      salaryCalc: Record<string, unknown>
    ) => ipcRenderer.invoke('pdf:generatePayslip', personnelData, salaryCalc),
    generateDailyReport: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('pdf:generateDailyReport', data),
    openFile: (filePath: string) => ipcRenderer.invoke('pdf:openFile', filePath)
  },

  // --------------------------------------------
  // Dialogs
  // --------------------------------------------
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile')
  }
}

// --------------------------------------------
// Context Bridge Setup
// --------------------------------------------
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

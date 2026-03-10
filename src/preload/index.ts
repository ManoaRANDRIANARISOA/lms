import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  student: {
    create: (data: any) => ipcRenderer.invoke('student:create', data),
    list: (filters: any) => ipcRenderer.invoke('student:list', filters),
    get: (id: string) => ipcRenderer.invoke('student:get', id),
    update: (id: string, updates: any) => ipcRenderer.invoke('student:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('student:delete', id),
    reEnroll: (id: string, newClass: string, targetYear: string) => ipcRenderer.invoke('student:reEnroll', id, newClass, targetYear),
    getServiceStats: () => ipcRenderer.invoke('student:serviceStats'),
  },
  payment: {
    create: (data: any) => ipcRenderer.invoke('payment:create', data),
    getByStudent: (studentId: string) => ipcRenderer.invoke('payment:getByStudent', studentId),
    getTuitionStatus: (studentId: string, schoolYear: string) => ipcRenderer.invoke('payment:getTuitionStatus', studentId, schoolYear),
  },
  attendance: {
    recordBus: (date: string, records: any[]) => ipcRenderer.invoke('attendance:recordBus', date, records),
    recordCanteen: (date: string, records: any[]) => ipcRenderer.invoke('attendance:recordCanteen', date, records),
    getBusSubscribers: (date: string) => ipcRenderer.invoke('attendance:getBusSubscribers', date),
    getCanteenSubscribers: (date: string) => ipcRenderer.invoke('attendance:getCanteenSubscribers', date),
    getBusAttendance: (date: string) => ipcRenderer.invoke('attendance:getBusAttendance', date),
    getCanteenAttendance: (date: string) => ipcRenderer.invoke('attendance:getCanteenAttendance', date),
  },
  event: {
    create: (data: any) => ipcRenderer.invoke('event:create', data),
    list: () => ipcRenderer.invoke('event:list'),
    getById: (id: string) => ipcRenderer.invoke('event:getById', id),
    addParticipants: (eventId: string, studentIds: string[]) => ipcRenderer.invoke('event:addParticipants', eventId, studentIds),
    recordPayment: (participationId: string, amount: number) => ipcRenderer.invoke('event:recordPayment', participationId, amount),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
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

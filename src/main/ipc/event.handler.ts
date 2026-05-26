/**
 * event.handler.ts — IPC Handlers for Events Module
 *
 * Manages parent events (creation, listing, participant management,
 * payment recording). All write operations are protected by RBAC.
 *
 * Permission resource: 'events'
 *   - admin:        full access
 *   - secretariat:  full access
 *   - accounting:   read only
 *   - direction:    full access
 *
 * @module EventHandler
 */

import { ipcMain } from 'electron'
import { EventRepository } from '../database/repositories/event.repository'
import { canRead, canWrite } from '../auth/rbac.service'
import { logAction } from '../auth/audit.service'
import { getCurrentUser } from '../auth/rbac.service'

export function registerEventHandlers(): void {
  // --------------------------------------------
  // CREATE EVENT
  // --------------------------------------------
  ipcMain.handle('event:create', async (_, event) => {
    if (!canWrite('events')) {
      return { success: false, error: 'Accès refusé: écriture événements' }
    }
    const result = EventRepository.create(event)
    if (result.success && result.id) {
      logAction(getCurrentUser()?.id || null, 'create', 'parent_events', result.id, null, JSON.stringify(event))
    }
    return result
  })

  // --------------------------------------------
  // LIST EVENTS
  // --------------------------------------------
  ipcMain.handle('event:list', async () => {
    if (!canRead('events')) {
      return { success: false, error: 'Accès refusé: lecture événements' }
    }
    return EventRepository.list()
  })

  // --------------------------------------------
  // GET EVENT BY ID
  // --------------------------------------------
  ipcMain.handle('event:getById', async (_, id) => {
    if (!canRead('events')) {
      return { success: false, error: 'Accès refusé: lecture événements' }
    }
    return EventRepository.getById(id)
  })

  // --------------------------------------------
  // UPDATE EVENT
  // --------------------------------------------
  ipcMain.handle('event:update', async (_, id, updates) => {
    if (!canWrite('events')) {
      return { success: false, error: 'Accès refusé: écriture événements' }
    }
    const oldEvent = EventRepository.getById(id)
    const result = EventRepository.update(id, updates)
    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'update',
        'parent_events',
        id,
        oldEvent ? JSON.stringify(oldEvent) : null,
        JSON.stringify(updates)
      )
    }
    return result
  })

  // --------------------------------------------
  // DELETE EVENT
  // --------------------------------------------
  ipcMain.handle('event:delete', async (_, id) => {
    if (!canWrite('events')) {
      return { success: false, error: 'Accès refusé: écriture événements' }
    }
    const oldEvent = EventRepository.getById(id)
    const result = EventRepository.delete(id)
    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'delete',
        'parent_events',
        id,
        oldEvent ? JSON.stringify(oldEvent) : null,
        null
      )
    }
    return result
  })

  // --------------------------------------------
  // ADD PARTICIPANTS TO EVENT
  // --------------------------------------------
  ipcMain.handle('event:addParticipants', async (_, eventId, studentIds, amountDue) => {
    if (!canWrite('events')) {
      return { success: false, error: 'Accès refusé: écriture événements' }
    }
    const result = EventRepository.addParticipants(eventId, studentIds, amountDue)
    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'addParticipants',
        'parent_events',
        eventId,
        null,
        JSON.stringify({ studentIds, amountDue })
      )
    }
    return result
  })

  // --------------------------------------------
  // RECORD EVENT PAYMENT
  // --------------------------------------------
  ipcMain.handle('event:recordPayment', async (_, eventId, studentId, amount, paymentMethod) => {
    if (!canWrite('events')) {
      return { success: false, error: 'Accès refusé: écriture événements' }
    }
    const result = EventRepository.recordPayment(eventId, studentId, amount, paymentMethod)
    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'recordPayment',
        'event_payments',
        eventId,
        null,
        JSON.stringify({ studentId, amount, paymentMethod })
      )
    }
    return result
  })
}

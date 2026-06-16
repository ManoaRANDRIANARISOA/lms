/**
 * personnel-constants.ts — Shared constants for Personnel module
 *
 * Labels for positions, statuses, and teacher levels used across
 * PersonnelList, PersonnelDetail, and other personnel-related components.
 *
 * @module personnel-constants
 */

export const POSITION_LABELS: Record<string, string> = {
  teacher: 'Enseignant',
  admin: 'Administration',
  direction: 'Direction',
  maintenance: 'Maintenance',
  other: 'Autre'
}

export const STATUS_LABELS: Record<string, string> = {
  fulltime: 'Temps plein',
  parttime: 'Temps partiel'
}

export const LEVEL_LABELS: Record<string, string> = {
  preschool: 'Préscolaire',
  primary: 'Primaire',
  middle: 'Collège',
  high: 'Lycée',
  multi: 'Multi-niveaux'
}

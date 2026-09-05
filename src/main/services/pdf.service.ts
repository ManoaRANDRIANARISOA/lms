/**
 * pdf.service.ts — PDF Generation Service
 *
 * Centralized PDF generation using jsPDF.
 * All methods return the file path of the generated PDF.
 *
 * @module PdfService
 */

import { jsPDF } from 'jspdf'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const isDev = !app.isPackaged

function getOutputDir(category: string): string {
  const dir = path.join(app.getPath('desktop'), 'lms', category)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function addHeader(doc: jsPDF, title: string): number {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Lycée Manjary Soa', 105, 20, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Lot H 81 Miadana Alasora, Antananarivo', 105, 27, { align: 'center' })
  doc.setLineWidth(0.5)
  doc.line(20, 32, 190, 32)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 105, 42, { align: 'center' })
  return 50
}

function addFooter(doc: jsPDF, pageNumber: number): void {
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
    20,
    285
  )
  doc.text(`Page ${pageNumber}`, 190, 285, { align: 'right' })
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100)
}

export class PdfService {
  /**
   * Generate a payment receipt (A5 format)
   */
  static generateReceipt(paymentData: {
    student_name: string
    class_name: string
    amount: number
    payment_type: string
    payment_date: string
    month?: string
    receipt_number?: string
    payment_method?: string
    department?: string
    is_duplicate?: boolean
    duplicate_count?: number
  }): { success: boolean; filePath?: string; error?: string } {
    try {
      const doc = new jsPDF({ format: 'a5' })
      let y = 15

      // Add Logo
      try {
        const logoPath = isDev
          ? path.join(process.cwd(), 'resources', 'logo.png')
          : path.join(process.resourcesPath, 'logo.png')
        if (fs.existsSync(logoPath)) {
          const logoData = fs.readFileSync(logoPath).toString('base64')
          doc.addImage(`data:image/png;base64,${logoData}`, 'PNG', 15, 10, 20, 20)
        }
      } catch (e) {
        console.error('Could not load logo', e)
      }

      // Header Text
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('Lycée Manjary Soa', 74, 18, { align: 'center' })
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Lot H 81 Miadana Alasora, Antananarivo', 74, 24, { align: 'center' })

      // Separator
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.5)
      doc.line(15, 33, 133, 33)

      // Title
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      const receiptTitle = paymentData.is_duplicate
        ? `REÇU DE CAISSE (DUPLICATA N° ${paymentData.duplicate_count || 1})`
        : 'REÇU DE CAISSE'
      doc.text(receiptTitle, 74, 45, { align: 'center' })

      // Content Box
      doc.setDrawColor(0, 0, 0)
      doc.setFillColor(250, 250, 250)
      doc.roundedRect(15, 55, 118, 75, 3, 3, 'FD')

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')

      y = 65
      const isStudent = paymentData.department === 'eleve'

      if (isStudent) {
        doc.setFont('helvetica', 'bold')
        doc.text('Élève :', 20, y)
        doc.setFont('helvetica', 'normal')
        doc.text(paymentData.student_name, 45, y)
        y += 8

        doc.setFont('helvetica', 'bold')
        doc.text('Classe :', 20, y)
        doc.setFont('helvetica', 'normal')
        doc.text(paymentData.class_name, 45, y)
        y += 8
      } else {
        doc.setFont('helvetica', 'bold')
        doc.text('Libellé :', 20, y)
        doc.setFont('helvetica', 'normal')
        const txt = doc.splitTextToSize(paymentData.student_name, 80)
        doc.text(txt, 45, y)
        y += txt.length * 5 + 3
      }

      doc.setFont('helvetica', 'bold')
      doc.text('Type :', 20, y)
      doc.setFont('helvetica', 'normal')
      doc.text(paymentData.payment_type.toUpperCase(), 45, y)
      y += 8

      if (paymentData.month) {
        doc.setFont('helvetica', 'bold')
        doc.text('Mois :', 20, y)
        doc.setFont('helvetica', 'normal')
        doc.text(paymentData.month, 45, y)
        y += 8
      }

      if (paymentData.payment_method) {
        doc.setFont('helvetica', 'bold')
        doc.text('Paiement :', 20, y)
        doc.setFont('helvetica', 'normal')
        const pMethod =
          paymentData.payment_method === 'cash'
            ? 'Espèces'
            : paymentData.payment_method === 'bank'
              ? 'Banque'
              : paymentData.payment_method === 'mobile'
                ? 'Mobile Money'
                : paymentData.payment_method
        doc.text(pMethod, 45, y)
        y += 8
      }

      // Amount highlight
      y += 5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text('Montant :', 20, y)

      const safeAmount = paymentData.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
      doc.text(`${safeAmount} Ar`, 45, y)

      doc.setFontSize(10)
      y += 12
      doc.setFont('helvetica', 'normal')
      doc.text(`Date : ${new Date(paymentData.payment_date).toLocaleDateString('fr-FR')}`, 20, y)

      if (paymentData.receipt_number) {
        doc.text(`N° Reçu : ${paymentData.receipt_number}`, 80, y)
      }

      // Footer signature
      y += 18
      doc.setFontSize(9)
      doc.text('Signature / Cachet :', 85, y)
      doc.line(85, y + 20, 130, y + 20)

      addFooter(doc, 1)

      const filename = `recu_${sanitizeFilename(paymentData.student_name)}_${paymentData.payment_date}.pdf`
      const filePath = path.join(getOutputDir('Recus'), filename)
      doc.save(filePath)

      return { success: true, filePath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  }

  /**
   * Generate a school certificate
   */
  static generateCertificate(studentData: {
    first_name: string
    last_name: string
    date_of_birth?: string
    place_of_birth?: string
    class_name: string
    school_year: string
    registration_number?: string
    father_name?: string
    mother_name?: string
    photo_path?: string
  }): { success: boolean; filePath?: string; error?: string } {
    try {
      const doc = new jsPDF()
      let y = 20

      // Add Logo and header
      try {
        const logoPath = isDev
          ? path.join(process.cwd(), 'resources', 'logo.png')
          : path.join(process.resourcesPath, 'logo.png')
        if (fs.existsSync(logoPath)) {
          const logoData = fs.readFileSync(logoPath).toString('base64')
          doc.addImage(`data:image/png;base64,${logoData}`, 'PNG', 20, 15, 25, 25)
        }
      } catch (e) {
        console.error('Could not load logo', e)
      }

      // Add Student Photo if available
      if (studentData.photo_path) {
        try {
          const photoPath = path.isAbsolute(studentData.photo_path)
            ? studentData.photo_path
            : path.join(app.getPath('userData'), studentData.photo_path)

          if (fs.existsSync(photoPath)) {
            const photoData = fs.readFileSync(photoPath).toString('base64')
            // Add on the top right
            doc.addImage(`data:image/jpeg;base64,${photoData}`, 'JPEG', 160, 15, 30, 30)
          }
        } catch (e) {
          console.error('Could not load student photo', e)
        }
      }

      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('LYCEE MANJARY SOA', 50, 25)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('Lot H 81 Miadana Alasora', 50, 32)

      y = 60
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('CERTIFICAT DE SCOLARITE', 105, y, { align: 'center' })

      doc.setLineWidth(0.5)
      doc.line(60, y + 2, 150, y + 2)

      y += 20
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')

      const text1 =
        'Je soussignée, RAZAFINTSEHENO Anjarasoa Christine, Directrice du Lycée Privé MANJARY SOA sise à Lot H 81 Miadana Alasora, certifie que :'
      const splitText1 = doc.splitTextToSize(text1, 170)
      doc.text(splitText1, 20, y)
      y += splitText1.length * 7 + 10

      doc.text(`L'élève : ${studentData.last_name} ${studentData.first_name}`, 20, y)
      y += 10
      doc.text(
        `Né(e) le : ${studentData.date_of_birth || '.......................'} à ${studentData.place_of_birth || '.......................'}`,
        20,
        y
      )
      y += 10

      const parents: string[] = []
      if (studentData.father_name) parents.push(studentData.father_name)
      if (studentData.mother_name) parents.push(studentData.mother_name)

      if (parents.length > 0) {
        doc.text(`Fils/Fille de : ${parents.join(' et de ')}`, 20, y)
        y += 10
      }

      const text2 = `Est inscrit(e) dans mon établissement en classe de ${studentData.class_name} durant l'année scolaire ${studentData.school_year}.`
      const splitText2 = doc.splitTextToSize(text2, 170)
      doc.text(splitText2, 20, y)
      y += splitText2.length * 7 + 10

      doc.text('Ce certificat lui est délivré pour servir et valoir ce que de droit.', 20, y)
      y += 25

      doc.text(`Alasora, le ${new Date().toLocaleDateString('fr-FR')}`, 130, y)
      y += 10
      doc.text('La Directrice,', 130, y)
      y += 20
      doc.setFont('helvetica', 'bold')
      doc.text('RAZAFINTSEHENO Anjarasoa Christine', 115, y)

      addFooter(doc, 1)

      const filename = `certificat_${sanitizeFilename(studentData.last_name)}_${sanitizeFilename(studentData.first_name)}.pdf`
      const filePath = path.join(getOutputDir('Certificats'), filename)
      doc.save(filePath)

      return { success: true, filePath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  }

  /**
   * Generate a daily cash report
   */
  /**
   * Generate a daily cash report (Official standard PDF)
   */
  static generateDailyReport(reportData: {
    date: string
    total_income: number
    total_expense: number
    balance: number
    opening_balance?: number
    closing_balance?: number
    entries: Array<{
      type: string
      department: string
      category: string
      amount: number
      description?: string
      receipt_number?: string
      beneficiary?: string
      payment_method?: string
      created_by?: string
      time?: string
    }>
  }): { success: boolean; filePath?: string; error?: string } {
    try {
      const doc = new jsPDF()
      const formattedDate = new Date(reportData.date).toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      let y = addHeader(
        doc,
        `RAPPORT DE CAISSE JOURNALIER\n${formattedDate.toUpperCase()}`
      )

      // Summary Box
      doc.setFillColor(245, 247, 250)
      doc.rect(20, y, 170, 26, 'F')
      doc.setDrawColor(200, 210, 220)
      doc.rect(20, y, 170, 26, 'S')

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 90, 100)

      const hasBalances = reportData.opening_balance !== undefined
      if (hasBalances) {
        doc.text('Solde Initial', 25, y + 8)
        doc.text('Recettes (+)', 60, y + 8)
        doc.text('Dépenses (-)', 95, y + 8)
        doc.text('Solde Net', 130, y + 8)
        doc.text('Solde Final', 162, y + 8)

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 41, 59)
        doc.text(`${(reportData.opening_balance || 0).toLocaleString('fr-FR')} Ar`, 25, y + 18)

        doc.setTextColor(22, 101, 52) // Green
        doc.text(`+${reportData.total_income.toLocaleString('fr-FR')} Ar`, 60, y + 18)

        doc.setTextColor(185, 28, 28) // Red
        doc.text(`-${reportData.total_expense.toLocaleString('fr-FR')} Ar`, 95, y + 18)

        doc.setTextColor(30, 64, 175) // Blue
        doc.text(
          `${reportData.balance >= 0 ? '+' : ''}${reportData.balance.toLocaleString('fr-FR')} Ar`,
          130,
          y + 18
        )

        doc.setTextColor(15, 23, 42) // Dark
        doc.text(`${(reportData.closing_balance || 0).toLocaleString('fr-FR')} Ar`, 162, y + 18)
      } else {
        doc.text('Total Recettes', 30, y + 8)
        doc.text('Total Dépenses', 85, y + 8)
        doc.text('Solde Net Journalier', 140, y + 8)

        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(22, 101, 52)
        doc.text(`+${reportData.total_income.toLocaleString('fr-FR')} Ar`, 30, y + 18)

        doc.setTextColor(185, 28, 28)
        doc.text(`-${reportData.total_expense.toLocaleString('fr-FR')} Ar`, 85, y + 18)

        doc.setTextColor(30, 64, 175)
        doc.text(
          `${reportData.balance >= 0 ? '+' : ''}${reportData.balance.toLocaleString('fr-FR')} Ar`,
          140,
          y + 18
        )
      }

      y += 34

      // Detail Table Header
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)
      doc.text(`Détail des Mouvements (${reportData.entries.length} opération${reportData.entries.length > 1 ? 's' : ''}) :`, 20, y)
      y += 6

      // Column headers
      doc.setFillColor(230, 235, 245)
      doc.rect(20, y, 170, 7, 'F')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(51, 65, 85)
      doc.text('N° Reçu / Réf', 22, y + 5)
      doc.text('Bénéficiaire / Libellé', 65, y + 5)
      doc.text('Catégorie', 125, y + 5)
      doc.text('Mode', 150, y + 5)
      doc.text('Montant', 188, y + 5, { align: 'right' })
      y += 9

      let pageNum = 1
      doc.setFont('helvetica', 'normal')

      if (reportData.entries.length === 0) {
        doc.setTextColor(120, 120, 120)
        doc.text('Aucun mouvement de caisse enregistré pour cette journée.', 20, y + 4)
        y += 12
      } else {
        reportData.entries.forEach((entry, idx) => {
          if (y > 260) {
            addFooter(doc, pageNum)
            doc.addPage()
            pageNum++
            y = 20
            // Re-print column headers on new page
            doc.setFillColor(230, 235, 245)
            doc.rect(20, y, 170, 7, 'F')
            doc.setFontSize(8)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(51, 65, 85)
            doc.text('N° Reçu / Réf', 22, y + 5)
            doc.text('Bénéficiaire / Libellé', 65, y + 5)
            doc.text('Catégorie', 125, y + 5)
            doc.text('Mode', 150, y + 5)
            doc.text('Montant', 188, y + 5, { align: 'right' })
            y += 9
            doc.setFont('helvetica', 'normal')
          }

          // Alternating row background
          if (idx % 2 === 1) {
            doc.setFillColor(248, 250, 252)
            doc.rect(20, y - 2.5, 170, 6.5, 'F')
          }

          const isIncome = entry.type === 'income'
          const ref = entry.receipt_number || (entry.time ? `${entry.time}` : `OP-${idx + 1}`)
          const label = entry.beneficiary
            ? `${entry.beneficiary}${entry.description ? ` (${entry.description})` : ''}`
            : (entry.description || entry.category)
          const truncatedLabel = label.length > 35 ? label.substring(0, 32) + '...' : label
          const cat = entry.category ? entry.category.substring(0, 16) : 'Divers'
          const method = entry.payment_method === 'cash' ? 'Espèces' : (entry.payment_method || 'Espèces')

          doc.setFontSize(8)
          doc.setTextColor(71, 85, 105)
          doc.text(ref.substring(0, 20), 22, y + 2)
          doc.setTextColor(15, 23, 42)
          doc.text(truncatedLabel, 65, y + 2)
          doc.setTextColor(71, 85, 105)
          doc.text(cat, 125, y + 2)
          doc.text(method.substring(0, 10), 150, y + 2)

          // Amount
          doc.setFont('helvetica', 'bold')
          if (isIncome) {
            doc.setTextColor(22, 101, 52)
            doc.text(`+${entry.amount.toLocaleString('fr-FR')} Ar`, 188, y + 2, { align: 'right' })
          } else {
            doc.setTextColor(185, 28, 28)
            doc.text(`-${entry.amount.toLocaleString('fr-FR')} Ar`, 188, y + 2, { align: 'right' })
          }
          doc.setFont('helvetica', 'normal')

          y += 6.5
        })
      }

      // Signatures section
      if (y > 240) {
        addFooter(doc, pageNum)
        doc.addPage()
        pageNum++
        y = 30
      } else {
        y += 15
      }

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(51, 65, 85)
      doc.text('Le Responsable de Caisse / Comptable', 35, y)
      doc.text('La Direction Générale', 135, y)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text('(Signature et Cachet)', 45, y + 5)
      doc.text('(Visa et Cachet)', 145, y + 5)

      addFooter(doc, pageNum)

      const filename = `bilan_${reportData.date}.pdf`
      const filePath = path.join(getOutputDir('Rapports'), filename)
      doc.save(filePath)

      return { success: true, filePath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  }

  /**
   * Generate a report card (placeholder — template to be customized)
   */
  static generateReportCard(
    studentData: {
      first_name: string
      last_name: string
      class_name: string
      school_year: string
      term: number
      termName?: string
      photo_path?: string
    },
    grades: Array<{ subject: string; grade: number; coefficient: number; average: number }>,
    generalAverage: number
  ): { success: boolean; filePath?: string; error?: string } {
    try {
      const doc = new jsPDF()

      // Add Logo
      try {
        const logoPath = 'c:\\rep\\School\\assets\\logo.png'
        if (fs.existsSync(logoPath)) {
          const logoData = fs.readFileSync(logoPath).toString('base64')
          doc.addImage(`data:image/png;base64,${logoData}`, 'PNG', 15, 10, 20, 20)
        }
      } catch (e) {
        console.error('Could not load logo', e)
      }

      // Add Photo
      try {
        if (studentData.photo_path && fs.existsSync(studentData.photo_path)) {
          const photoData = fs.readFileSync(studentData.photo_path).toString('base64')
          doc.addImage(`data:image/jpeg;base64,${photoData}`, 'JPEG', 165, 10, 25, 25)
        }
      } catch (e) {
        console.error('Could not load student photo', e)
      }

      const title = studentData.termName
        ? `BULLETIN DE NOTES — ${studentData.termName}`
        : `BULLETIN DE NOTES — Trimestre ${studentData.term}`
      let y = addHeader(doc, title)

      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(`Élève : ${studentData.last_name} ${studentData.first_name}`, 20, y)
      y += 7
      doc.text(`Classe : ${studentData.class_name}`, 20, y)
      y += 7
      doc.text(`Année : ${studentData.school_year}`, 20, y)
      y += 12

      // Table header
      doc.setFont('helvetica', 'bold')
      doc.text('Matière', 20, y)
      doc.text('Coeff', 100, y)
      doc.text('Note', 120, y)
      doc.text('Moy. Classe', 145, y)
      y += 2
      doc.line(20, y, 180, y)
      y += 5

      let pageNum = 1
      doc.setFont('helvetica', 'normal')
      grades.forEach((g) => {
        if (y > 270) {
          addFooter(doc, pageNum)
          doc.addPage()
          pageNum++
          y = 20
        }
        doc.text(g.subject, 20, y)
        doc.text(String(g.coefficient), 105, y)
        doc.text(g.grade.toFixed(2), 120, y)
        doc.text(g.average.toFixed(2), 150, y)
        y += 7
      })

      y += 3
      doc.line(20, y, 180, y)
      y += 7
      doc.setFont('helvetica', 'bold')
      doc.text(`Moyenne générale : ${generalAverage.toFixed(2)}/20`, 20, y)

      if (studentData.term === 4 && generalAverage > 0) {
        y += 15
        doc.setFontSize(14)
        doc.text('Décision du Conseil de Classe :', 20, y)
        y += 8
        if (generalAverage >= 10) {
          doc.setTextColor(0, 128, 0)
          doc.text('Admis(e) en classe supérieure', 20, y)
        } else {
          doc.setTextColor(200, 0, 0)
          doc.text('Redouble', 20, y)
        }
        doc.setTextColor(0, 0, 0) // reset color
        doc.setFontSize(11)
      }

      addFooter(doc, pageNum)

      const termSuffix = studentData.termName
        ? sanitizeFilename(studentData.termName)
        : `T${studentData.term}`
      const filename = `bulletin_${sanitizeFilename(studentData.last_name)}_${sanitizeFilename(studentData.first_name)}_${termSuffix}.pdf`
      const filePath = path.join(getOutputDir('Bulletins'), filename)
      doc.save(filePath)

      return { success: true, filePath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  }

  /**
   * Generate a payslip (placeholder — template to be customized)
   */
  static generatePayslip(
    personnelData: {
      first_name: string
      last_name: string
      position: string
      month: string
    },
    salaryCalc: {
      gross_salary: number
      cnaps: number
      ostie: number
      irsa: number
      total_deductions: number
      net_salary: number
      details?: Record<string, unknown>
    }
  ): { success: boolean; filePath?: string; error?: string } {
    try {
      const doc = new jsPDF()
      let y = addHeader(doc, `FICHE DE PAIE — ${personnelData.month}`)

      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(`Salarié : ${personnelData.last_name} ${personnelData.first_name}`, 20, y)
      y += 7
      doc.text(`Poste : ${personnelData.position}`, 20, y)
      y += 7
      doc.text(`Mois : ${personnelData.month}`, 20, y)
      y += 12

      doc.setFont('helvetica', 'bold')
      doc.text('Éléments de salaire :', 20, y)
      y += 8
      doc.setFont('helvetica', 'normal')
      doc.text(`Salaire brut : ${salaryCalc.gross_salary.toLocaleString()} Ar`, 25, y)
      y += 7
      doc.text(`CNAPS : -${salaryCalc.cnaps.toLocaleString()} Ar`, 25, y)
      y += 7
      doc.text(`OSTIE : -${salaryCalc.ostie.toLocaleString()} Ar`, 25, y)
      y += 7
      doc.text(`IRSA : -${salaryCalc.irsa.toLocaleString()} Ar`, 25, y)
      y += 7

      doc.line(20, y, 100, y)
      y += 7
      doc.setFont('helvetica', 'bold')
      doc.text(`Total déductions : -${salaryCalc.total_deductions.toLocaleString()} Ar`, 25, y)
      y += 10
      doc.setFontSize(13)
      doc.text(`Salaire net : ${salaryCalc.net_salary.toLocaleString()} Ar`, 20, y)

      addFooter(doc, 1)

      const filename = `fiche_paie_${sanitizeFilename(personnelData.last_name)}_${personnelData.month}.pdf`
      const filePath = path.join(getOutputDir('Personnel'), filename)
      doc.save(filePath)

      return { success: true, filePath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  }
}

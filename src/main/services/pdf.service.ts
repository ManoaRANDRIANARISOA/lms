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

function getOutputDir(): string {
  const dir = isDev
    ? path.join(process.cwd(), 'pdf-output')
    : path.join(app.getPath('userData'), 'pdf-output')
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
  doc.text('Antananarivo, Madagascar', 105, 27, { align: 'center' })
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
      doc.text('Lot H 61 Miadana Alasora, Antananarivo', 74, 24, { align: 'center' })
      
      // Separator
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.5)
      doc.line(15, 33, 133, 33)

      // Title
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('REÇU DE CAISSE', 74, 45, { align: 'center' })

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
        const pMethod = paymentData.payment_method === 'cash' ? 'Espèces' : paymentData.payment_method === 'bank' ? 'Banque' : paymentData.payment_method === 'mobile' ? 'Mobile Money' : paymentData.payment_method
        doc.text(pMethod, 45, y)
        y += 8
      }

      // Amount highlight
      y += 5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text('Montant :', 20, y)
      
      const safeAmount = paymentData.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")
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
      const filePath = path.join(getOutputDir(), filename)
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

      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('LYCEE MANJARY SOA', 50, 25)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('Lot H 61 Miadana Alasora', 50, 32)

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
        'Je soussignée, RAZAFINTSEHENO Anjarasoa Christine, Directrice du Lycée Privé MANJARY SOA sise à Miadana Alasora, certifie que :'
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
      const filePath = path.join(getOutputDir(), filename)
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
  static generateDailyReport(reportData: {
    date: string
    total_income: number
    total_expense: number
    balance: number
    entries: Array<{
      type: string
      department: string
      category: string
      amount: number
      description?: string
    }>
  }): { success: boolean; filePath?: string; error?: string } {
    try {
      const doc = new jsPDF()
      let y = addHeader(
        doc,
        `BILAN JOURNALIER — ${new Date(reportData.date).toLocaleDateString('fr-FR')}`
      )

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Résumé :', 20, y)
      y += 8
      doc.setFont('helvetica', 'normal')
      doc.text(`Recettes : ${reportData.total_income.toLocaleString()} Ar`, 20, y)
      y += 7
      doc.text(`Dépenses : ${reportData.total_expense.toLocaleString()} Ar`, 20, y)
      y += 7
      doc.setFont('helvetica', 'bold')
      doc.text(`Solde : ${reportData.balance.toLocaleString()} Ar`, 20, y)
      y += 12

      doc.setFont('helvetica', 'bold')
      doc.text('Détail des entrées :', 20, y)
      y += 8
      doc.setFont('helvetica', 'normal')

      let pageNum = 1
      if (reportData.entries.length === 0) {
        doc.text('Aucune entrée pour cette journée.', 20, y)
      } else {
        reportData.entries.forEach((entry) => {
          if (y > 270) {
            addFooter(doc, pageNum)
            doc.addPage()
            pageNum++
            y = 20
          }
          const prefix = entry.type === 'income' ? '+' : '-'
          const dept = entry.department === 'bus' ? 'Bus' : 'École'
          doc.text(
            `${prefix} ${entry.amount.toLocaleString()} Ar — [${dept}] ${entry.category}${entry.description ? ' — ' + entry.description : ''}`,
            20,
            y
          )
          y += 7
        })
      }

      addFooter(doc, pageNum)

      const filename = `bilan_${reportData.date}.pdf`
      const filePath = path.join(getOutputDir(), filename)
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
    },
    grades: Array<{ subject: string; grade: number; coefficient: number; average: number }>,
    generalAverage: number
  ): { success: boolean; filePath?: string; error?: string } {
    try {
      const doc = new jsPDF()
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

      addFooter(doc, pageNum)

      const termSuffix = studentData.termName
        ? sanitizeFilename(studentData.termName)
        : `T${studentData.term}`
      const filename = `bulletin_${sanitizeFilename(studentData.last_name)}_${sanitizeFilename(studentData.first_name)}_${termSuffix}.pdf`
      const filePath = path.join(getOutputDir(), filename)
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
      const filePath = path.join(getOutputDir(), filename)
      doc.save(filePath)

      return { success: true, filePath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  }
}

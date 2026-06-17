const fs = require('fs')

const files = [
  'src/renderer/src/pages/AttendancePage.tsx',
  'src/renderer/src/pages/grades/GradeBook.tsx',
  'src/renderer/src/pages/grades/GradeEntry.tsx',
  'src/renderer/src/pages/grades/ReportCardView.tsx',
  'src/renderer/src/pages/Settings.tsx',
  'src/renderer/src/pages/settings/AssessmentSettings.tsx',
  'src/renderer/src/pages/students/CertificatePage.tsx',
  'src/renderer/src/pages/students/StudentDetail.tsx'
]

files.forEach((f) => {
  if (!fs.existsSync(f)) return

  let content = fs.readFileSync(f, 'utf8')
  let changed = false

  if (content.includes("'2025-2026'")) {
    content = content.replace(/'2025-2026'/g, 'useAppStore.getState().currentYear')
    changed = true
  }

  if (changed) {
    if (!content.includes('useAppStore')) {
      const importLine = "import { useAppStore } from '@/store/useAppStore';\n"
      const lastImportIndex = content.lastIndexOf('import ')
      if (lastImportIndex !== -1) {
        const nextLineIndex = content.indexOf('\n', lastImportIndex) + 1
        content = content.slice(0, nextLineIndex) + importLine + content.slice(nextLineIndex)
      } else {
        content = importLine + content
      }
    }
    fs.writeFileSync(f, content)
    console.log('Updated ' + f)
  }
})

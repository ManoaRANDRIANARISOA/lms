const fs = require('fs');
const files = [
  'src/renderer/src/pages/AttendancePage.tsx',
  'src/renderer/src/pages/grades/GradeBook.tsx',
  'src/renderer/src/pages/grades/GradeEntry.tsx',
  'src/renderer/src/pages/grades/ReportCardView.tsx',
  'src/renderer/src/pages/Settings.tsx',
  'src/renderer/src/pages/settings/AssessmentSettings.tsx',
  'src/renderer/src/pages/students/CertificatePage.tsx',
  'src/renderer/src/pages/students/StudentDetail.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (!content.includes('import { useAppStore }')) {
    content = "import { useAppStore } from '@/store/useAppStore'\n" + content;
    fs.writeFileSync(f, content);
    console.log('Added import to ' + f);
  }
});

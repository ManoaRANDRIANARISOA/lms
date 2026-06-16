CREATE INDEX IF NOT EXISTS idx_student_fees_student_id ON student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_event_id ON event_payments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_student_id ON event_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_personnel_absences_personnel_id ON personnel_absences(personnel_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_personnel_id ON salary_advances(personnel_id);
CREATE INDEX IF NOT EXISTS idx_custom_deductions_personnel_id ON custom_deductions(personnel_id);

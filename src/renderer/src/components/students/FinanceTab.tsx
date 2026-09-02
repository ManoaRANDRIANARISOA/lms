import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  DollarSign,
  Wallet,
  Bus,
  Utensils,
  Shirt,
  PartyPopper,
  GraduationCap,
  FileText,
  MoreHorizontal,
  Lock,
  Calendar,
  Users,
  Printer
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import { useFinanceStore } from '@/store/useFinanceStore'
import { useAppStore } from '@/store/useAppStore'
import { usePermissions } from '@/lib/usePermissions'
import type { Payment, FeeRecord, FinancePrices } from '@shared/types'

interface EventWithPayment {
  id: string
  event_name: string
  event_date: string
  amount_per_parent: number
  family_payment_status?: {
    is_paid: boolean
    total_paid: number
  }
}

interface MonthStatus {
  key: string
  month: string
  status: string
  paid: number
  balance: number
  cost: number
  expected?: number
}

interface TuitionStatusResult {
  success: boolean
  feeRecord?: FeeRecord
  status?: MonthStatus[]
}

interface ServiceCard {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  enabled: boolean
  status: string
  isOneTime: boolean
  balance?: number
}

const getTuitionCost = (
  record: FeeRecord | undefined | null,
  prices: FinancePrices | null,
  isPersonnelChild: boolean = false
) => {
  if (isPersonnelChild) return 0
  if (!record) return 0
  if (record.tuition_level && prices?.tuition?.[record.tuition_level]) {
    return prices.tuition[record.tuition_level]
  }
  return record.monthly_tuition || 0
}

const getBusCost = (record: FeeRecord | undefined | null, prices: FinancePrices | null) => {
  if (!record?.bus_subscribed || !record?.bus_route) return 0
  return prices?.bus?.[record.bus_route] || 0
}

const getCanteenCost = (record: FeeRecord | undefined | null, prices: FinancePrices | null) => {
  if (!record?.canteen_subscribed) return 0

  let daysCount = record.canteen_days_per_week || 0
  if (Array.isArray(record.canteen_days) && record.canteen_days.length > 0) {
    daysCount = record.canteen_days.length
  }

  const effectiveDays = daysCount === 0 ? 5 : daysCount

  const monthlyPrice = Number(prices?.canteen?.monthly) || 0
  const dailyPrice = Number(prices?.canteen?.daily) || 0

  if (monthlyPrice > 0 && effectiveDays >= 5) return monthlyPrice
  return dailyPrice * effectiveDays * 4
}

interface FinanceTabProps {
  studentId: string
  schoolYear: string
  feeRecord?: FeeRecord
  events?: EventWithPayment[]
}

export function FinanceTab({ studentId, schoolYear, feeRecord, events = [] }: FinanceTabProps) {
  const [status, setStatus] = useState<TuitionStatusResult | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false)
  const { prices: configPrices, fetchPrices } = useFinanceStore()
  const { canWrite } = usePermissions()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [isViewPaymentOpen, setIsViewPaymentOpen] = useState(false)
  const [studentInfo, setStudentInfo] = useState<any>(null)
  const [framFratrieStatus, setFramFratrieStatus] = useState<{ isPaid: boolean; by?: string }>({
    isPaid: false
  })

  // Listen for custom event from StudentDetail to open the payment modal (e.g. from Dossier tab)
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setFormData((prev) => ({ ...prev, payment_type: e.detail, month: '' }))
      setExpectedAmountOverride('')
      setIsAddPaymentOpen(true)
    }
    window.addEventListener('open-payment-modal', handler as EventListener)
    return () => window.removeEventListener('open-payment-modal', handler as EventListener)
  }, [])

  const [formData, setFormData] = useState({
    amount: '',
    payment_type: 'tuition',
    month: '',
    description: '',
    payment_method: 'cash',
    item: ''
  })
  const [expectedAmountOverride, setExpectedAmountOverride] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const cleanYear = (schoolYear || useAppStore.getState().currentYear || '2026-2027')
        .replace(/['"]/g, '')
        .trim()

      // Fetch status
      const statusRes = await window.api.payment.getTuitionStatus(studentId, cleanYear)
      // Fetch payments
      const paymentsRes = await window.api.payment.getByStudent(studentId, cleanYear)
      // Fetch configuration
      fetchPrices()

      // Fetch student info
      const studentRes = await window.api.student.get(studentId, cleanYear)
      if (studentRes.success) setStudentInfo(studentRes.student)

      // Fetch Fram fratrie
      const framRes = await window.api.payment.checkFramFratrie(studentId, cleanYear)
      if (framRes.success) setFramFratrieStatus({ isPaid: framRes.isPaid, by: framRes.by })

      if (statusRes.success) {
        setStatus(statusRes)
      }
      setPayments(paymentsRes || [])
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load finance data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [studentId, schoolYear])

  // Auto-fill amount based on type and configuration
  useEffect(() => {
    if (!configPrices) return

    let suggestedAmount = ''
    const currentRecord = status?.feeRecord || feeRecord

    if (formData.payment_type === 'tuition') {
      const cost = getTuitionCost(
        currentRecord,
        configPrices,
        Boolean(studentInfo?.is_personnel_child)
      )
      if (cost > 0) suggestedAmount = cost.toString()
    } else if (formData.payment_type === 'canteen') {
      const cost = getCanteenCost(currentRecord, configPrices)
      if (cost > 0) {
        suggestedAmount = cost.toString()
      } else if (configPrices.canteen?.monthly) {
        // Fallback to standard monthly if not subscribed
        suggestedAmount = configPrices.canteen.monthly.toString()
      }
    } else if (formData.payment_type === 'bus') {
      const cost = getBusCost(currentRecord, configPrices)
      if (cost > 0) suggestedAmount = cost.toString()
    } else if (formData.payment_type === 'enrollment') {
      if (configPrices.registration) suggestedAmount = configPrices.registration.toString()
    } else if (formData.payment_type === 'reenrollment') {
      if (configPrices.reenrollment) suggestedAmount = configPrices.reenrollment.toString()
    } else if (formData.payment_type === 'fram') {
      if (configPrices.fram) suggestedAmount = configPrices.fram.toString()
    } else if (formData.payment_type === 'uniform') {
      // Handle uniform item selection
      const items = Object.keys(configPrices.uniforms || {})
      if (items.length > 0) {
        let targetItem = formData.item

        // If no item selected, default to 'Tablier' or first item
        if (!targetItem) {
          targetItem = items.includes('Tablier') ? 'Tablier' : items[0]
          // Update state to select this item (will trigger effect again)
          setFormData((prev) => ({ ...prev, item: targetItem }))
          return
        }

        // If item is selected, use its price
        if (targetItem && configPrices.uniforms?.[targetItem]) {
          suggestedAmount = configPrices.uniforms[targetItem].toString()
        }
      }
    } else if (formData.payment_type === 'event') {
      if (formData.item) {
        const evt = events.find((e) => e.id === formData.item)
        if (evt && evt.amount_per_parent) {
          suggestedAmount = evt.amount_per_parent.toString()
        }
      }
    }

    if (suggestedAmount) {
      setFormData((prev) => ({ ...prev, amount: suggestedAmount }))
    }
  }, [formData.payment_type, formData.item, configPrices, status, feeRecord])

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const amount = parseFloat(formData.amount) || 0
      let discount = 0

      // Validation: Check if amount exceeds balance for monthly payments
      if (['tuition', 'canteen', 'bus'].includes(formData.payment_type) && formData.month) {
        let monthlyCost = 0
        const currentFeeRecord = status?.feeRecord || feeRecord

        if (formData.payment_type === 'tuition') {
          monthlyCost = getTuitionCost(
            currentFeeRecord,
            configPrices,
            Boolean(studentInfo?.is_personnel_child)
          )
        } else if (formData.payment_type === 'bus') {
          monthlyCost = getBusCost(currentFeeRecord, configPrices)
        } else if (formData.payment_type === 'canteen') {
          monthlyCost = getCanteenCost(currentFeeRecord, configPrices)
        }

        if (monthlyCost > 0) {
          const existingPayments = payments.filter(
            (p) => p.payment_type === formData.payment_type && p.month === formData.month
          )
          const paidAmount = existingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
          const actualBalance = monthlyCost - paidAmount

          const expectedOverride = parseFloat(expectedAmountOverride)
          if (
            !isNaN(expectedOverride) &&
            expectedOverride < actualBalance &&
            expectedOverride >= 0
          ) {
            // The user lowered the expected amount, meaning the difference is a discount
            discount = actualBalance - expectedOverride
          }

          const targetBalance = actualBalance - discount

          if (amount > targetBalance) {
            alert(
              `Le montant encaissé (${amount.toLocaleString()} Ar) dépasse le reste à payer convenu (${targetBalance.toLocaleString()} Ar) pour ce mois.`
            )
            return
          }
        }
      }

      let result: any
      if (formData.payment_type === 'event' && formData.item) {
        result = await window.api.event.recordPayment(
          formData.item,
          studentId,
          amount,
          formData.payment_method
        )
      } else {
        const paymentData = {
          student_id: studentId,
          payment_date: new Date().toISOString().split('T')[0],
          amount: amount,
          payment_type: formData.payment_type as Payment['payment_type'],
          month: ['tuition', 'canteen', 'bus'].includes(formData.payment_type)
            ? formData.month
            : undefined,
          description:
            formData.payment_type === 'uniform'
              ? `${formData.item}${formData.description ? ' - ' + formData.description : ''}`
              : formData.description,
          payment_method: formData.payment_method as Payment['payment_method'],
          school_year: schoolYear
        }

        result = await window.api.payment.create(paymentData)

        // Handle discount if provided
        if (result.success && discount > 0) {
          const discountData = {
            ...paymentData,
            amount: discount,
            payment_method: 'discount' as any,
            description: `Remise exceptionnelle${formData.description ? ' : ' + formData.description : ''}`
          }
          await window.api.payment.create(discountData)
        }
      }

      if (result.success) {
        // Auto-print 80mm thermal receipt in 2 copies (Parent + Cashier)
        if (window.api?.printer?.printReceipt) {
          const studentFullName = studentInfo
            ? `${studentInfo.last_name || ''} ${studentInfo.first_name || ''}`.trim()
            : ''
          const currentClass =
            status?.feeRecord?.class_name || feeRecord?.class_name || studentInfo?.class || ''

          window.api.printer
            .printReceipt(
              {
                payment_ids: result.id ? [result.id] : undefined,
                student_name: studentFullName,
                student_number: studentInfo?.registration_number || '',
                class_name: currentClass,
                amount: amount,
                payment_type: formData.payment_type,
                payment_date: new Date().toISOString().split('T')[0],
                month: formData.month || undefined,
                payment_method: formData.payment_method,
                description:
                  formData.payment_type === 'uniform'
                    ? `${formData.item}${formData.description ? ' - ' + formData.description : ''}`
                    : formData.description,
                receipt_number: result.receipt_number || `REC-${Date.now().toString().slice(-6)}`,
                is_duplicate: false
              },
              2
            )
            .then((printRes) => {
              if (printRes.success) {
                toast.success('Reçu thermique imprimé (2 exemplaires)')
              } else {
                toast.warning("Paiement enregistré (l'imprimante n'a pas répondu: " + (printRes.error || '') + ')')
              }
            })
            .catch((err) => console.warn('Thermal print error:', err))
        }

        setIsAddPaymentOpen(false)
        setFormData({
          amount: '',
          payment_type: 'tuition',
          month: '',
          description: '',
          payment_method: 'cash',
          item: ''
        })
        setExpectedAmountOverride('')
        loadData() // Reload data
      } else {
        toast.error('Erreur lors du paiement: ' + result.error)
      }
    } catch (error: unknown) {
      toast.error('Erreur: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const handlePrintReceipt = async (payment: Payment) => {
    if (!window.api?.printer?.printReceipt) {
      toast.error('Service impression non disponible')
      return
    }
    const studentFullName = studentInfo
      ? `${studentInfo.last_name || ''} ${studentInfo.first_name || ''}`.trim()
      : ''
    const currentClass =
      status?.feeRecord?.class_name || feeRecord?.class_name || studentInfo?.class || ''

    const isDuplicate = (payment.print_count || 0) >= 1
    const toastId = toast.loading(
      isDuplicate
        ? 'Impression du duplicata de reçu...'
        : "Impression du reçu sur l'imprimante thermique..."
    )

    try {
      const res = await window.api.printer.printReceipt(
        {
          payment_ids: [payment.id],
          student_name: studentFullName,
          student_number: studentInfo?.registration_number || '',
          class_name: currentClass,
          amount: Number(payment.amount) || 0,
          payment_type: payment.payment_type,
          payment_date: payment.payment_date,
          month: payment.month || undefined,
          payment_method: payment.payment_method,
          description: payment.description || undefined,
          receipt_number:
            payment.receipt_number ||
            `REC-${(payment.id || Date.now().toString()).slice(-6).toUpperCase()}`,
          is_duplicate: isDuplicate,
          duplicate_count: isDuplicate ? (payment.print_count || 0) + 1 : 1
        },
        2
      )

      if (res.success) {
        toast.success(
          isDuplicate
            ? `Duplicata N°${(payment.print_count || 0) + 1} imprimé (2 exemplaires)`
            : 'Reçu imprimé en 2 exemplaires (Parent + Caisse)',
          { id: toastId }
        )
        loadData() // Reload to refresh print_count in table
      } else {
        toast.error(res.error || "Échec d'impression du reçu", { id: toastId })
      }
    } catch (e: unknown) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : String(e)), { id: toastId })
    }
  }

  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([])

  const toggleSelectPayment = (id: string) => {
    setSelectedPaymentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const toggleSelectAllPayments = () => {
    if (selectedPaymentIds.length === payments.length) {
      setSelectedPaymentIds([])
    } else {
      setSelectedPaymentIds(payments.map((p) => p.id))
    }
  }

  const handlePrintGroupedReceipt = async () => {
    const selectedPayments = payments.filter((p) => selectedPaymentIds.includes(p.id))
    if (selectedPayments.length === 0) {
      toast.error('Veuillez sélectionner au moins un paiement.')
      return
    }

    if (!window.api?.printer?.printReceipt) {
      toast.error('Service impression non disponible')
      return
    }

    const studentFullName = studentInfo
      ? `${studentInfo.last_name || ''} ${studentInfo.first_name || ''}`.trim()
      : ''
    const currentClass =
      status?.feeRecord?.class_name || feeRecord?.class_name || studentInfo?.class || ''

    const items = selectedPayments.map((p) => {
      let label = ''
      if (p.payment_type === 'tuition') {
        label = `Écolage (${p.month || 'Mois'})`
      } else if (p.payment_type === 'enrollment') {
        label = "Droit d'inscription"
      } else if (p.payment_type === 'reenrollment') {
        label = 'Droit de réinscription'
      } else if (p.payment_type === 'fram') {
        label = 'Cotisation FRAM'
      } else if (p.payment_type === 'bus') {
        label = `Transport (${p.month || 'Bus'})`
      } else if (p.payment_type === 'canteen') {
        label = `Cantine (${p.month || 'Mois'})`
      } else if (p.payment_type === 'uniform') {
        label = `Uniforme / Fournitures`
      } else {
        label = p.description || p.payment_type
      }

      return {
        label,
        amount: Number(p.amount) || 0,
        detail: p.description && p.description !== label ? p.description : undefined,
        payment_type: p.payment_type,
        month: p.month || undefined
      }
    })

    const totalSelectedAmount = items.reduce((sum, item) => sum + item.amount, 0)
    const primaryMethod = selectedPayments[0]?.payment_method || 'cash'
    const latestDate = selectedPayments[0]?.payment_date || new Date().toISOString().split('T')[0]

    const isAnyDuplicate = selectedPayments.some((p) => (p.print_count || 0) >= 1)
    const maxCount = Math.max(0, ...selectedPayments.map((p) => p.print_count || 0))
    const groupedReceiptNum =
      selectedPayments.length === 1
        ? selectedPayments[0].receipt_number || `REC-${Date.now().toString().slice(-6)}`
        : `REC-GRP-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`

    const toastId = toast.loading(
      `Impression du reçu groupé (${selectedPayments.length} paiements)...`
    )

    try {
      const res = await window.api.printer.printReceipt(
        {
          payment_ids: selectedPayments.map((p) => p.id),
          student_name: studentFullName,
          student_number: studentInfo?.registration_number || '',
          class_name: currentClass,
          amount: totalSelectedAmount,
          payment_date: latestDate,
          payment_method: primaryMethod,
          receipt_number: groupedReceiptNum,
          is_duplicate: isAnyDuplicate,
          duplicate_count: isAnyDuplicate ? maxCount + 1 : 1,
          items
        },
        2
      )

      if (res.success) {
        toast.success(
          isAnyDuplicate
            ? `Reçu groupé (Duplicata N°${maxCount + 1}) imprimé en 2 exemplaires`
            : 'Reçu groupé imprimé en 2 exemplaires (Parent + Caisse)',
          { id: toastId }
        )
        loadData() // Reload to refresh print_count in table
      } else {
        toast.error(res.error || "Échec d'impression du reçu groupé", { id: toastId })
      }
    } catch (e: unknown) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : String(e)), { id: toastId })
    }
  }

  const getPaymentDetails = (type: string) => {
    return payments.find((p) => p.payment_type === type)
  }

  const totalPaid = payments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)

  const busFeeRecord = status?.feeRecord || feeRecord

  // Determine if student is new or returning
  const hasReenrollmentPayment = payments.some((p) => p.payment_type === 'reenrollment')
  const hasEnrollmentPayment = payments.some((p) => p.payment_type === 'enrollment')

  let isReturning = false
  if (hasReenrollmentPayment) {
    isReturning = true
  } else if (hasEnrollmentPayment) {
    isReturning = false
  } else {
    isReturning =
      studentInfo?.student_status === 'Ancien' ||
      busFeeRecord?.is_reenrollment === 1 ||
      busFeeRecord?.is_reenrollment === true
  }

  const enrollmentType = isReturning ? 'reenrollment' : 'enrollment'
  const enrollmentLabel = isReturning ? 'Réinscription' : "Frais d'inscription"

  const enrollmentExpected = isReturning ? configPrices?.reenrollment : configPrices?.registration
  const enrollmentPaidAmt = payments
    .filter((p) => p.payment_type === 'enrollment' || p.payment_type === 'reenrollment')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const enrollmentBalance = (enrollmentExpected || 0) - enrollmentPaidAmt

  const getEnrollmentStatus = () => {
    if (enrollmentPaidAmt >= (enrollmentExpected || 0) && enrollmentPaidAmt > 0) return 'paid'
    if (enrollmentPaidAmt > 0) return 'partial'
    return 'pending'
  }

  const framExpected = configPrices?.fram || 0
  const framPaidAmt = payments
    .filter((p) => p.payment_type === 'fram')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const framBalance =
    framFratrieStatus.isPaid || busFeeRecord?.fram_paid_by_parent ? 0 : framExpected - framPaidAmt

  const getFramStatus = () => {
    if (framFratrieStatus.isPaid) return 'paid_fratrie'
    if (busFeeRecord?.fram_paid_by_parent || (framPaidAmt >= framExpected && framPaidAmt > 0))
      return 'paid'
    if (framPaidAmt > 0) return 'partial'
    return 'pending'
  }

  // Service Cards Configuration
  const services: ServiceCard[] = [
    {
      id: enrollmentType,
      label: enrollmentLabel,
      icon: FileText,
      color: isReturning ? 'text-indigo-600' : 'text-purple-600',
      bg: isReturning ? 'bg-indigo-50' : 'bg-purple-50',
      enabled: true,
      status: getEnrollmentStatus(),
      balance: Math.max(0, enrollmentBalance),
      isOneTime: true
    },
    {
      id: 'fram',
      label: 'Cotisation FRAM',
      icon: Users,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      enabled: true,
      status: getFramStatus(),
      balance: Math.max(0, framBalance),
      isOneTime: true
    },
    {
      id: 'bus',
      label: 'Transport',
      icon: Bus,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      enabled: busFeeRecord?.bus_subscribed || false,
      status: 'any',
      isOneTime: false
    },
    {
      id: 'canteen',
      label: 'Cantine',
      icon: Utensils,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      enabled: busFeeRecord?.canteen_subscribed || false,
      status: 'any',
      isOneTime: false
    },
    {
      id: 'uniform',
      label: 'Uniforme',
      icon: Shirt,
      color: 'text-pink-600',
      bg: 'bg-pink-50',
      enabled: Object.keys(configPrices?.uniforms || {}).length > 0,
      status: payments.some((p) => p.payment_type === 'uniform') ? 'paid' : 'any',
      isOneTime: false
    },
    {
      id: 'event',
      label: 'Événement',
      icon: PartyPopper,
      color: 'text-red-600',
      bg: 'bg-red-50',
      enabled: true,
      status: 'any',
      isOneTime: false
    },
    {
      id: 'other',
      label: 'Autre',
      icon: MoreHorizontal,
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      enabled: true,
      status: 'any',
      isOneTime: false
    }
  ]

  const handleCardClick = (service: ServiceCard) => {
    if (!service.enabled) return

    if (!status?.feeRecord && service.id !== 'other') {
      alert(
        "Cet élève n'est pas encore inscrit dans une classe pour l'année " +
          schoolYear +
          ". Veuillez d'abord l'inscrire via le bouton 'Inscrire' en haut à droite."
      )
      return
    }

    if (service.isOneTime && (service.status === 'paid' || service.status === 'paid_fratrie')) {
      const payment = getPaymentDetails(service.id)
      if (payment) {
        setSelectedPayment(payment)
        setIsViewPaymentOpen(true)
      } else if (service.status === 'paid_fratrie') {
        alert('Cette cotisation a déjà été couverte par un membre de la fratrie.')
      } else {
        alert("Le paiement a été enregistré avec l'inscription.")
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        payment_type: service.id,
        amount: service.balance && service.balance > 0 ? service.balance.toString() : '',
        month: '',
        description: '',
        item: ''
      }))
      setIsAddPaymentOpen(true)
    }
  }

  const handleMonthClick = (type: string, monthData: MonthStatus) => {
    if (!status?.feeRecord) {
      alert(
        "Cet élève n'est pas encore inscrit dans une classe pour l'année " +
          schoolYear +
          ". Veuillez d'abord l'inscrire via le bouton 'Inscrire' en haut à droite."
      )
      return
    }

    if (monthData.status === 'paid') {
      const payment = payments.find((p) => p.payment_type === type && p.month === monthData.key)
      if (payment) {
        setSelectedPayment(payment)
        setIsViewPaymentOpen(true)
      }
    } else if (canWrite('payments')) {
      setFormData((prev) => ({
        ...prev,
        payment_type: type,
        month: monthData.key,
        amount:
          monthData.balance > 0
            ? monthData.balance.toString()
            : (monthData.cost || monthData.expected || 0).toString(),
        description: '',
        item: ''
      }))
      setIsAddPaymentOpen(true)
    }
  }

  // Helper to calculate monthly status for other services
  const getServiceMonthlyStatus = (type: 'bus' | 'canteen', monthlyCost: number) => {
    if (!status?.status || !monthlyCost) return []

    return status.status.map((month: MonthStatus) => {
      // Find payments for this service and month
      const monthPayments = payments.filter((p) => p.payment_type === type && p.month === month.key)

      const paidAmount = monthPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      const balance = monthlyCost - paidAmount

      let statusStr = 'unpaid'
      if (paidAmount >= monthlyCost) statusStr = 'paid'
      else if (paidAmount > 0) statusStr = 'partial'

      return {
        ...month, // key, month (label)
        status: statusStr,
        paid: paidAmount,
        balance: balance > 0 ? balance : 0,
        cost: monthlyCost
      }
    })
  }

  const busCost = getBusCost(status?.feeRecord, configPrices)

  const canteenCost = getCanteenCost(feeRecord || status?.feeRecord, configPrices)

  const busStatus = getServiceMonthlyStatus('bus', busCost)
  const canteenStatus = getServiceMonthlyStatus('canteen', canteenCost)

  // Get relevant months based on selected payment type
  const getMonthsForPaymentType = () => {
    if (formData.payment_type === 'bus') return busStatus
    if (formData.payment_type === 'canteen') return canteenStatus
    return status?.status || [] // Default to tuition/global status
  }

  const renderMonthGrid = (title: string, type: string, data: MonthStatus[]) => {
    if (!data || data.length === 0) return null
    return (
      <div className="bg-white p-6 rounded-lg shadow border border-gray-100 mt-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center text-gray-800">
          {type === 'tuition' && <GraduationCap className="w-5 h-5 mr-2 text-blue-600" />}
          {type === 'bus' && <Bus className="w-5 h-5 mr-2 text-yellow-600" />}
          {type === 'canteen' && <Utensils className="w-5 h-5 mr-2 text-orange-600" />}
          {title}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {data.map((month) => (
            <div
              key={month.key}
              onClick={() => handleMonthClick(type, month)}
              className={`
                              relative p-4 rounded-lg border-2 flex flex-col items-center justify-center text-center min-h-[110px] cursor-pointer transition-all hover:shadow-md
                              ${
                                month.status === 'paid'
                                  ? 'border-green-100 bg-green-50'
                                  : month.status === 'partial'
                                    ? 'border-yellow-100 bg-yellow-50'
                                    : 'border-red-100 bg-red-50 hover:border-red-200'
                              }
                          `}
            >
              <span className="text-sm font-medium text-gray-700 mb-2">{month.month}</span>
              <div className="mb-2">
                {month.status === 'paid' && <CheckCircle2 className="w-8 h-8 text-green-500" />}
                {month.status === 'partial' && <AlertCircle className="w-8 h-8 text-yellow-500" />}
                {month.status === 'unpaid' && <XCircle className="w-8 h-8 text-red-400" />}
              </div>
              <span
                className={`text-xs font-bold ${
                  month.status === 'exempt'
                    ? 'text-purple-700'
                    : month.status === 'unassigned_class'
                      ? 'text-amber-700'
                      : month.status === 'paid'
                        ? 'text-green-700'
                        : month.status === 'partial'
                          ? 'text-yellow-700'
                          : 'text-red-700'
                }`}
              >
                {month.status === 'exempt'
                  ? 'EXONÉRÉ'
                  : month.status === 'unassigned_class'
                    ? 'NON SPÉCIFIÉE'
                    : month.status === 'paid'
                      ? 'PAYÉ'
                      : month.status === 'partial'
                        ? `Reste: ${month.balance?.toLocaleString()} Ar`
                        : `${(month.cost || month.expected || 0).toLocaleString()} Ar`}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading) return <div className="p-4 text-center">Chargement des données financières...</div>

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex flex-col justify-center min-h-[100px] overflow-hidden">
          <div className="flex items-center text-gray-500 mb-2">
            <DollarSign className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="text-sm font-medium truncate">Écolage Mensuel</span>
          </div>
          <p
            className={`text-2xl font-bold truncate ${studentInfo?.is_personnel_child && studentInfo?.student_status !== 'Non inscrit' && status?.feeRecord ? 'text-purple-600 text-lg' : 'text-gray-900'}`}
            title={`${(studentInfo?.is_personnel_child && studentInfo?.student_status !== 'Non inscrit' && status?.feeRecord ? 0 : configPrices?.tuition?.[status?.feeRecord?.tuition_level ?? ''] || status?.feeRecord?.monthly_tuition || 0).toLocaleString()} Ar`}
          >
            {studentInfo?.is_personnel_child &&
            studentInfo?.student_status !== 'Non inscrit' &&
            status?.feeRecord
              ? 'EXONÉRÉ (Enfant Personnel)'
              : studentInfo?.student_status === 'Non inscrit' || !status?.feeRecord
                ? 'NON INSCRIT'
                : `${(configPrices?.tuition?.[status?.feeRecord?.tuition_level ?? ''] || status?.feeRecord?.monthly_tuition || 0).toLocaleString()} Ar`}
          </p>
          <p className="text-xs text-gray-500 truncate">
            Niveau: {status?.feeRecord?.tuition_level || '-'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex flex-col justify-center min-h-[100px] overflow-hidden">
          <div className="flex items-center text-gray-500 mb-2">
            <Wallet className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="text-sm font-medium truncate">Total Payé (Global)</span>
          </div>
          <p
            className="text-2xl font-bold text-green-600 truncate"
            title={`${totalPaid.toLocaleString()} Ar`}
          >
            {totalPaid.toLocaleString()} Ar
          </p>
        </div>
      </div>

      {/* Services Dashboard (Payment Types) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {services.map((service) => (
          <div
            key={service.id}
            onClick={() => handleCardClick(service)}
            className={`
                      relative p-4 rounded-lg border-2 flex flex-col items-center justify-center text-center min-h-[100px] transition-all
                      ${
                        !service.enabled
                          ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100'
                          : service.status === 'paid' || service.status === 'paid_fratrie'
                            ? 'cursor-default bg-green-50 border-green-100'
                            : service.status === 'partial'
                              ? 'cursor-pointer hover:shadow-md hover:border-yellow-300 bg-yellow-50 border-yellow-100'
                              : 'cursor-pointer hover:shadow-md hover:border-gray-300 bg-white border-gray-100'
                      }
                  `}
          >
            {!service.enabled && (
              <div className="absolute top-2 right-2">
                <Lock className="w-3 h-3 text-gray-400" />
              </div>
            )}
            {(service.status === 'paid' || service.status === 'paid_fratrie') && (
              <div className="absolute top-2 right-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </div>
            )}

            <div className={`p-2 rounded-full mb-2 ${service.bg}`}>
              <service.icon className={`w-5 h-5 ${service.color}`} />
            </div>
            <span className="text-sm font-medium text-gray-900">{service.label}</span>

            {service.status === 'paid' && (
              <span className="text-xs text-green-600 font-bold mt-1">PAYÉ</span>
            )}
            {service.status === 'paid_fratrie' && (
              <span className="text-[10px] text-green-600 font-bold mt-1">PAYÉ (FRATRIE)</span>
            )}
            {service.status === 'partial' && (
              <span className="text-[10px] text-yellow-600 font-bold mt-1">
                RESTE: {service.balance?.toLocaleString() || 0} Ar
              </span>
            )}
            {service.status === 'pending' && service.isOneTime && (
              <span className="text-[10px] text-red-600 font-bold mt-1">
                À PAYER: {service.balance?.toLocaleString() || 0} Ar
              </span>
            )}
            {!service.enabled && (
              <span className="text-[10px] text-gray-400 mt-1">Non souscrit</span>
            )}
          </div>
        ))}
      </div>

      {/* Events Section */}
      {events && events.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 mt-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center text-gray-800">
            <PartyPopper className="w-5 h-5 mr-2 text-indigo-600" />
            Événements & Sorties
            <span className="ml-3 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex items-center">
              <Users className="w-3 h-3 mr-1" />
              Paiement unique par famille
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {events.map((event) => {
              const isPaid = event.family_payment_status?.is_paid
              const balance = Math.max(
                0,
                event.amount_per_parent - (event.family_payment_status?.total_paid || 0)
              )

              return (
                <div
                  key={event.id}
                  className={`
                    relative p-5 rounded-xl border-2 flex flex-col justify-between min-h-[140px] transition-all
                    ${
                      isPaid
                        ? 'border-indigo-100 bg-gradient-to-br from-indigo-50 to-white'
                        : balance < event.amount_per_parent
                          ? 'border-yellow-100 bg-gradient-to-br from-yellow-50 to-white hover:shadow-md hover:border-yellow-300'
                          : 'border-rose-100 bg-gradient-to-br from-rose-50 to-white hover:shadow-md hover:border-rose-300'
                    }
                  `}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4
                      className="font-semibold text-gray-800 leading-tight"
                      title={event.event_name}
                    >
                      {event.event_name}
                    </h4>
                    {isPaid ? (
                      <CheckCircle2 className="w-6 h-6 text-indigo-500 flex-shrink-0 ml-2" />
                    ) : balance < event.amount_per_parent ? (
                      <AlertCircle className="w-6 h-6 text-yellow-500 flex-shrink-0 ml-2" />
                    ) : (
                      <XCircle className="w-6 h-6 text-rose-400 flex-shrink-0 ml-2" />
                    )}
                  </div>

                  <div className="mt-auto pt-4 flex flex-col">
                    <div className="text-xs text-gray-500 mb-1 flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {format(new Date(event.event_date), 'dd MMM yyyy', { locale: fr })}
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-bold ${
                          isPaid
                            ? 'text-indigo-700'
                            : balance < event.amount_per_parent
                              ? 'text-yellow-700'
                              : 'text-rose-700'
                        }`}
                      >
                        {isPaid
                          ? 'RÉGLÉ (FRATRIE)'
                          : balance < event.amount_per_parent
                            ? `RESTE: ${balance.toLocaleString()} Ar`
                            : `${event.amount_per_parent.toLocaleString()} Ar`}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <Dialog
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        title="Enregistrer un paiement"
        footer={
          <Button
            type="submit"
            form="payment-form"
            disabled={!canWrite('payments')}
            title={!canWrite('payments') ? 'Accès refusé' : undefined}
          >
            Enregistrer le paiement
          </Button>
        }
      >
        <form id="payment-form" onSubmit={handlePaymentSubmit} className="space-y-4 mt-4">
          <div className="grid gap-2">
            <Label htmlFor="type">Type de paiement</Label>
            <select
              id="type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={formData.payment_type}
              onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
              disabled // Lock the type since we clicked a specific card
            >
              <option value="tuition">Écolage Mensuel</option>
              <option value="enrollment">Droit d'inscription</option>
              <option value="reenrollment">Réinscription</option>
              <option value="fram">Cotisation FRAM</option>
              <option value="bus">Transport (Bus)</option>
              <option value="canteen">Cantine</option>
              <option value="uniform">Uniforme</option>
              <option value="event">Événement</option>
              <option value="other">Autre</option>
            </select>
          </div>

          {['tuition', 'bus', 'canteen'].includes(formData.payment_type) && (
            <div className="grid gap-2">
              <Label htmlFor="month">Mois concerné</Label>
              <select
                id="month"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.month}
                onChange={(e) => {
                  setFormData({ ...formData, month: e.target.value })

                  // Auto-fill the expectedAmountOverride when a month is selected
                  if (e.target.value) {
                    const selectedMonthData = getMonthsForPaymentType().find(
                      (m) => m.key === e.target.value
                    )
                    if (selectedMonthData && selectedMonthData.balance !== undefined) {
                      setExpectedAmountOverride(selectedMonthData.balance.toString())
                    } else {
                      setExpectedAmountOverride('')
                    }
                  } else {
                    setExpectedAmountOverride('')
                  }
                }}
                required
              >
                <option value="">Sélectionner un mois</option>
                {getMonthsForPaymentType()
                  .filter((m: MonthStatus) => m.status !== 'paid')
                  .map((m: MonthStatus) => (
                    <option key={m.key} value={m.key}>
                      {m.month} (
                      {m.status === 'partial'
                        ? `Reste: ${m.balance?.toLocaleString()} Ar`
                        : 'Non payé'}
                      )
                    </option>
                  ))}
              </select>
            </div>
          )}

          {formData.payment_type === 'uniform' &&
            configPrices?.uniforms &&
            Object.keys(configPrices.uniforms).length > 0 && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="item">Article</Label>
                  <select
                    id="item"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formData.item}
                    onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                  >
                    {Object.keys(configPrices.uniforms).map((item) => (
                      <option key={item} value={item}>
                        {item} ({configPrices.uniforms[item].toLocaleString()} Ar)
                      </option>
                    ))}
                  </select>
                </div>
                {payments.filter((p) => p.payment_type === 'uniform').length > 0 && (
                  <div className="text-sm border p-3 rounded-md bg-gray-50">
                    <p className="font-semibold text-gray-700 mb-1">Articles déjà achetés :</p>
                    <ul className="list-disc pl-5 text-gray-600 space-y-1">
                      {payments
                        .filter((p) => p.payment_type === 'uniform')
                        .map((p) => (
                          <li key={p.id}>
                            <span className="font-medium">{p.description || 'Uniforme'}</span> -{' '}
                            {Number(p.amount).toLocaleString()} Ar{' '}
                            <span className="text-gray-400 text-xs">
                              ({new Date(p.payment_date).toLocaleDateString('fr-FR')})
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          {formData.payment_type === 'event' && events && events.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="event_item">Sélectionner l'événement</Label>
              <select
                id="event_item"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.item}
                onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                required
              >
                <option value="">Sélectionner un événement</option>
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.event_name} ({evt.amount_per_parent.toLocaleString()} Ar)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Expected amount override if partial payment on a monthly fee */}
          {(() => {
            if (!['tuition', 'canteen', 'bus'].includes(formData.payment_type) || !formData.month)
              return null
            let monthlyCost = 0
            const currentFeeRecord = status?.feeRecord || feeRecord
            if (formData.payment_type === 'tuition') {
              monthlyCost = getTuitionCost(
                currentFeeRecord,
                configPrices,
                Boolean(studentInfo?.is_personnel_child)
              )
            } else if (formData.payment_type === 'bus') {
              monthlyCost = getBusCost(currentFeeRecord, configPrices)
            } else if (formData.payment_type === 'canteen') {
              monthlyCost = getCanteenCost(currentFeeRecord, configPrices)
            }
            const existingPayments = payments.filter(
              (p) => p.payment_type === formData.payment_type && p.month === formData.month
            )
            const paidAmount = existingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
            const actualBalance = monthlyCost - paidAmount
            const expectedOverride = parseFloat(expectedAmountOverride)
            const discountCalculated =
              !isNaN(expectedOverride) && expectedOverride < actualBalance && expectedOverride >= 0
                ? actualBalance - expectedOverride
                : 0

            return (
              <div className="grid gap-2 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <Label htmlFor="expected" className="text-gray-700 font-medium">
                  Reste à payer convenu pour ce mois (Ar)
                </Label>
                <Input
                  id="expected"
                  type="number"
                  className="bg-white border-gray-300"
                  value={expectedAmountOverride}
                  onChange={(e) => setExpectedAmountOverride(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Par défaut, le système attend {actualBalance.toLocaleString()} Ar. Modifiez cette
                  valeur si un tarif réduit a été convenu pour ce mois spécifiquement.
                </p>
                {discountCalculated > 0 && (
                  <p className="text-xs text-orange-600 font-medium">
                    Une remise de {discountCalculated.toLocaleString()} Ar sera automatiquement
                    appliquée pour ajuster le solde.
                  </p>
                )}
              </div>
            )
          })()}

          <div className="grid gap-2">
            <Label htmlFor="amount">Montant encaissé aujourd'hui (Ar)</Label>
            <Input
              id="amount"
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="method">Mode de paiement</Label>
            <select
              id="method"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
            >
              <option value="cash">Espèces</option>
              <option value="check">Chèque</option>
              <option value="transfer">Virement</option>
              <option value="mobile_money">Mobile Money</option>
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="desc">Description / Note</Label>
            <Input
              id="desc"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        isOpen={isViewPaymentOpen}
        onClose={() => setIsViewPaymentOpen(false)}
        title="Détails du paiement"
      >
        {selectedPayment && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <p className="text-sm font-medium">
                  {new Date(selectedPayment.payment_date).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <div>
                <Label>Montant</Label>
                <p className="text-sm font-medium">
                  {Number(selectedPayment.amount).toLocaleString()} Ar
                </p>
              </div>
              <div>
                <Label>Mode de paiement</Label>
                <p className="text-sm font-medium capitalize">
                  {selectedPayment.payment_method === 'discount'
                    ? 'Remise'
                    : selectedPayment.payment_method}
                </p>
              </div>
              <div>
                <Label>Type</Label>
                <p className="text-sm font-medium capitalize">
                  {selectedPayment.payment_type === 'enrollment'
                    ? "Frais d'inscription"
                    : selectedPayment.payment_type === 'reenrollment'
                      ? 'Frais de réinscription'
                      : selectedPayment.payment_type}
                </p>
              </div>
            </div>
            {selectedPayment.description && (
              <div>
                <Label>Description</Label>
                <p className="text-sm text-gray-600">{selectedPayment.description}</p>
              </div>
            )}
            <div className="pt-4 flex justify-end">
              <Button variant="outline" onClick={() => setIsViewPaymentOpen(false)}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Monthly Tracking Grid (Tuition) */}
      {!status?.feeRecord &&
      (!studentInfo?.class ||
        studentInfo.class === 'Non inscrit' ||
        studentInfo.class === 'Classe non spécifiée') ? (
        <div className="bg-amber-50 p-6 rounded-lg shadow border border-amber-200 mt-6 text-center">
          <h3 className="text-lg font-semibold text-amber-800 mb-2">Élève non inscrit</h3>
          <p className="text-amber-700">
            Cet élève n'est pas encore inscrit dans une classe pour l'année scolaire {schoolYear}.
            Veuillez l'inscrire via le bouton "Inscrire" en haut de la page pour activer le suivi
            des paiements.
          </p>
        </div>
      ) : (
        renderMonthGrid(`Suivi des Écolages (${schoolYear})`, 'tuition', status?.status ?? [])
      )}

      {/* Monthly Tracking Grid (Bus) */}
      {!!status?.feeRecord?.bus_subscribed &&
        renderMonthGrid(
          `Suivi du Transport (${status.feeRecord.bus_route} - ${busCost.toLocaleString()} Ar/mois)`,
          'bus',
          busStatus
        )}

      {/* Monthly Tracking Grid (Canteen) */}
      {!!status?.feeRecord?.canteen_subscribed &&
        renderMonthGrid(
          `Suivi de la Cantine (${canteenCost.toLocaleString()} Ar/mois)`,
          'canteen',
          canteenStatus
        )}

      {/* Payment History List */}
      <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Historique des Paiements</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
              {payments.length} paiement{payments.length > 1 ? 's' : ''}
            </span>
          </div>

          {selectedPaymentIds.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground bg-accent/40 px-2.5 py-1 rounded border border-primary/20">
                {selectedPaymentIds.length} sélectionné{selectedPaymentIds.length > 1 ? 's' : ''} • Total:{' '}
                {payments
                  .filter((p) => selectedPaymentIds.includes(p.id))
                  .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
                  .toLocaleString()}{' '}
                Ar
              </span>
              <Button
                size="sm"
                onClick={handlePrintGroupedReceipt}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 flex items-center gap-1.5 shadow-sm border border-primary/20"
                title="Imprimer un seul reçu 80mm regroupant tous les paiements cochés"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer Reçu Groupé ({selectedPaymentIds.length})</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedPaymentIds([])}
                className="text-xs h-8 text-muted-foreground hover:text-foreground hover:bg-accent/20"
              >
                Désélectionner
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50/80 text-muted-foreground uppercase text-xs border-b border-border/60">
              <tr>
                <th className="px-4 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={payments.length > 0 && selectedPaymentIds.length === payments.length}
                    onChange={toggleSelectAllPayments}
                    className="rounded border-border text-primary focus:ring-primary cursor-pointer w-4 h-4 accent-[#AD8B73]"
                    title="Tout sélectionner / Tout désélectionner"
                  />
                </th>
                <th className="px-4 py-3">N° Reçu / Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Mois / Détail</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {payments.length > 0 ? (
                payments.map((payment) => {
                  const isSelected = selectedPaymentIds.includes(payment.id)
                  return (
                    <tr
                      key={payment.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-primary/10 font-medium' : 'hover:bg-accent/15'
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectPayment(payment.id)}
                          className="rounded border-border text-primary focus:ring-primary cursor-pointer w-4 h-4 accent-[#AD8B73]"
                        />
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        <div className="font-mono text-xs font-semibold text-primary">
                          {payment.receipt_number || '—'}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {format(new Date(payment.payment_date), 'dd MMM yyyy', { locale: fr })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-accent/30 text-foreground text-xs font-medium px-2.5 py-0.5 rounded capitalize border border-border/50">
                          {payment.payment_type === 'tuition'
                            ? 'Écolage'
                            : payment.payment_type === 'enrollment'
                              ? 'Inscription'
                              : payment.payment_type === 'reenrollment'
                                ? 'Réinscription'
                                : payment.payment_type === 'bus'
                                  ? 'Transport'
                                  : payment.payment_type === 'canteen'
                                    ? 'Cantine'
                                    : payment.payment_type === 'fram'
                                      ? 'FRAM'
                                      : payment.payment_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {payment.month ? (
                          <span className="font-semibold text-foreground">{payment.month}</span>
                        ) : (
                          payment.description || '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {payment.amount.toLocaleString()} Ar
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">
                        {payment.payment_method === 'discount'
                          ? 'Remise'
                          : payment.payment_method === 'mobile_money'
                            ? 'Mobile Money'
                            : payment.payment_method === 'transfer'
                              ? 'Virement'
                              : payment.payment_method === 'check'
                                ? 'Chèque'
                                : 'Espèces'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(payment.print_count || 0) > 0 && (
                            <span
                              className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-medium shrink-0"
                              title={`Ce reçu a été imprimé ${payment.print_count} fois (Duplicata)`}
                            >
                              Duplicata ({payment.print_count})
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrintReceipt(payment)}
                            className="h-7 px-2.5 text-xs flex items-center gap-1.5 border-border hover:bg-accent/30 hover:text-primary hover:border-primary/40 text-foreground"
                            title="Imprimer ce ticket individuel (Double exemplaire 80mm)"
                          >
                            <Printer className="w-3.5 h-3.5 text-primary" />
                            <span>Ticket</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Aucun paiement enregistré pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

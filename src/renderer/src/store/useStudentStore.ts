import { create } from 'zustand';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase for Web Mode (Chrome/Edge)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  photo_path?: string;
  date_of_birth?: string;
  place_of_birth?: string;
  class: string;
  registration_number: string;
  enrollment_date: string;
  departure_date?: string;
  previous_school?: string;
  
  father_name?: string;
  father_contact?: string;
  father_profession?: string;
  
  mother_name?: string;
  mother_contact?: string;
  mother_profession?: string;
  
  guardian_name?: string;
  guardian_contact?: string;
  guardian_profession?: string;
  address?: string;
  
  siblings: string[]; // IDs

  // Services & Fees (Optional for display/update)
  bus_subscribed?: boolean;
  bus_route?: string;
  canteen_subscribed?: boolean;
  canteen_days_per_week?: number;
  canteen_days?: string[];
  
  uniform_tshirt_purchased?: boolean;
  uniform_apron_purchased?: boolean;
  uniform_shorts_purchased?: boolean;
  uniform_badge_purchased?: boolean;
  
  fram_paid_by_parent?: boolean;
}

interface StudentStore {
  students: Student[];
  currentStudent: Student | null;
  currentFees: any | null;
  currentFeesHistory: any[] | null;
  currentPayments: any[] | null;
  loading: boolean;
  error: string | null;
  
  fetchStudents: (filters?: any) => Promise<void>;
  getStudent: (id: string) => Promise<void>;
  createStudent: (data: Partial<Student>) => Promise<void>;
  updateStudent: (id: string, data: Partial<Student>) => Promise<void>;
  deleteStudent: (id: string) => Promise<void>;
}

export const useStudentStore = create<StudentStore>((set, get) => ({
  students: [],
  currentStudent: null,
  currentFees: null,
  currentFeesHistory: null,
  currentPayments: null,
  loading: false,
  error: null,
  
  fetchStudents: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const isElectron = window.electron && window.electron.ipcRenderer;
      
      if (isElectron) {
        const result = await window.electron.ipcRenderer.invoke('student:list', filters);
        // Data is already in snake_case from DB
        set({ students: result.students, loading: false });
      } else {
        // Web Mode (Chrome): Fetch from Supabase directly
        if (!supabase) throw new Error('Supabase not configured for Web');
        
        let query = supabase.from('students').select('*').eq('deleted', false);
        
        if (filters.search) {
            query = query.ilike('search_text', `%${filters.search}%`);
        }
        
        const { data, error } = await query;
        
        if (error) {
             console.error("Supabase Error:", error);
             throw error;
        }
        
        set({ students: (data || []) as Student[], loading: false });
      }
    } catch (error: any) {
      console.error("Fetch error:", error);
      set({ error: error.message, loading: false });
    }
  },
  
  getStudent: async (id) => {
    set({ loading: true, error: null });
    try {
      if (window.electron && window.electron.ipcRenderer) {
        const result = await window.electron.ipcRenderer.invoke('student:get', id);
        if (result.success) {
          set({ 
              currentStudent: result.student, 
              currentFees: result.fees, 
              currentFeesHistory: result.feesHistory,
              currentPayments: result.payments,
              loading: false 
          });
        } else {
          set({ error: result.error, loading: false });
        }
      } else {
        // Web Mode
        if (!supabase) throw new Error('Supabase not configured');
        const { data: student, error: sErr } = await supabase.from('students').select('*').eq('id', id).single();
        if (sErr) throw sErr;
        
        const { data: feesHistory } = await supabase.from('student_fees').select('*').eq('student_id', id).order('school_year', { ascending: false });
        const fees = feesHistory && feesHistory.length > 0 ? feesHistory[0] : null;

        const { data: payments } = await supabase.from('student_payments').select('*').eq('student_id', id).order('payment_date', { ascending: false });
        
        set({ 
            currentStudent: student as Student, 
            currentFees: fees,
            currentFeesHistory: feesHistory || [],
            currentPayments: payments || [],
            loading: false 
        });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  
  createStudent: async (data) => {
    set({ loading: true, error: null });
    try {
      if (window.electron && window.electron.ipcRenderer) {
        const result = await window.electron.ipcRenderer.invoke('student:create', data);
        if (result.success) {
          await get().fetchStudents(); 
        } else {
          set({ error: result.error, loading: false });
        }
      } else {
         if (!supabase) throw new Error('Supabase not configured');
         
         // 1. Generate ID
         const id = crypto.randomUUID();
         
         // 2. Generate Registration Number
         // Query max registration number for current year
         const year = new Date().getFullYear();
         const { data: maxRegData } = await supabase
            .from('students')
            .select('registration_number')
            .ilike('registration_number', `${year}-%`)
            .order('registration_number', { ascending: false })
            .limit(1)
            .single();
            
         let nextNum = 1;
         if (maxRegData && maxRegData.registration_number) {
             const parts = maxRegData.registration_number.split('-');
             if (parts.length === 2) {
                 nextNum = parseInt(parts[1], 10) + 1;
             }
         }
         const registration_number = `${year}-${String(nextNum).padStart(5, '0')}`;
         
         // 3. Prepare Payload
         const payload = {
             ...data,
             id,
             registration_number,
             enrollment_date: data.enrollment_date || new Date().toISOString().split('T')[0],
             updated_at: new Date().toISOString(),
             sync_status: 'synced', // It's already in cloud
             deleted: false
         };
         
         // Remove undefined
         Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

         const { error: insertError } = await supabase
            .from('students')
            .insert(payload);
            
         if (insertError) throw insertError;
         
         await get().fetchStudents();
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  
  updateStudent: async (id, data) => {
      set({ loading: true, error: null });
      try {
          if (window.electron && window.electron.ipcRenderer) {
            // Data is already snake_case, pass it directly
            const result = await window.electron.ipcRenderer.invoke('student:update', id, data);
             if (result.success) {
              await get().fetchStudents();
               const current = get().currentStudent;
               if (current && current.id === id) {
                   await get().getStudent(id);
               }
            } else {
              set({ error: result.error, loading: false });
            }
          } else {
             // Web Mode: Update Supabase
             if (!supabase) throw new Error('Supabase not configured');
             
             const payload = {
                 ...data,
                 updated_at: new Date().toISOString(),
                 sync_status: 'synced'
             };
             
             const { error: updateError } = await supabase
                .from('students')
                .update(payload)
                .eq('id', id);
                
             if (updateError) throw updateError;
             
             await get().fetchStudents();
             const current = get().currentStudent;
             if (current && current.id === id) {
                 await get().getStudent(id);
             }
          }
      } catch (error: any) {
          set({ error: error.message, loading: false });
      }
  },

  deleteStudent: async (id) => {
      set({ loading: true, error: null });
      try {
          if (window.electron && window.electron.ipcRenderer) {
            const result = await window.electron.ipcRenderer.invoke('student:delete', id);
            if (result.success) {
               await get().fetchStudents();
            } else {
              set({ error: result.error, loading: false });
            }
          } else {
             // Web Mode: Soft Delete
             if (!supabase) throw new Error('Supabase not configured');
             
             const { error: deleteError } = await supabase
                .from('students')
                .update({ deleted: true, updated_at: new Date().toISOString() })
                .eq('id', id);
                
             if (deleteError) throw deleteError;
             
             await get().fetchStudents();
          }
      } catch (error: any) {
          set({ error: error.message, loading: false });
      }
  }
}));

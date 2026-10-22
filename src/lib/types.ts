export type Role = 'professional' | 'company' | 'admin';
export type WorkMode = 'presencial' | 'hibrido' | 'remoto';
export type JobStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'paused' | 'closed' | 'rejected';
export type Stage = 'received' | 'pre_selected' | 'sent_to_company' | 'interview' | 'company_review' | 'approved' | 'rejected' | 'hired';
export type ChargeKind = 'activation' | 'job_credit' | 'course';
export type ChargeStatus = 'awaiting' | 'confirmed' | 'cancelled' | 'failed';

export interface Profile {
  id: string; role: Role; full_name: string; email: string; phone: string | null; created_at: string;
}

export interface Education { curso: string; instituicao: string; conclusao?: string }
export interface Experience { cargo: string; empresa: string; inicio?: string; fim?: string; descricao?: string }

export interface ProfessionalProfile {
  user_id: string; whatsapp: string | null; city: string | null; state: string | null; area: string | null;
  desired_role: string | null; experience_level: string | null; education: Education[]; certifications: string | null;
  hard_skills: string[]; soft_skills: string[]; languages: string[]; experiences: Experience[];
  availability: string | null; work_mode: WorkMode | null; salary_expectation: number | null; salary_negotiable: boolean;
  linkedin_url: string | null; additional_info: string | null; about_profile: string | null; qualities: string | null;
  why_hire: string | null; visible_to_companies: boolean; allow_contact: boolean;
  activation_status: 'pending' | 'active'; activated_at: string | null; wizard_step: number; updated_at: string;
}

export interface Company {
  id: string; owner_id: string; name: string; cnpj: string | null; responsible_name: string; responsible_role: string | null;
  corporate_email: string; phone: string | null; whatsapp: string | null; city: string | null; state: string | null;
  sector: string | null; website: string | null; description: string | null; verified: boolean; suspended: boolean;
  credit_balance: number; show_name_publicly: boolean; created_at: string;
}

export interface Job {
  id: string; company_id: string | null; area: string; title: string; requirements_required: string[];
  requirements_desired: string[]; openings: number; start_type: 'imediato' | 'data' | 'a_combinar'; start_date: string | null;
  pay_type: string; salary_min: number | null; salary_max: number | null; pay_notes: string | null; benefits: string | null;
  work_mode: WorkMode; city: string | null; state: string | null; address: string | null; contract_type: string;
  schedule: string | null; hire_deadline: string | null; notes: string | null; receive_via: string; receive_email: string | null;
  status: JobStatus; review_note: string | null; billing_exempt: boolean; published_at: string | null;
  expires_at: string | null; paused_reason: string | null; created_at: string;
  company_name?: string | null; company_sector?: string | null;
}

export interface Application {
  id: string; job_id: string; professional_id: string; stage: Stage; cover_note: string | null; favorite: boolean;
  interview_at: string | null; created_at: string; hired_confirmed_at: string | null;
}

export interface Transaction {
  id: string; user_id: string; company_id: string | null; kind: ChargeKind; reference_id: string | null; amount: number;
  status: ChargeStatus; txid: string; proof_path: string | null; admin_note: string | null; confirmed_at: string | null; created_at: string;
}

export interface Course {
  id: string; slug: string; title: string; cover_url: string | null; description: string; area: string; instructor: string;
  syllabus: string | null; workload_hours: number; level: 'iniciante' | 'intermediario' | 'avancado'; price: number;
  prerequisites: string | null; status: 'draft' | 'published' | 'paused'; created_at: string;
}

export interface Module { id: string; course_id: string; title: string; position: number }
export interface Lesson {
  id: string; module_id: string; title: string; content: string | null; video_url: string | null;
  material_url: string | null; position: number; duration_min: number | null;
}
export interface Enrollment { id: string; course_id: string; user_id: string; status: 'pending_payment' | 'active' | 'completed' | 'cancelled'; completed_at: string | null; created_at: string }
export interface Notification { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export interface Resume { id: string; user_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; is_current: boolean; created_at: string }

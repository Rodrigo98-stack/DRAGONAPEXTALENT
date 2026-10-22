import type { JobStatus, Stage } from './types';

export const AREAS = [
  'Administrativo', 'Comercial e Vendas', 'Atendimento', 'Tecnologia', 'Marketing', 'Financeiro e Contábil',
  'Recursos Humanos', 'Jurídico', 'Engenharia', 'Saúde', 'Educação', 'Logística', 'Indústria e Produção',
  'Construção Civil', 'Hotelaria e Gastronomia', 'Varejo', 'Design e Criação', 'Outras',
];

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const LEVELS: Record<string, string> = {
  estagio: 'Estágio', junior: 'Júnior', pleno: 'Pleno', senior: 'Sênior', especialista: 'Especialista', gestao: 'Gestão',
};

export const WORK_MODES: Record<string, string> = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };

export const CONTRACTS: Record<string, string> = {
  clt: 'CLT', pj: 'PJ', freelancer: 'Freelancer', estagio: 'Estágio', jovem_aprendiz: 'Jovem Aprendiz',
  temporario: 'Temporário', prazo_determinado: 'Prazo determinado', outra: 'Outra',
};

export const PAY_TYPES: Record<string, string> = {
  a_combinar: 'A combinar', faixa: 'Faixa salarial', fixo: 'Valor fixo', hora: 'Por hora', comissao: 'Comissão', outra: 'Outra',
};

export const JOB_STATUS: Record<JobStatus, { label: string; tone: string }> = {
  draft: { label: 'Rascunho', tone: 'muted' },
  in_review: { label: 'Em revisão', tone: 'info' },
  approved: { label: 'Aprovada — pronta para publicar', tone: 'silver' },
  published: { label: 'Publicada', tone: 'ok' },
  paused: { label: 'Pausada', tone: 'warn' },
  closed: { label: 'Encerrada', tone: 'muted' },
  rejected: { label: 'Ajustes necessários', tone: 'bad' },
};

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'received', label: 'Candidatura recebida' },
  { id: 'pre_selected', label: 'Pré-selecionados' },
  { id: 'sent_to_company', label: 'Currículo enviado à empresa' },
  { id: 'interview', label: 'Entrevista agendada' },
  { id: 'company_review', label: 'Em avaliação pela empresa' },
  { id: 'approved', label: 'Aprovado' },
  { id: 'rejected', label: 'Reprovado / encerrado' },
  { id: 'hired', label: 'Contratação confirmada' },
];
export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;

export const TALENT_STATUS: Record<string, string> = {
  novo: 'Novo talento', em_analise: 'Perfil em análise', aprovado_banco: 'Aprovado para o banco',
  compativel_futuro: 'Compatível com vaga futura', encaminhado: 'Encaminhado para empresa', em_processo: 'Em processo seletivo',
  contratado: 'Contratado', arquivado: 'Arquivado', aguardando_atualizacao: 'Aguardando atualização',
};

export const COURSE_LEVELS: Record<string, string> = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };

export const CHARGE_KIND: Record<string, string> = {
  activation: 'Taxa de ativação do perfil', job_credit: 'Créditos para publicação de vagas', course: 'Curso de capacitação',
};
export const CHARGE_STATUS: Record<string, string> = {
  awaiting: 'Aguardando pagamento', confirmed: 'Confirmado', cancelled: 'Cancelado', failed: 'Falhou',
};

export const CONTACT = { city: 'Recife — PE' }; // e-mail, WhatsApp e redes: preencha quando houver canais oficiais

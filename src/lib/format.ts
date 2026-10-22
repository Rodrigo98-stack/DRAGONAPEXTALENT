const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (v: number | null | undefined) => brl.format(Number(v ?? 0));
export const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—');
export const dateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const daysLeft = (v: string | null | undefined) =>
  v ? Math.max(0, Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000)) : 0;

export const splitList = (s: string) => s.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean);

/** Traduz as exceções levantadas pelas funções do banco em mensagens claras. */
const ERRORS: Record<string, string> = {
  saldo_insuficiente: 'Saldo insuficiente. Adicione créditos via PIX para publicar por esse período.',
  vaga_precisa_estar_aprovada: 'A vaga precisa ser aprovada pela equipe antes de ser publicada.',
  dias_invalidos: 'Escolha entre 1 e 90 dias de publicação.',
  perfil_ja_ativo: 'Seu perfil já está ativo.',
  acesso_negado: 'Você não tem permissão para esta ação.',
  empresa_suspensa: 'Conta empresarial suspensa. Fale com a DRAGON APEX TALENT.',
  muitas_mensagens_aguarde: 'Você enviou muitas mensagens. Aguarde alguns minutos.',
  termos_nao_aceitos: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.',
  curso_bloqueado: 'Este conteúdo é liberado após a confirmação do pagamento.',
  valor_invalido: 'Valor inválido para recarga.',
  vaga_bloqueada_para_edicao: 'Vagas publicadas, pausadas ou encerradas não podem ser editadas.',
  'duplicate key value violates unique constraint "applications_job_id_professional_id_key"': 'Você já se candidatou a esta vaga.',
  'new row violates row-level security policy for table "applications"': 'Ative seu perfil (taxa de R$ 0,15) para se candidatar.',
  senha_fraca: 'A senha precisa ter 8+ caracteres, com letras e números.',
  use_minha_conta: 'Para a sua própria senha, use o bloco "Minha conta" nas configurações.',
  nao_permitido_para_admin: 'Não é possível redefinir a senha de outro administrador.',
  usuario_nao_encontrado: 'Usuário não encontrado.',
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  'User already registered': 'Este e-mail já possui cadastro.',
  'Email address not authorized': 'Cadastros temporariamente indisponíveis para este e-mail: o envio de e-mails da plataforma ainda está em configuração.',
  'email rate limit exceeded': 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.',
  'Database error saving new user': 'Não foi possível concluir o cadastro. Confira os dados e o aceite dos termos.',
};

export function humanError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  const key = Object.keys(ERRORS).find((k) => msg.includes(k));
  return key ? ERRORS[key] : msg;
}

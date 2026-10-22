import type { ReactNode } from 'react';
import { PageHeader } from '../../components/ui';

function Doc({ children }: { children: ReactNode }) {
  return (
    <section className="container-x max-w-3xl py-16">
      <div className="space-y-6 leading-relaxed text-white/70 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </section>
  );
}

const updated = 'Versão 1.0';

export function Privacy() {
  return (
    <>
      <PageHeader eyebrow="LGPD" title="Política de Privacidade">{updated}. Este texto é um modelo e deve ser revisado por assessoria jurídica antes da publicação oficial.</PageHeader>
      <Doc>
        <p>A DRAGON APEX TALENT trata dados pessoais para conectar profissionais a oportunidades de trabalho, conforme a Lei nº 13.709/2018 (LGPD).</p>
        <h2>Dados que coletamos</h2>
        <ul>
          <li>Identificação e contato: nome, e-mail, telefone/WhatsApp, cidade e estado.</li>
          <li>Dados profissionais: formação, experiências, competências, idiomas, pretensão salarial, currículo e textos de apresentação.</li>
          <li>Empresas: razão social, CNPJ, responsável, contatos e informações das vagas.</li>
          <li>Pagamentos: valor, data, status e identificador da transação PIX. Não armazenamos dados bancários.</li>
        </ul>
        <h2>Finalidades e bases legais</h2>
        <ul>
          <li>Execução do serviço de recrutamento e seleção (execução de contrato).</li>
          <li>Banco de talentos para oportunidades futuras (consentimento, revogável a qualquer momento).</li>
          <li>Cobranças e prevenção a fraudes (obrigação legal e legítimo interesse).</li>
        </ul>
        <h2>Compartilhamento</h2>
        <p>Seu perfil e currículo só são acessados por empresas das vagas às quais você se candidatou, ou com seu consentimento, e pela equipe autorizada. Currículos não são enviados a canais externos sem autorização explícita. Não vendemos dados.</p>
        <h2>Segurança e retenção</h2>
        <p>Arquivos ficam em armazenamento privado, acessíveis apenas por links temporários. O acesso é controlado por perfil (profissional, empresa, administração). Perfis do banco de talentos são revisados periodicamente e podem ser descartados após o prazo de retenção definido pela administração.</p>
        <h2>Seus direitos</h2>
        <p>Você pode acessar, corrigir, restringir a visibilidade e solicitar a exclusão dos seus dados pelo painel ou pela página de contato.</p>
      </Doc>
    </>
  );
}

export function Terms() {
  return (
    <>
      <PageHeader eyebrow="Condições" title="Termos de Uso">{updated}. Este texto é um modelo e deve ser revisado por assessoria jurídica antes da publicação oficial.</PageHeader>
      <Doc>
        <h2>1. Serviço</h2>
        <p>A plataforma oferece cadastro de profissionais, publicação de vagas por empresas, apoio ao recrutamento, banco de talentos e cursos de capacitação.</p>
        <h2>2. Cobranças</h2>
        <ul>
          <li>Profissionais: taxa única de ativação de perfil, no valor exibido antes da cobrança.</li>
          <li>Empresas: valor diário por vaga publicada e ativa, debitado da carteira de créditos conforme os dias escolhidos.</li>
          <li>Cursos: preço indicado em cada curso.</li>
          <li>Todos os pagamentos são feitos exclusivamente via PIX e liberados somente após a confirmação.</li>
        </ul>
        <h2>3. Responsabilidades</h2>
        <p>As informações cadastradas devem ser verdadeiras. A decisão de contratação é da empresa contratante; o índice de compatibilidade é apenas uma ferramenta de apoio. É proibido publicar vagas discriminatórias, enganosas ou ilegais.</p>
        <h2>4. Suspensão</h2>
        <p>Contas que violem estes termos podem ser suspensas. Vagas podem ser recusadas ou pausadas pela administração.</p>
        <h2>5. Privacidade</h2>
        <p>O tratamento de dados segue a Política de Privacidade.</p>
      </Doc>
    </>
  );
}

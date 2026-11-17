/* oxlint-disable next/no-html-link-for-pages -- No app publicado (vinext), o <Link> do Next não navega: o clique fica na mesma página ("RSC prefetch setup error"). Use <a> com navegação completa. */
import { DeleteAccountForm } from './delete-account-form';

export const metadata = { title: 'Excluir conta — UfaProva' };

export default function ExcluirContaPage() {
  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-800"><article className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm md:p-12"><a href="/" className="text-sm font-semibold text-blue-700">← Voltar para a página inicial</a><h1 className="mt-8 text-3xl font-bold">Excluir conta do UfaProva</h1><div className="mt-8 space-y-6 leading-7">
    <section><h2 className="text-xl font-semibold">O que é apagado</h2><p>Nome, e-mail, senha, CPF, telefone, foto do perfil e a ligação com o Google. Todas as sessões são encerradas, no portal e no aplicativo. Para alunos, a foto enviada e o vínculo com o cadastro da escola também saem. A exclusão é imediata e não pode ser desfeita.</p></section>
    <section><h2 className="text-xl font-semibold">O que continua</h2><p>Alunos, turmas, provas, questões e notas pertencem à escola e continuam com ela. O registro de que a conta foi excluída fica no histórico de segurança, sem dados pessoais. Os registros de pagamento da escola também são mantidos.</p><p className="mt-2">Se você é o único administrador de uma escola com outras pessoas, ou de uma escola com assinatura ativa, passe a administração ou cancele a assinatura antes.</p></section>
    <section><h2 className="text-xl font-semibold">Excluir agora</h2><div className="mt-3"><DeleteAccountForm /></div></section>
  </div></article></main>;
}
